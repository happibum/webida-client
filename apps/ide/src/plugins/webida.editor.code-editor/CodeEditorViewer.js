/*
 * Copyright (c) 2012-2015 S-Core Co., Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * CodeEditorViewer for code-base EditorParts
 *
 * Still needs refactoring (2015.06.25, hw.shim)
 *
 * @constructor
 * @see CodeEditorPart
 * @refactor: hw.shim (2015.06.25)
 */

// @formatter:off
define([
	'require',
	'webida-lib/util/genetic',
	'external/lodash/lodash.min',
	'external/codemirror/lib/codemirror',
    './content-assist/switch-tern',
    'webida-lib/plugins/editors/plugin',
	'webida-lib/util/loadCSSList',
	'webida-lib/util/logger/logger-client',
	'plugins/webida.editor.text-editor/TextEditorViewer',
	'./snippet',
    'dojo/topic'
], function (
	require,
	genetic,
	_,
	codemirror,
    switchTern,
    editors,
	loadCSSList,
	Logger,
	TextEditorViewer,
	Snippet,
    topic
) {
    'use strict';
// @formatter:on

    var logger = new Logger();
    //logger.setConfig('level', Logger.LEVELS.log);
    //logger.off();

    var settings = {
        useWorker: true,
        gotoLinkEnabled: true,
        autoHint: true,
        autoHintDelay: 300
    };

    var _localHinterSchemes = [];
    var _globalHinterSchemes = [];

    var hintersMap = {
        'javascript': {
            name: 'javascript',
            requires: []
        },
        'coffee': {
            name: 'coffeescript',
            requires: ['external/codemirror/addon/hint/javascript-hint']
        },
        'html': {
            name: 'html',
            requires: ['external/codemirror/addon/hint/xml-hint',
                       'external/codemirror/addon/hint/html-hint']
        },
        'htmlLink': {
            name: 'htmlLink',
            requires: ['./content-assist/html-hint-link']
        },
        'htmlSmart': {
            name: 'htmlSmart',
            requires: ['./content-assist/html-hint']
        },
        'xml': {
            name: 'xml',
            requires: ['external/codemirror/addon/hint/xml-hint']
        },
        'css': {
            name: 'css',
            requires: ['external/codemirror/addon/hint/css-hint']
        },
        'cssSmart': {
            name: 'cssSmart',
            requires: ['./content-assist/css-hint']
        },
        'word': {
            name: 'anyword',
            requires: ['external/codemirror/addon/hint/anyword-hint']
        },
        'py': {
            name: 'python',
            requires: ['external/codemirror/addon/hint/python-hint']
        }
    };

    var hinterMapper = function (hinter) {
        return hintersMap[hinter];
    };

    var eventTransformers = {
        // TODO 예전 에이스 에디터의 잔해
        // row, col 사용은 제거해도 무방할 듯
        wrapperLoc2cmLoc: function (loc) {
            if (loc.hasOwnProperty('row') && loc.hasOwnProperty('col')) {
                return {
                    line: loc.row,
                    ch: loc.col
                };
            } else {
                return loc;
            }
        },
        cmLoc2wrapperLoc: function (loc) {
            if (loc.hasOwnProperty('line') && loc.hasOwnProperty('ch')) {
                return {
                    row: loc.line,
                    col: loc.ch
                };
            } else {
                return loc;
            }
        },
        change: function (self, listener) {
            return function (_, e) {
                var event;
                if (e.removed.length > 1 || e.removed[0] !== '') {
                    // something removed
                    event = {};
                    event.range = {
                        start: eventTransformers.cmLoc2wrapperLoc(e.from),
                        end: eventTransformers.cmLoc2wrapperLoc(e.to)
                    };
                    event.text = e.removed.join('\n');
                    event.data = e;
                    listener(self, event);
                }
                if (e.text.length > 1 || e.text[0] !== '') {
                    // something inserted
                    event = {type: 'insert'};
                    var end = eventTransformers.cmLoc2wrapperLoc(e.from);
                    end.row += e.text.length - 1;
                    if (e.text.length === 1) {
                        end.col += e.text[0].length;
                    } else {
                        end.col = e.text[e.text.length - 1].length;
                    }
                    event.range = {
                        start: eventTransformers.cmLoc2wrapperLoc(e.from),
                        end: end
                    };
                    event.text = e.text.join('\n');
                    event.data = e;
                    listener(self, event);
                }
            };
        },
        cursor: function (self, listener) {
            return function () {
                listener(self);
            };
        }
    };

    codemirror.commands.linecomment = function (cm) {
        if (cm.__instance) {
            var from = cm.getCursor('from');
            var to = cm.getCursor('to');
            var mode1 = cm.getModeAt(from);
            var mode2 = cm.getModeAt(to);

            if (mode1.lineComment && mode1.lineComment === mode2.lineComment) {
                var doc = cm.getDoc();
                var commenting = false;
                var line;
                var commentStr = mode1.lineComment;
                doc.eachLine(from.line, to.line + 1, function (h) {
                    var i, text = h.text;
                    var commented =
                        (i = text.indexOf(commentStr)) >= 0 &&
                        !/\S/.test(text.substring(0, i));

                    // if there is at least one uncommented line, then we are commenting.
                    commenting = commenting || !commented;
                });
                if (commenting) {
                    for (line = from.line; line <= to.line; line++) {
                        doc.replaceRange(commentStr, {line: line, ch: 0});
                    }
                } else {
                    var len = commentStr.length;
                    for (line = from.line; line <= to.line; line++) {
                        var i, text = doc.getLine(line);
                        i = text.indexOf(commentStr);
                        doc.replaceRange('', {line: line, ch: i}, {line: line, ch: i + len});
                    }
                }
                return;
            }
            return codemirror.Pass;
        }
    };
    codemirror.commands.blockcomment = function (cm) {
        if (cm.__instance) {
            var doc = cm.getDoc();
            var from = cm.getCursor('from');
            var to = cm.getCursor('to');
            var lastLine = doc.getLine(to.line);

            var mode = cm.getModeAt(from);
            var commenting = (cm.getTokenAt(to, true).type !== 'comment');
            var bcStart = mode.blockCommentStart, bcEnd = mode.blockCommentEnd;
            if (commenting) {
                doc.replaceRange('\n' + bcEnd, { line: to.line, ch: lastLine.length });
                doc.replaceRange(bcStart + '\n', { line: from.line, ch: 0 });
            } else {
                // uncommenting
                var comments =
                    getEnclosingBlockComments(mode, cm, from, to, bcStart, bcEnd);
                if (comments.length === 1) {
                    var comment = comments[0];
                    doc.replaceRange('',
                                     { line: comment[1].line, ch: comment[1].ch - bcEnd.length },
                                     comment[1]);
                    doc.replaceRange('',
                                     comment[0],
                                     { line: comment[0].line, ch: comment[0].ch + bcStart.length });
                } else {
                    console.error('assertion fail: unreachable');
                }
            }
        }
    };
    codemirror.commands.commentOutSelection = function (cm) {
        if (cm.__instance) {
            var from = cm.getCursor('from');
            var to = cm.getCursor('to');
            var mode = cm.getModeAt(from);
            var bcStart = mode.blockCommentStart, bcEnd = mode.blockCommentEnd;

            var doc = cm.getDoc();
            doc.replaceRange(bcEnd, to);
            doc.replaceRange(bcStart, from);
        }
    };
    function foldCode(cm, start, end) {
        var myWidget = $('<span class="CodeMirror-foldmarker">').text('\u2194')[0];
        codemirror.on(myWidget, 'mousedown', function () { myRange.clear(); });
        var myRange = cm.markText(start, end, {
            replacedWith: myWidget,
            clearOnEnter: true,
            __isFold: true
        });
    }
    codemirror.commands.foldselection = function (cm) {
        foldCode(cm, cm.getCursor('start'), cm.getCursor('end'));
    };

    codemirror.commands.gotoLine = function (cm) {
        if (cm.getOption('keyMap') === 'default') {
            var dialog = 'Go to line: <input type="text" style="width: 10em"/> <span style="color: #888"></span>';
            loadCSSList([require.toUrl('external/codemirror/addon/dialog/dialog.css')], function () {
                require(['external/codemirror/addon/dialog/dialog'], function () {
                    cm.openDialog(dialog, function (query) {
                        var line = Math.floor(+query - 1);
                        cm.__instance.setCursor({row: line, col: 0});
                    });
                });
            });
        } else {
            return codemirror.Pass;
        }
    };
    codemirror.commands.handleTab = function (cm) {
        if (cm.__instance.options.setSnippetEnabled) {
            if (Snippet.navigateSnippet(cm) || Snippet.expandSnippet(cm)) {
                return undefined;
            }
        }
        if (!cm.__instance.options.indentWithTabs) {
            codemirror.commands.insertSoftTab(cm);
        } else {
            return codemirror.Pass;
        }
    };
    codemirror.commands.navigateSnippetBackward = function (cm) {
        if (!Snippet.navigateSnippet(cm, true)) {
            return codemirror.Pass;
        }
    };

    // Manage available themes and modes
    var availables = ['mode::text/plain'];
    function addAvailable(type, name) {
        if (!isAvailable(type, name)) {
            availables.push(type + '::' + name);
        }
    }
    function isAvailable(type, name) {
        return _.contains(availables, type + '::' + name);
    }

    codemirror.commands.save = function(cm) {
        topic.publish('editor/save/current');
    };

    function CodeEditorViewer(elem, file, startedListener) {
    	logger.info('new CodeEditorViewer()');
    	TextEditorViewer.apply(this, arguments);
        var self = this;
        this.elem = elem;
        this.setParentNode(elem);
        this.file = file;
        this.options = {};
        this.options.extraKeys = {
            'Ctrl-Space': 'autocomplete',
            'Ctrl-/': 'linecomment',
            'Tab': 'handleTab',
            'Shift-Tab': 'navigateSnippetBackward',
            'Ctrl--': 'foldselection',
            'Ctrl-D': 'gotoLine',
        };
        this.cursorListeners = [];
        this.focusListeners = [];
        this.blurListeners = [];
        this.deferredActions = [];
        this.mode = '';
        this.mappedMode = 'text/plain';
        this.settings = settings;

        if (startedListener) {
            this.addDeferredAction(function (self) {
                startedListener(file, self);
            });
        }

        loadCSSList([require.toUrl('plugins/webida.editor.text-editor/css/webida.css'),
                     require.toUrl('external/codemirror/lib/codemirror.css'),
                     require.toUrl('external/codemirror/addon/dialog/dialog.css')], function () {
            require(['external/codemirror/addon/dialog/dialog',
                     'external/codemirror/addon/search/searchcursor',
                     'plugins/webida.editor.text-editor/search-addon',
                     './addon/overview-ruler/overview-ruler',
                     'external/codemirror/addon/edit/closebrackets',
                     'external/codemirror/addon/edit/closetag',
                     'external/codemirror/addon/edit/matchbrackets'], function () {
                setTimeout(function(self){
                	if (self.getParentNode()) {
                		self.createAdapter(self.getParentNode());
                	}
                }, 0, self);
            });
        });
    }

    function getEnclosingBlockComments(mode, editor, from, to) {
        var startStr = mode.blockCommentStart;
        var endStr = mode.blockCommentEnd;
        var doc = editor.getDoc();
        var endStrLen = endStr.length;
        var state = 'closed';
        var comments = [];
        var openingPos;
        var lineComment = mode.lineComment;
        var done = false;
        function comparePos(p1, p2) {
            if (p1.line < p2.line) {
                return -1;
            } else if (p1.line > p2.line) {
                return 1;
            } else {
                return p1.ch - p2.ch;
            }
        }

        // collect block comments in the code
        doc.eachLine(function (h) {

            var lineNo, text;

            function findCommentStart(i) {
                if (state !== 'closed') {
                    throw new Error('assertion fail: unrechable');
                }

                if (comparePos({ line: lineNo, ch: i }, to) >= 0) {
                    done = true;
                    return;
                }

                var j = text.indexOf(startStr, i);
                if (j >= i) {
                    var pos = { line: lineNo, ch: j + 1 };
                    var token = editor.getTokenAt(pos, true);
                    if (token && token.string.indexOf(startStr) === 0) {
                        if (comparePos({ line: lineNo, ch: j }, to) < 0) {
                            // found an opening of a block comment
                            state = 'opened';
                            openingPos = { line: lineNo, ch: j };
                            findCommentEnd(j + startStr.length);
                        } else {
                            done = true;
                            return;
                        }
                    }
                }
            }

            function findCommentEnd(i) {
                if (state !== 'opened') {
                    throw new Error('assertion fail: unrechable');
                }
                var j = text.indexOf(endStr, i);
                if (j >= i) {
                    var pos = { line: lineNo, ch: j + 1 };
                    var token = editor.getTokenAt(pos, true);
                    if (token && token.string.substr(-endStrLen) === endStr &&
                        (!lineComment || token.string.indexOf(lineComment) !== 0)) {
                        // found an closing of a block comment
                        state = 'closed';
                        var closingPos;
                        if (comparePos(from, (closingPos = { line: lineNo, ch: j + endStrLen })) < 0) {
                            comments.push([openingPos, closingPos]);
                        }
                        openingPos = null;

                        findCommentStart(j + endStrLen);
                    }
                }
            }

            if (!done) {
                lineNo = h.lineNo();
                text = h.text;
                if (state === 'closed') {
                    findCommentStart(0);
                } else if (state === 'opened') {
                    findCommentEnd(0);
                } else {
                    throw new Error('assertion fail: unreachable');
                }
            }
        });

        //console.log('hina temp: overlapping block comments: ');
        //console.debug(comments);

        // check if from-to overlaps any block comments
        // without being included or including the comments.
        var commentsLen = comments.length;
        if (commentsLen === 0) {
            return [];
        } else if (commentsLen === 1) {
            if (comparePos(comments[0][0], from) <= 0 && comparePos(to, comments[0][1]) <= 0) {
                return comments;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    function getBeautifier(editor, callback) {
        var currentModeName = editor.getMode().name;
        var beautifierModuleID;
        var beautifyOptions;
        /* jshint camelcase: false */
        if (currentModeName === 'javascript') {
            beautifierModuleID = 'external/js-beautify/js/lib/beautify';
            // TODO .editorconfig-aware options
            beautifyOptions = {
                jslint_happy: true,
                wrap_line_length: 120
            };
            require([beautifierModuleID], function (beautifier) {
                callback(beautifier.js_beautify, beautifyOptions);
            });
        } else if (currentModeName === 'htmlmixed') {
            beautifierModuleID = 'external/js-beautify/js/lib/beautify-html';
            require([beautifierModuleID], function (beautifier) {
                callback(beautifier.html_beautify, beautifyOptions);
            });
        } else if (currentModeName === 'css') {
            beautifierModuleID = 'external/js-beautify/js/lib/beautify-css';
            require([beautifierModuleID], function (beautifier) {
                callback(beautifier.css_beautify, beautifyOptions);
            });
        } else {
            // Shouldn't be reached
            callback();
        }
        /* jshint camelcase: true */
    }

    genetic.inherits(CodeEditorViewer, TextEditorViewer, {

		/**
		 * @override
		 */
        addOptions: function() {
            TextEditorViewer.prototype.addOptions.call(this);
            this.setOption('mode', this.mappedMode, isAvailable('mode', this.mode), 'text/plain');
        },

		/**
		 * @override
		 */
        createAdapter: function (parentNode) {

            TextEditorViewer.prototype.createAdapter.call(this, parentNode);

            var self = this;

            this.__applyLinter();

            this.editor.on('mousedown', function(cm, e) {
                if (settings.gotoLinkEnabled) {
                    require(['./content-assist/goto-link'], function(gotolink) {
                        gotolink.onMouseDown(cm, e);
                    });
                }
            });

            this.editor.on('keydown', function(cm, e) {
                if (settings.gotoLinkEnabled) {
                    require(['./content-assist/goto-link'], function(gotolink) {
                        gotolink.onKeyDown(cm, e);
                    });
                }
            });

            Snippet.init(self.editor);
        },

	    //TODO : inherit from TextEditorViewer
	    /**
	     * @override
	     */
	    setTheme : function (theme) {
	        if (theme === undefined) {
	            return;
	        }
	        if (theme === 'webida') {
	            theme = 'webida-dark';
	        }
	        this.theme = theme;
            if (theme === 'codemirror-default') {
                theme = this.theme = 'default';
                if (this.editor) {
	                this.editor.setOption('theme', this.theme);
	            }
	        } else {
	            var self = this;
	            var csspath = 'external/codemirror/theme/' + theme + '.css';
	            switch (theme) {
	            case 'webida-dark':
	                csspath = 'webida-lib/plugins/editors/themes/webida-dark.css';
	                break;
	            case 'webida-light':
	                csspath = 'webida-lib/plugins/editors/themes/webida-light.css';
	                break;
	            case 'solarized dark':
	            case 'solarized light':
	                csspath = 'external/codemirror/theme/solarized.css';
	                break;
	            }
	            loadCSSList([require.toUrl(csspath)], function () {
	                addAvailable('theme', theme);
	                if (self.editor) {
	                    self.editor.setOption('theme', self.theme);
	                }
	            });
	        }
	    },

	    setLinter : function (type, option) {
	        if (type === undefined || option === undefined) {
	            return;
	        }
	        if (! this.linters) {
	            this.linters = {};
	        }
	        var self = this;
	        switch (type) {
	        case 'js':
	            this.linters.js = option;
	            if (option) {
	                loadCSSList([
	                    require.toUrl('external/codemirror/addon/lint/lint.css'),
	                ], function () {
	                    require([
	                        'external/codemirror/addon/lint/lint',
	                        'external/codemirror/addon/lint/javascript-lint'
	                    ], function () {
	                        addAvailable('addon', 'lint');
	                        addAvailable('addon', 'javascript-lint');
	                        self.__applyLinter();
	                    });
	                });
	            } else {
	                this.__applyLinter();
	            }
	            break;
	        case 'json':
	            this.linters.json = option;
	            if (option) {
	                require(['./lib/lints/jsonlint'], function () {
	                    loadCSSList([
	                        require.toUrl('external/codemirror/addon/lint/lint.css')
	                    ], function () {
	                        require([
	                            'external/codemirror/addon/lint/lint',
	                            'external/codemirror/addon/lint/json-lint'
	                        ], function () {
	                            addAvailable('addon', 'lint');
	                            addAvailable('addon', 'json-lint');
	                            self.__applyLinter();
	                        });
	                    });
	                });
	            } else {
	                this.__applyLinter();
	            }
	            break;
	        case 'html':
	            this.linters.html = option;
	            if (option) {
	                loadCSSList([
	                    require.toUrl('external/codemirror/addon/lint/lint.css')
	                ], function () {
	                    require([
	                        'external/codemirror/addon/lint/lint',
	                    ], function () {
	                        require(['./content-assist/html-lint'], function () {
	                            addAvailable('addon', 'lint');
	                            addAvailable('addon', 'html-lint');
	                            self.__applyLinter();
	                        });
	                    });
	                });
	            }
	            break;
	        case 'css':
	            this.linters.css = option;
	            if (option) {
	                require(['./lib/lints/csslint'], function () {
	                    loadCSSList([
	                        require.toUrl('external/codemirror/addon/lint/lint.css')
	                    ], function () {
	                        require([
	                            'external/codemirror/addon/lint/lint',
	                            'external/codemirror/addon/lint/css-lint'
	                        ], function () {
	                            addAvailable('addon', 'lint');
	                            addAvailable('addon', 'css-lint');
	                            self.__applyLinter();
	                        });
	                    });
	                });
	            } else {
	                this.__applyLinter();
	            }
	            break;
	        }
	    },
	    __applyLinter : function () {
	        if (this.editor && this.linters && _.contains(['js', 'json', 'css', 'html'], this.mode)) {
	            if (this.linters[this.mode]) {
	                this._gutterOn('CodeMirror-lint-markers');
	                switch (this.mode) {
	                case 'js':
	                    if (isAvailable('addon', 'lint') && isAvailable('addon', 'javascript-lint')) {
	                        if ((typeof this.linters[this.mode]) === 'object') {
	                            var jshintrc = this.linters.js;
	                            this.editor.setOption('lint', {
	                                async: true,
	                                getAnnotations: function (editorValue, updateLinting, passOptions, editor) {
	                                    CodeEditorViewer.jsHintWorker(editorValue, jshintrc, function (data) {
	                                        updateLinting(editor, data.annotations);
	                                    });
	                                }
	                            });
	                        } else {
	                            this.editor.setOption('lint', {
	                                async: true,
	                                getAnnotations: function (editorValue, updateLinting, passOptions, editor) {
	                                    CodeEditorViewer.jsHintWorker(editorValue, false, function (data) {
	                                        updateLinting(editor, data.annotations);
	                                    });
	                                }
	                            });
	                        }
	                    }
	                    break;
	                case 'json':
	                    if (isAvailable('addon', 'lint') && isAvailable('addon', 'json-lint')) {
	                        this.editor.setOption('lint', true);
	                    }
	                    break;
	                case 'html':
	                    if (isAvailable('addon', 'lint') && isAvailable('addon', 'html-lint')) {
	                        this.editor.setOption('lint', true);
	                    }
	                    break;
	                case 'css':
	                    if (isAvailable('addon', 'lint') && isAvailable('addon', 'css-lint')) {
	                        this.editor.setOption('lint', true);
	                    }
	                    break;
	                }
	            } else {
	                this.editor.setOption('lint', false);
	                this._gutterOff('CodeMirror-lint-markers');
	            }
	        }
	    },

	    setHinters : function (mode, hinterNames) {
	        if (mode && hinterNames) {
	            var hinterSchms = _.filter(_.map(hinterNames, hinterMapper), _.identity);
	            var paths = ['external/codemirror/addon/hint/show-hint'];
	            _.each(hinterSchms, function (x) {
	                paths = _.union(paths, x.requires);
	            });
	            loadCSSList([require.toUrl('external/codemirror/addon/hint/show-hint.css')], function () {
	                require(paths, function () {
	                    _localHinterSchemes[mode] = hinterSchms;
	                });
	            });
	        }
	    },

	    setGlobalHinters : function (hinterNames) {
	        _globalHinterSchemes = [];
	        if (hinterNames) {
	            var hinterSchms = _.filter(_.map(hinterNames, hinterMapper), _.identity);
	            var paths = [];
	            _.each(hinterSchms, function (x) {
	                paths = _.union(paths, x.requires);
	            });
	            require(paths, function () {
	                _globalHinterSchemes = hinterSchms;
	            });
	        }
	    },

	    setAnywordHint : function (anywordHint) {
	        if (anywordHint) {
	            this.setGlobalHinters(['word']);
	        } else {
	            this.setGlobalHinters([]);
	        }
	    },

		/**
		 * @override
		 */
	    setCodeFolding : function (codeFolding) {
	        this.options.setCodeFolding = codeFolding;
	        if (codeFolding) {
	            var self = this;
	            loadCSSList([require.toUrl('plugins/webida.editor.text-editor/css/codefolding.css')], function () {
	                require(['external/codemirror/addon/fold/foldcode',
	                         'external/codemirror/addon/fold/foldgutter',
	                         'external/codemirror/addon/fold/brace-fold',
	                         'external/codemirror/addon/fold/xml-fold',
	                         'external/codemirror/addon/fold/comment-fold'], function () {
	                    self.addDeferredAction(function (self) {
	                        self._gutterOn('CodeMirror-foldgutter');
	                        var rf = new codemirror.fold.combine(codemirror.fold.brace, codemirror.fold.comment,
	                                                             codemirror.fold.xml);
	                        self.editor.setOption('foldGutter', {
	                            rangeFinder: rf
	                        });
	                    });
	                });
	            });
	        } else {
	            this.addDeferredAction(function (self) {
	                self.editor.setOption('foldGutter', false);
	                self._gutterOff('CodeMirror-foldgutter');
	            });
	        }
	    },
	    setSnippetEnabled : function (enabled) {
	        this.options.setSnippetEnabled = enabled;
	        if (!enabled) {
	            this.addDeferredAction(function (self) {
	                Snippet.clearSnippets(self.editor);
	            });
	        }
	    },

	    lineComment: function () {
            this.addDeferredAction(function (self) {
                var editor = self.editor;
                self.focus();

                // comment line
                editor.execCommand('linecomment');
            });
        },

        blockComment: function () {
            this.addDeferredAction(function (self) {
                var editor = self.editor;
                self.focus();

                // comment block
                editor.execCommand('blockcomment');
            });
        },

        commentOutSelection: function () {
            this.addDeferredAction(function (self) {
                var editor = self.editor;
                self.focus();

                // comment out
                editor.execCommand('commentOutSelection');
            });
        },

        beautifyCode: function () {
            this.addDeferredAction(function (self) {
                var editor = self.editor;
                self.focus();

                getBeautifier(editor, function (beautifier, options) {
                    if (beautifier) {
                        // reselect
                        var startPos = editor.getCursor('from'),
                            startPosOrig;
                        var endPos = editor.getCursor('to');
                        var endPosInfo = editor.lineInfo(endPos.line);

                        if (startPos.ch !== 0) {
                            startPosOrig = startPos;
                            startPos = {
                                line: startPos.line,
                                ch: 0
                            };
                        }
                        if (endPosInfo.text.length !== endPos.ch) {
                            endPos = {
                                line: endPos.line,
                                ch: endPosInfo.text.length
                            };
                        }

                        editor.replaceRange(beautifier(editor.getRange(startPos,
                                                                       endPos), options), startPos, endPos);
                    }
                });
            });
        },

        beautifyAllCode: function () {
            this.addDeferredAction(function (self) {
                var ANCHOR_STR = '_line_of_original_cursor_';
                var editor = self.editor;
                self.focus();

                getBeautifier(editor, function (beautifier, options) {
                    if (beautifier) {
                        var cursor = editor.getCursor();
                        var mode = editor.getModeAt(cursor);

                        editor.operation(function () {
                            if (mode.blockCommentStart) {
                                var anchorComment = mode.blockCommentStart +
                                    ANCHOR_STR + mode.blockCommentEnd;
                                editor.replaceRange(anchorComment + '\n', {
                                    line: cursor.line,
                                    ch: 0
                                }, {
                                    line: cursor.line,
                                    ch: 0
                                }, '+beautifyAll');
                            }

                            var startPos = {
                                line: editor.firstLine(),
                                ch: 0
                            };
                            var lastLine, endPos = {
                                line: (lastLine = editor.lastLine()),
                                ch: editor.getLine(lastLine).length
                            };
                            editor.replaceRange(beautifier(editor.getValue(),
                                                           options), startPos, endPos,
                                                '+beautifyAll');

                            if (mode.blockCommentStart) {
                                var i, j = -1;
                                for (i = 0; i < editor.lineCount(); i++) {
                                    var line = editor.getLine(i);
                                    if ((j = line.indexOf(ANCHOR_STR)) >= 0) {
                                        break;
                                    }
                                }
                                if (j >= 0) {
                                    var token = editor.getTokenAt({
                                        line: i,
                                        ch: j
                                    }, true);
                                    if (token.string.indexOf(mode.blockCommentEnd) >
                                        0) {
                                        editor.setCursor({
                                            line: i,
                                            ch: 0
                                        });
                                        editor.replaceRange('', {
                                            line: i,
                                            ch: 0
                                        }, {
                                            line: i + 1,
                                            ch: 0
                                        }, '+beautifyAll');
                                    }
                                }
                            }
                        });
                    }
                });
            });
        }
    });

    switchTern.installTern(CodeEditorViewer, settings, _localHinterSchemes, _globalHinterSchemes);

    CodeEditorViewer._whitespaceOverlay = {
        token: function (stream) {
            if (stream.eatWhile(/\S/)) { return null; }

            switch (stream.next()) {
            case ' ':
                return 'whitespace-space';
            case '\t':
                return 'whitespace-tab';
            }

            return 'whitespace';
        }
    };

    CodeEditorViewer.getEnclosingDOMElem = function () {
        return document.getElementById('editor');
    };

    CodeEditorViewer.getShortcuts = function () {
        return [
            { keys : 'shift+alt+P', title : 'TEST C, viable', desc: 'TEST, viable', viable: true },
            { keys : 'ctrl+shift+alt+V', title : 'TEST C 2, viable', desc: 'TEST, viable', viable: true },
            { keys : 'ctrl+shift+alt+U', title : 'TEST C, unviable', desc: 'TEST, viable' }
        ];
    };

    CodeEditorViewer.jsHintWorker = (function () {
        var listeners = {};
        var worker = null;
        return function (code, options, listener) {
            if (worker === null) {
                worker = new Worker(require.toUrl('./jshint-worker.js'));
                worker.onmessage = function (event) {
                    var data = event.data;
                    listeners[data.reqId](data);
                };
            }
            var reqId = _.uniqueId('jshint-worker-');
            worker.postMessage({
                reqId: reqId,
                code: code,
                options: options
            });
            listeners[reqId] = listener;
        };
    })();
    CodeEditorViewer.getAvailableModes = function () {
        return [
            'js', 'json', 'ts', 'html', 'css', 'less'
        ];
    };
    CodeEditorViewer.getAvailableThemes = function () {
        return [
            'codemirror-default', 'ambiance', 'aptana', 'blackboard', 'cobalt', 'eclipse', 'elegant', 'erlang-dark', 'lesser-dark',
            'midnight', 'monokai', 'neat', 'night', 'rubyblue', 'solarized dark', 'solarized light', 'twilight',
            'vibrant-ink', 'xq-dark', 'xq-light', 'webida-dark', 'webida-light'
        ];
    };
    CodeEditorViewer.getAvailableKeymaps = function () {
        return ['default', 'vim', 'emacs'];
    };


    CodeEditorViewer.isLineCommentable = function(editor) {
        var from = editor.getCursor('from');
        var to = editor.getCursor('to');
        var mode1 = editor.getModeAt(from);
        var mode2 = editor.getModeAt(to);
        return mode1.name === mode2.name &&
            mode1.lineComment && mode1.lineComment === mode2.lineComment;
    }

    CodeEditorViewer.isBlockCommentable = function(editor) {
        var doc = editor.getDoc();
        var from = editor.getCursor('from');
        var to = editor.getCursor('to');
        var from2 = {
            line: from.line,
            ch: 0
        };
        var to2 = {
            line: to.line,
            ch: doc.getLine(to.line).length
        };

        var mode1 = editor.getModeAt(from);
        var mode2 = editor.getModeAt(to);
        var comments;
        return mode1.name === mode2.name &&
            mode1.blockCommentStart &&
            mode1.blockCommentStart === mode2.blockCommentStart &&
            mode1.blockCommentEnd === mode2.blockCommentEnd &&
            ( comments = getEnclosingBlockComments(mode1, editor, from, to)) &&
            (comments.length === 1 ||
            	(( comments = getEnclosingBlockComments(mode1, editor, from2, to2)) && comments.length === 0));
    }

    CodeEditorViewer.selectionCommentable = function(editor) {
        var from = editor.getCursor('from');
        var to = editor.getCursor('to');

        if (from.line === to.line && from.ch === to.ch) {
            return false;
            // no selection
        }

        var mode1 = editor.getModeAt(from);
        var mode2 = editor.getModeAt(to);
        var comments;
        return mode1.name === mode2.name && mode1.blockCommentStart &&
            mode1.blockCommentStart === mode2.blockCommentStart &&
            mode1.blockCommentEnd === mode2.blockCommentEnd &&
            ( comments = getEnclosingBlockComments(mode1, editor, from, to)) && comments.length === 0;
    }

    return CodeEditorViewer;
});
