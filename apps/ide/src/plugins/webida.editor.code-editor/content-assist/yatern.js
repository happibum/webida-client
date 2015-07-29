define(['require',
        'external/codemirror/lib/codemirror',
        './assist'],
    function (require, CodeMirror, assist) {
        'use strict';

        CodeMirror.registerHelper('hint', 'javascript', function (cm, c, options) {
            console.info('!!! not implemented yet');
        });

        var renameCount = 0;
        function renameVariableViaDialog(cm) {
            var sentValue = cm.getValue();

            function dialog(cm, text, dfltText, f) {
                if (typeof dfltText === 'function') {
                    f = dfltText;
                    dfltText = '';
                }
                if (cm.openDialog) {
                    cm.openDialog(text + ': <input type=text value="' + dfltText + '">', f);
                } else {
                    f(prompt(text, ''));
                }
            }

            withVariableOccurrences(cm,
                function (error, data) {
                    if (data === null || cm.getValue() !== sentValue) {
                        // if not on a variable or there is code change after the request,
                        // then do nothing.
                        return;
                    }
                    var oldName = data[0].name;
                    dialog(cm, 'New name for ' + oldName, oldName, function(newName) {
                        var lengthDiff = newName.length - oldName.length;
                        renameCount++;
                        for (var i = 0; i < data.length; i++) {
                            var node = data[i];

                            var startPos = cm.posFromIndex(node.start + lengthDiff * i);
                            var endPos = cm.posFromIndex(node.end + lengthDiff * i);
                            cm.replaceRange(newName, startPos, endPos, '*rename' + renameCount);
                        }
                    });

                });
        }

        function selectVariables(cm) {
            var sentValue = cm.getValue();
            withVariableOccurrences(cm,
                function (error, data) {
                    if (data === null || cm.getValue() !== sentValue) {
                        // if not on a variable or there is code change after the request,
                        // then do nothing.
                        return;
                    }
                    var curPos = cm.getCursor();
                    var ranges = [], cur = 0;
                    for (var i = 0; i < data.length; i++) {
                        var node = data[i];
                        var startPos = cm.posFromIndex(node.start);
                        var endPos = cm.posFromIndex(node.end);
                        ranges.push({anchor: startPos, head: endPos});
                        if (CodeMirror.cmpPos(startPos, curPos) <= 0 &&
                            CodeMirror.cmpPos(curPos, endPos) <= 0) {
                            // when curPos is within the range
                            cur = i;
                        }
                    }
                    cm.setSelections(ranges, cur);
                }
            );
        }

        function highlightVariableOccurrences(cm) {
            // assign clear and timeout variable for each cm instance
            var clear;
            var timeout;

            // remove the work for cursorActivity within 250ms
            function registerTimeout() {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(function () { work(cm); }, 250);
            }

            // real work is done by this
            function work() {
                withVariableOccurrences(cm,
                    function (error, data) {
                        // clear the previous highlights
                        if (clear) {
                            clear();
                            clear = null;
                        }
                        // check whether we found occurrences
                        if (data === null) {
                            return;
                        }
                        var hls = [];
                        for (var i = 0; i < data.length; i++) {
                            var node = data[i];
                            var startPos = cm.posFromIndex(node.start);
                            var endPos = cm.posFromIndex(node.end);

                            hls.push(cm.markText(startPos, endPos,
                                {className: 'cm-searching'}));
                        }

                        clear = function () {
                            cm.operation(function () {
                                for (var i = 0; i < hls.length; i++) {
                                    hls[i].clear();
                                }
                            });
                        };
                    });
            }
            return registerTimeout;
        }

        function withVariableOccurrences(cm, c) {
            var ranges = cm.listSelections();
            if (ranges.length > 1) {
                c(null, null);
                return;
            }
            var cursorIndexPos = cm.indexFromPos(cm.getCursor());
            assist.send({mode: 'js', type: 'request', server: null,
                    body: {pos: cursorIndexPos, code: cm.getValue()}}, c);
        }

        return {startServer: function (filepath, cm, option, c) {
            cm.yaternAddon = {
                rename: renameVariableViaDialog,
                withVariableOccurrences: withVariableOccurrences
            };

            cm.setOption('extraKeys', {
                'Ctrl-J': function (cm) { selectVariables(cm); }
            });

            cm.on('cursorActivity', highlightVariableOccurrences(cm));
        }};
    });
