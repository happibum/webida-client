define(['require',
        'external/codemirror/lib/codemirror',
        './assist'],
    function (require, CodeMirror, assist) {
        'use strict';

        CodeMirror.registerHelper('hint', 'javascript', function (cm, c, options) {
            console.info('!!! not implemented yet');
        });

        // ***** start of code taken from tern addon
        var cls = "CodeMirror-Tern-";

        function tempTooltip(cm, content) {
            var where = cm.cursorCoords();
            var tip = makeTooltip(where.right + 1, where.bottom, content);
            function clear() {
                if (!tip.parentNode) return;
                cm.off("cursorActivity", clear);
                fadeOut(tip);
            }
            setTimeout(clear, 1700);
            cm.on("cursorActivity", clear);
        }

        function makeTooltip(x, y, content) {
            var node = elt("div", cls + "tooltip", content);
            node.style.left = x + "px";
            node.style.top = y + "px";
            document.body.appendChild(node);
            return node;
        }

        function elt(tagname, cls /*, ... elts*/) {
            var e = document.createElement(tagname);
            if (cls) e.className = cls;
            for (var i = 2; i < arguments.length; ++i) {
                var elt = arguments[i];
                if (typeof elt == "string") elt = document.createTextNode(elt);
                e.appendChild(elt);
            }
            return e;
        }

        function remove(node) {
            var p = node && node.parentNode;
            if (p) p.removeChild(node);
        }

        function fadeOut(tooltip) {
            tooltip.style.opacity = "0";
            setTimeout(function() { remove(tooltip); }, 1100);
        }
        // ***** end of code taken from tern addon

        function showType(cm) {
            function doTooltip(error, data) {
                tempTooltip(cm, data.typeString);
            }
            var start = cm.indexFromPos(cm.getCursor('start'));
            var end = cm.indexFromPos(cm.getCursor('end'));

            assist.send(
                {mode: 'js', type: 'request', server: null,
                    body: {
                        type: 'showType',
                        start: start,
                        end: end,
                        code: cm.getValue()
                    }
                }, doTooltip);
        }

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

            withOccurrences('variableOccurrences',cm,
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
            withOccurrences('variableOccurrences', cm,
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

        function highlightOccurrences(occurType, cm) {
            // assign clear and timeout variable for each cm instance
            var clear;
            var timeout;

            // remove the work for cursorActivity within 250ms
            function registerTimeout() {
                if (timeout) clearTimeout(timeout);
                timeout = setTimeout(function () { work(cm); }, 250);
            }

            function highlighter(error, occurList) {
                // clear the previous highlights
                if (clear) {
                    clear();
                    clear = null;
                }
                // check whether we found occurrences
                if (occurList === null) {
                    return;
                }
                var hls = [];
                for (var i = 0; i < occurList.length; i++) {
                    var node = occurList[i];
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
            }

            // real work is done by this
            function work() {
                withOccurrences(occurType, cm, highlighter);
            }

            return registerTimeout;
        }

        function withOccurrences(reqType, cm, c) {
            var ranges = cm.listSelections();
            if (ranges.length > 1) {
                c(null, null);
                return;
            }
            var cursorIndexPos = cm.indexFromPos(cm.getCursor());
            assist.send(
                {mode: 'js', type: 'request', server: null,
                    body: {
                        type: reqType,
                        pos: cursorIndexPos,
                        code: cm.getValue()
                    }
                }, c);
        }

        return {startServer: function (filepath, cm, option, c) {
            cm.yaternAddon = {
                rename: renameVariableViaDialog,
                withOccurrences: withOccurrences,
                showType: showType
            };

            cm.setOption('extraKeys', {
                'Ctrl-J': function (cm) { selectVariables(cm); },
                'Ctrl-I': function (cm) { showType(cm); }
            });

            cm.on('cursorActivity', highlightOccurrences('variableOccurrences', cm));
            cm.on('cursorActivity', highlightOccurrences('returnOccurrences', cm));
            cm.on('cursorActivity', highlightOccurrences('thisOccurrences', cm));
        }};
    });
