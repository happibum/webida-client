define([
    'require',
    'webida-lib/util/genetic',
    'external/lodash/lodash.min',
    'external/codemirror/lib/codemirror',
    'webida-lib/plugins/editors/plugin',
    'webida-lib/util/loadCSSList',
    'webida-lib/util/logger/logger-client',
    'plugins/webida.editor.text-editor/TextEditorViewer',
    'dojo/topic'
], function (
    require,
    genetic,
    _,
    codemirror,
    editors,
    loadCSSList,
    Logger,
    TextEditorViewer,
    topic
) {
    'use strict';

    var cursorAtAutoHintTypes = [
        {
            mode: ['javascript'],
            tokenTypes: ['variable', 'variable-2', 'property']
        },
        {
            mode: ['html', 'xml'],
            tokenTypes: ['tag', 'attribute', 'link']
        },
        {
            mode: ['css'],
            tokenTypes: ['tag', 'builtin', 'qualifier', 'property error', 'property']
        }
    ];

    function installTern(CodeEditorViewer, settings, _localHinterSchemes, _globalHinterSchemes) {
        codemirror.commands['tern-showtype'] = function (cm) {
            cm._ternAddon.showType(cm);
        };
        codemirror.commands['tern-gotodefinition'] = function (cm) {
            cm._ternAddon.jumpToDef(cm);
        };
        codemirror.commands['tern-jumpback'] = function (cm) {
            cm._ternAddon.jumpBack(cm);
        };
        codemirror.commands['tern-rename'] = function (cm) {
            cm._ternAddon.rename(cm);
        };

        function cursorAtAutoHint(cm, modeName, cursor, rightToken) {
            var token = cm.getTokenAt(cursor);

            if (_.find(cursorAtAutoHintTypes, function (obj) {
                    return _.contains(obj.mode, modeName) && _.contains(obj.tokenTypes, token.type);
                })) {
                return true;
            }

            // javascript
            if (token.type === null && token.string === '.') {
                if (!rightToken) {
                    return cursorAtAutoHint(cm, modeName, {line: cursor.line, ch: cursor.ch - 1}, token);
                }
            } else if (token.type === null && token.string === ')' && rightToken && rightToken.string === '.') {
                var matching = cm.findMatchingBracket(cursor, false);
                if (matching && matching.match, matching.to) {
                    return cursorAtAutoHint(cm, modeName, {line: matching.to.line, ch: matching.to.ch});
                }
            }

            // html
            if (token.type === null && token.string === '=') {
                if (!rightToken) {
                    if (cm.getTokenTypeAt({line: cursor.line, ch: cursor.ch - 1}) === 'attribute') {
                        return true;
                    }
                }
            } else if (/\battr-value-\w+\b/.test(token.type)) {
                return true;
            }


            return false;
        }

        function onBeforeShowHints(cm) {
            if (cm._ternAddon) {
                cm._ternAddon.closeArgHints(cm);
            }
        }

        codemirror.commands.autocomplete = function (cm, options) {
            if (options === undefined) {
                // call by explicit key (ctrl+space)
                if (cm.state.completionActive) {
                    cm.state.completionActive.close();
                    return;
                }
            }

            options = options || {};
            options.path = cm.__instance.file.path;
            options.async = true;
            options.useWorker = cm.__instance.settings.useWorker;
            options.beforeShowHints = onBeforeShowHints;

            var modeAt = cm.getModeAt(cm.getCursor());
            var modeName = modeAt && modeAt.name;

            if (modeName === undefined || modeName === null) {
                return;
            }
            cm._hintModeName = modeName;

            if (cm.state.completionActive && cm.state.completionActive.widget) {
                return;
            } else if (options.autoHint && !cursorAtAutoHint(cm, modeName, cm.getCursor())) {
                return;
            }

            codemirror.showHint(cm, hint, options);
        };

        function jshint(cm, callback) {
            if (cm._ternAddon) {
                cm._ternAddon.getHint(cm, callback);
            } else {
                startJavaScriptAssist(cm.__instance, cm, function () {
                    cm._ternAddon.getHint(cm, callback);
                });
            }
        }

        codemirror.registerHelper('hint', 'javascript', jshint);

        function mergeResult(resultAll, resultThis) {
            if (resultThis && resultThis.list) {
                if (!resultAll.from) {
                    resultAll.from = resultThis.from;
                    resultAll.to = resultThis.to;
                    resultAll.hintContinue = resultThis.hintContinue;
                }
                if (resultThis.list) {
                    _.each(resultThis.list, function (item) {
                        var text = (typeof item === 'string') ? item : item.text;
                        var found = _.find(resultAll.list, function (olditem) {
                            var oldtext = (typeof olditem === 'string') ? olditem : olditem.text;
                            return text === oldtext;
                        });
                        if (!found) {
                            resultAll.list.push(item);
                        }
                    });
                }
                resultAll.hintContinue = resultAll.hintContinue || resultThis.hintContinue;
            }
        }

        function hint(cm, callback, options) {
            var modeName = cm.getModeAt(cm.getCursor()).name;
            if (modeName === 'javascript' && cm.__instance.getMode() === 'json') {
                modeName = 'json';
            }
            if (!_localHinterSchemes[modeName]) {
                modeName = cm.getMode().name;
            }
            var localHinters = _.map(_localHinterSchemes[modeName],
                function (x) {
                    return codemirror.helpers.hint[x.name];
                });
            var globalHinters = _.map(_globalHinterSchemes,
                function (x) {
                    return codemirror.helpers.hint[x.name];
                });
            globalHinters = _.filter(globalHinters, function (hinter) {
                return _.indexOf(localHinters, hinter) < 0;
            });
            if (!_.isFunction(callback)) {
                options = callback;
                callback = null;
            }
            var localResult = {list: [], from: null, to: null};
            var globalResult = {list: [], from: null, to: null};

            var pending = localHinters.length + globalHinters.length;
            if (callback && pending === 0) {
                callback(localResult);
            }

            _.each(localHinters, function (hinter) {
                if (callback) {
                    hinter(cm, function (completions) {
                        mergeResult(localResult, completions);
                        pending--;
                        if (pending === 0) {
                            mergeResult(localResult, globalResult);
                            callback(localResult);
                        }
                    }, options);
                } else {
                    var completions = hinter(cm, options);
                    mergeResult(localResult, completions);
                }
            });
            _.each(globalHinters, function (hinter) {
                if (callback) {
                    hinter(cm, function (completions) {
                        mergeResult(globalResult, completions);
                        pending--;
                        if (pending === 0) {
                            mergeResult(localResult, globalResult);
                            callback(localResult);
                        }
                    });
                } else {
                    var completions = hinter(cm, options);
                    mergeResult(localResult, completions);
                }
            });

            return localResult;
        }

        function startJavaScriptAssist(editor, cm, c) {
            if (cm._ternAddon) {
                if (c) {
                    c();
                }
            }
            require(['./js-hint'], function (jshint) {
                var options = {};
                options.useWorker = settings.useWorker;
                options.autoHint = settings.autoHint;

                jshint.startServer(editor.file.path, cm, options, function (server) {
                    cm._ternAddon = server.ternAddon;
                    editor.assister = server;
                    editor.addExtraKeys({
                        'Ctrl-I': 'tern-showtype',
                        'Alt-.': 'tern-gotodefinition',
                        'Alt-,': 'tern-jumpback',
                        // 'Ctrl-B': 'tern-showreference'
                    });
                    if (c) {
                        c();
                    }
                });
            });
        }

        function setChangeForAutoHintDebounced() {
            onChangeForAutoHintDebounced = _.debounce(function (cm, changeObj, lastCursor) {
                // TODO - limch - minimize addFile() call to WebWorker
                var editor = cm.__instance;
                if (editor.assister && editor.assister.addFile) {
                    var options = {};
                    options.async = true;
                    options.useWorker = settings.useWorker;
                    editor.assister.addFile(editor.file.path, cm.getDoc().getValue(), options);
                }

                if (changeObj.origin === '+input' && settings.autoHint) {
                    var cursor = cm.getCursor();
                    if (cursor.line === lastCursor.line && cursor.ch === lastCursor.ch) {
                        codemirror.commands.autocomplete(cm, {autoHint: true, completeSingle: false});
                    }
                }
            }, settings.autoHintDelay);
        }

        var onChangeForAutoHintDebounced;
        setChangeForAutoHintDebounced();

        function onChangeForAutoHint(cm, changeObj) {
            onChangeForAutoHintDebounced(cm, changeObj, cm.getCursor());
        }

        CodeEditorViewer.prototype.gotoDefinition = function () {
            this.addDeferredAction(function (self) {
                var editor = self.editor;
                self.focus();
                editor.execCommand('tern-gotodefinition');
            });
        };

        CodeEditorViewer.prototype.rename = function () {
            this.addDeferredAction(function (self) {
                var editor = self.editor;
                self.focus();

                // rename trigger
                editor.execCommand('tern-rename');
            });
        };

        CodeEditorViewer.prototype.getMenuItemsUnderEdit = function (items, menuItems, deferred) {
            var editor = this.editor;

            if (editor) {
                var selected = editor.getSelection();

                // Undo, Redo
                var history = editor.getHistory();
                if (history) {
                    if (history.done && history.done.length > 0) {
                        items['&Undo'] = menuItems.editMenuItems['&Undo'];
                    }
                    if (history.undone && history.undone.length > 0) {
                        items['&Redo'] = menuItems.editMenuItems['&Redo'];
                    }
                }

                // Delete
                items['&Delete'] = menuItems.editMenuItems['&Delete'];

                // Select All, Select Line
                items['Select &All'] = menuItems.editMenuItems['Select &All'];
                items['Select L&ine'] = menuItems.editMenuItems['Select L&ine'];

                // Line
                var lineItems = {};

                // Line - Move Line Up, Move Line Down, Copy, Delete
                lineItems['&Indent'] = menuItems.editMenuItems['&Line']['&Indent'];
                lineItems['&Dedent'] = menuItems.editMenuItems['&Line']['&Dedent'];
                var pos = editor.getCursor();
                if (pos.line > 0) {
                    lineItems['Move Line U&p'] = menuItems.editMenuItems['&Line']['Move Line U&p'];
                }
                if (pos.line < editor.lastLine()) {
                    lineItems['Move Line Dow&n'] = menuItems.editMenuItems['&Line']['Move Line Dow&n'];
                }
                //lineItems['&Copy Line'] = menuItems.editMenuItems['&Line']['&Copy Line'];
                lineItems['D&elete Lines'] = menuItems.editMenuItems['&Line']['D&elete Lines'];
                items['&Line'] = lineItems;

                // Source
                var sourceItems = {};

                // Toggle Comments
                if (CodeEditorViewer.isLineCommentable(editor)) {
                    sourceItems['&Toggle Line Comments'] = menuItems.editMenuItems['&Source']['&Toggle Line Comments'];
                }
                if (CodeEditorViewer.isBlockCommentable(editor)) {
                    sourceItems['Toggle Block Comment'] = menuItems.editMenuItems['&Source']['Toggle Block Comment'];
                }
                // Code Folding
                sourceItems['&Fold'] = menuItems.editMenuItems['&Source']['&Fold'];
                // Beautify (All)
                if (editor.getMode().name === 'javascript') {
                    if (selected) {
                        sourceItems['&Beautify'] = menuItems.editMenuItems['&Source']['&Beautify'];
                    }
                    sourceItems['B&eautify All'] = menuItems.editMenuItems['&Source']['B&eautify All'];
                }
                // Rename
                items['&Source'] = sourceItems;

                if (editor._ternAddon) {
                    editor._ternAddon.request(editor,
                        {type: 'rename', newName: 'merong', fullDocs: true},
                        function (error/*, data*/) {
                            if (!error) {
                                sourceItems['&Rename Variables'] = menuItems.editMenuItems['&Source']['&Rename Variables'];
                            }
                            deferred.resolve(items);
                        });
                } else {
                    deferred.resolve(items);
                }
            } else {
                deferred.resolve(items);
            }
        };

        CodeEditorViewer.prototype.setAutoCompletion = function (autoCompletion) {
            settings.autoHint = autoCompletion;
        };

        CodeEditorViewer.prototype.setAutoCompletionDelay = function (delay) {
            var num = typeof delay === 'string' ? parseFloat(delay, 10) : delay;
            num *= 1000;
            settings.autoHintDelay = num;

            setChangeForAutoHintDebounced();
        };

        var modeMap = {
            'js': [['javascript'], 'text/javascript'],
            'json': [['javascript'], 'application/json'],
            'ts': [['javascript'], 'application/typescript'],
            'html': [['vbscript', 'javascript', 'css', 'htmlmixed'], 'text/html'],
            'css': [['css'], 'text/css'],
            'less': [['less'], 'text/less'],
            'c': [['clike'], 'text/x-csrc'],
            'h': [['clike'], 'text/x-csrc'],
            'java': [['clike'], 'text/x-java'],
            'm': [['clike'], 'text/x-objectivec'],
            'hh': [['clike'], 'text/x-c++src'],
            'hpp': [['clike'], 'text/x-c++src'],
            'hxx': [['clike'], 'text/x-c++src'],
            'cc': [['clike'], 'text/x-c++src'],
            'cpp': [['clike'], 'text/x-c++src'],
            'cxx': [['clike'], 'text/x-c++src'],
            'cs': [['clike'], 'text/x-csharp'],
            'php': [['php'], 'text/x-php'],
            'py': [['python'], 'text/x-python'],
            'fs': [['mllike'], 'text/x-fsharp'],
            'fsi': [['mllike'], 'text/x-fsharp'],
            'pl': [['perl'], 'text/x-perl'],
            'pas': [['pascal'], 'text/x-pascal'],
            'pp': [['pascal'], 'text/x-pascal'],
            'sql': [['sql'], 'text/x-sql'],
            'rb': [['ruby'], 'text/x-ruby'],
            'r': [['r'], 'text/x-rsrc'],
            'cbl': [['cobol'], 'text/x-cobol'],
            's': [['gas'], 'text/x-gas'],
            'f': [['fortran'], 'text/x-Fortran'],
            'for': [['fortran'], 'text/x-Fortran'],
            'd': [['d'], 'text/x-d'],
            'lsp': [['commonlisp'], 'text/x-common-lisp'],
            'lisp': [['commonlisp'], 'text/x-common-lisp'],
            'scala': [['clike'], 'text/x-scala'],
            'groovy ': [['groovy'], 'text/x-groovy'],
            'lua': [['lua'], 'text/x-lua'],
            'schema': [['schema'], 'text/x-scheme'],
            'vbs': [['vbscript'], 'text/vbscript'],
            'go': [['go'], 'text/x-go'],
            'hs': [['haskell'], 'text/x-haskell'],
            'xml': [['xml'], 'application/xml']
        };

        function mapMode(mode) {
            var mapped = modeMap[mode];
            if (mapped === undefined) {
                return 'text/plain';
            } else {
                return mapped[1];
            }
        }

        function loadMode(modename, done) {
            var mappedMode = modeMap[modename];
            if (mappedMode === undefined) {
                mappedMode = false;
            } else {
                mappedMode = mappedMode[0];
            }
            if (mappedMode) {
                mappedMode = _.map(mappedMode, function (modename) {
                    return 'external/codemirror/mode/' + modename + '/' + modename;
                });
                require(mappedMode, function () {
                    addAvailable('mode', modename);
                    done();
                });
            } else {
                done();
            }
        }

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

        CodeEditorViewer.prototype.setMode = function (mode) {
            if (mode === undefined || this.mode === mode) {
                return;
            }
            this.mode = mode;

            var self = this;

            this.mappedMode = mapMode(mode);
            loadMode(mode, function () {
                if (self.editor) {
                    self.editor.setOption('mode', self.mappedMode);
                }
                self.__applyLinter();
                self.addDeferredAction(function () {
                    require(['../emmet'], function () {
                        // Nothing to do
                    });
                });
            });

            loadCSSList([require.toUrl('external/codemirror/addon/dialog/dialog.css'),
                require.toUrl('external/codemirror/addon/hint/show-hint.css'),
                require.toUrl('external/codemirror/addon/tern/tern.css'),
            ], function () {
                require(['external/codemirror/addon/dialog/dialog',
                    'external/codemirror/addon/hint/show-hint',
                    'external/codemirror/addon/tern/tern'
                ], function () {
                    self.addDeferredAction(function () {
                        if (mode === 'js') {
                            _.defer(function () {
                                startJavaScriptAssist(self, self.editor);
                            });
                        } else if (mode === 'html' || mode === 'htmlmixed') {
                            var options = {};
                            options.async = true;
                            options.useWorker = settings.useWorker;
                            require(['./html-hint'], function (htmlhint) {
                                self.assister = htmlhint;
                                htmlhint.addFile(self.file.path, self.editor.getDoc().getValue(), options);
                            });
                        }
                        self.editor.on('change', onChangeForAutoHint);
                    });
                });
            });
        }
    }

    return {installTern: installTern};
});


