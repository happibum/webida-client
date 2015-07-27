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

define([
        'webida-lib/app',
        'text!./java-run-configuration.html',
        'dojo/topic',
        'dojo/on',
        'dijit/form/Select',
        'webida-lib/widgets/dialogs/file-selection/FileSelDlg2States', // FileDialog
        'dijit/layout/ContentPane',
        'dijit/registry',
        'plugins/webida.notification/notification-message'
    ],
    function (ide, template, topic, on, Select, FileDialog, ContentPane, registry, toastr) {
        'use strict';
        var FS = ide.getMount();
        var SRC_DIR = 'src';
        var currentRunConf;
        var ui = {};

        function _pathButtonClicked() {
            var pathInputBox = ui.readonlyInputBoxes[0];
            var nameInputBox = ui.inputBoxNodes[0];
            var project = ui.select.get('value');
            var initialPath;
            var root;
            var dlg;

            if (!currentRunConf || !project || !pathInputBox) {
                toastr.error('Cannot find root path');
                return;
            }

            root = ide.getPath() + '/' + project + '/' + SRC_DIR + '/';
            if (pathInputBox.value) {
                initialPath = root + pathInputBox.value;
            } else {
                initialPath = root;
            }

            dlg = new FileDialog({
                mount: ide.getFSCache(),
                root: root,
                initialSelection: [initialPath],
                title: 'Select the Main Java File to Run',
                singular: true,
                dirOnly: false,
                showRoot: false
            });
            dlg.open(function (selected) {
                var pathSplit;
                if (selected) {
                    if (selected.length <= 0) {
                        toastr.warning('Select a java file.');
                        return;
                    }
                    pathSplit = selected[0].split(root);
                    if (pathSplit.length > 0) {
                        pathInputBox.value = pathSplit[1];
                        if (!nameInputBox) {
                            return;
                        }
                        if (!nameInputBox.value || currentRunConf.unsaved) {
                            nameInputBox.value = pathInputBox.value;
                        }
                    } else {
                        toastr.warning('Select a java file.');
                    }
                }
            });
        }

        function _setTemplate(runConf) {
            ui.content.setContent(template);
            currentRunConf = runConf;
            if (runConf) {
                var child = ui.content.domNode;
                ui.inputBoxNodes = $(child).find('.rcw-content-table-inputbox-edit');
                ui.inputBoxNodes[0].value = runConf.name ? runConf.name : '';
                ui.readonlyInputBoxes = $(child).find('.rcw-content-table-inputbox-readonly');
                ui.readonlyInputBoxes[0].value = runConf.path ? (runConf.path.split('.').join('/') + '.java') : '';

                ide.getWorkspaceInfo(function (err, workspaceInfo) {
                    if (!err) {
                        var projects = workspaceInfo.projects.map(function (project) {
                            return {
                                value: project,
                                label: project
                            };
                        });
                        if (registry.byId('run-configuration-project')) {
                            registry.byId('run-configuration-project').destroy();
                        }
                        ui.select = new Select({ options: projects }, 'run-configuration-project');
                        ui.select.startup();
                        ui.select.set('value', runConf.project);
                    }
                });

                ui.saveButton = registry.byId('rcw-action-save');
                ui.pathButton = $(child).find('.rcw-action-path').get(0);

                ui.content.own(
                    on(ui.saveButton, 'click', function () {
                        if (_doSave()) {
                            topic.publish('webida.ide.project-management.run:configuration.changed',
                                'save', currentRunConf);
                        } else {
                            toastr.error('Invalid Run Configuration.');
                        }
                    }),
                    on(ui.pathButton, 'click', function () {
                        _pathButtonClicked();
                    })
                );
            }
        }

        var srcRegex = /^((?:[^\\/:\*\?"<>\|]*\/)*)([^\\/:\*\?"<>\|]*)\.java$/i;
        function _doSave() {
            var fullPath;
            var matchResult;
            // validation on currentRunConf
            currentRunConf.name = ui.inputBoxNodes[0].value;
            currentRunConf.project = ui.select.get('value');
            currentRunConf.outputDir = 'target';
            currentRunConf.srcDir = SRC_DIR;
            fullPath = ui.readonlyInputBoxes[0].value;
            matchResult = srcRegex.exec(fullPath);
            if (matchResult === null) {
                return false;
            }
            currentRunConf.path = matchResult[1].split('/').join('.') + matchResult[2];
            return true;
        }

        return {
            run: function (runConf, callback) {
                var rootPath = ide.getPath() + '/' + runConf.project;
                var filePath = runConf.srcDir + '/' + runConf.path.replace(/\./g, '/') + '.java';
                console.log('Run As...', runConf);
                FS.exec(rootPath, {cmd: 'javac', args: ['-d', runConf.outputDir, filePath]},
                    function (err, stdout, stderr) {
                        console.debug('###javac', runConf.path, stdout, stderr);
                        topic.publish('#REQUEST.log', stdout);
                        topic.publish('#REQUEST.log', stderr);
                        if (!err && !stderr) {
                            FS.exec(rootPath, {cmd: 'java', args: ['-cp', runConf.outputDir, runConf.path]},
                                function (err, stdout, stderr) {
                                    console.debug('###java', runConf.path, stdout, stderr);
                                    topic.publish('#REQUEST.log', stdout);
                                    topic.publish('#REQUEST.log', stderr);
                                    callback(null, runConf);
                                });
                        }
                    });
            },
            newConf: function (content, runConf, callback) {
                ui.content = content;
                _setTemplate(runConf);
                callback(null, runConf);
            },
            loadConf: function (content, runConf, callback) {
                ui.content = content;
                _setTemplate(runConf);
                callback(null, runConf);
            },
            saveConf: function (runConf, callback) {
                // validation
                if (_doSave()) {
                    callback(null, runConf);
                } else {
                    callback('validation failed');
                }
            },
            deleteConf: function (runConfName, callback) {
                callback(null, currentRunConf);
            }
        };
    });
