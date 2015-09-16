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

define([], function () {
    'use strict';

    return {
        getDefault: function () {
            return {
                'webida.editor.text-editor:autoCompletion': true,
                'webida.editor.text-editor:autoCompletionDelay': '0.3',
                'webida.editor.text-editor:jshintrc': true,
                'webida.editor.text-editor:autoClose': true,
                'webida.editor.text-editor:enableSnippet': true,
                'webida.editor.text-editor:folding': true,
                'webida.editor.text-editor:anywordHint': false
            };
        },
        getSchema: function () {
            return [
                {
                    type: 'group',
                    title: 'Common'
                },
                {
                    key: 'webida.editor.code-editor:contentAssistEngine',
                    type: 'select',
                    opt: {
                        name: 'Select content-assist engine',
                        items: ['tern', 'yatern']
                    }
                },
                {
                    key: 'webida.editor.text-editor:enableSnippet',
                    type: 'checkbox',
                    opt: {
                        name: 'Use snippets'
                    }
                },
                {
                    key: 'webida.editor.text-editor:folding',
                    type: 'checkbox',
                    opt: {
                        name: 'Use code folding'
                    }
                },
                {
                    type: 'group',
                    title: 'Hint'
                },
                {
                    key: 'webida.editor.text-editor:jshintrc',
                    type: 'checkbox',
                    opt: {
                        name: 'Use .jshintrc file'
                    }
                },
                {
                    key: 'webida.editor.text-editor:anywordHint',
                    type: 'checkbox',
                    opt: {
                        name: 'Any word hint : propose hints by any word'
                    }
                },
                {
                    type: 'group',
                    title: 'Automation'
                },
                {
                    key: 'webida.editor.text-editor:autoCompletion',
                    type: 'checkbox',
                    opt: {
                        name: 'Auto activation'
                    }
                },
                {
                    key: 'webida.editor.text-editor:autoCompletionDelay',
                    type: 'select',
                    opt: {
                        name: 'Auto activation delay',
                        items: ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1', '1.5', '2'],
                        enabledOn: 'webida.editor.text-editor:autoCompletion'
                    }
                },
                {
                    key: 'webida.editor.text-editor:autoClose',
                    type: 'checkbox',
                    opt: {
                        name: 'Auto close'
                    }
                }
            ];
        },
        editor: function (fieldCreator) {
            fieldCreator.addField('webida.editor.text-editor:autoCompletion', 'checkbox', {
                title: 'Content Assists',
                name: 'Auto activation',
                'default': true
            });

            fieldCreator.addField('webida.editor.text-editor:autoCompletionDelay', 'select', {
                name: 'Auto activation delay',
                items: ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1', '1.5', '2'],
                'default': '0.3',
                enabledOn: 'webida.editor.text-editor:autoCompletion'
            });

            fieldCreator.addField('webida.editor.text-editor:jshintrc', 'checkbox', {
                name: 'Use .jshintrc file',
                'default': 'true'
            });

            fieldCreator.addField('webida.editor.text-editor:autoClose', 'checkbox', {
                //title: '<br>Auto Close',
                name: 'Auto close',
                'default': true
            });

            fieldCreator.addField('webida.editor.text-editor:enableSnippet', 'checkbox', {
                //title: '<br>Snippet',
                name: 'Use snippets',
                'default': true
            });

            fieldCreator.addField('webida.editor.text-editor:folding', 'checkbox', {
                //title: '<br>Code Folding',
                name: 'Use code folding',
                'default': true
            });

            fieldCreator.addField('webida.editor.text-editor:anywordHint', 'checkbox', {
                //title: '<br>Global hint (hint for any file type)',
                name: 'Any word hint : propose hints by any word',
                'default': false
            });
        }
    };
});
