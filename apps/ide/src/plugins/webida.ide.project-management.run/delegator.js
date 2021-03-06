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
 * webida - Delegator for the actions on the run configurations
 * // TODO 'mandator' is more clear name for this module.
 * Src:
 *   plugins/webida.ide.project-management.run/delegator.js
 *
 * @module webida.ide.project-management.run.delegator
 */
define([
    'external/lodash/lodash.min',
    'dojo/i18n!./nls/resource',
    'dojo/topic',
    'webida-lib/app',
    'webida-lib/util/locale',
    'webida-lib/util/notify',
    'webida-lib/plugin-manager-0.1',
    'webida-lib/plugins/workspace/plugin',
    'webida-lib/util/logger/logger-client',
    'webida-lib/util/path',
    './run-configuration-manager'
], function (
    _,
    i18n,
    topic,
    ide,
    Locale,
    notify,
    pluginManager,
    workspace,
    Logger,
    pathUtil,
    runConfigurationManager
) {
    'use strict';

    var delegators = {};
    var module = {};
    var fsMount = ide.getFSCache();
    var liveReloadHandleList = [];
    var logger = new Logger();
    logger.off();

    var locale = new Locale(i18n);

    var extensionPoints = {
        RUN_CONFIGURATION_TYPE: 'webida.ide.project-management.run:type',
        RUN_CONFIGURATION: 'webida.ide.project-management.run:configuration',
        RUN_CONFIGURATION_RUNNER: 'webida.ide.project-management.run:runner'
    };
    var runConfActions = pluginManager.getExtensions(extensionPoints.RUN_CONFIGURATION);
    var runConfRunner = pluginManager.getExtensions(extensionPoints.RUN_CONFIGURATION_RUNNER);

    // TODO defaultDelegator mapping is needed to be seperated to other file
    var defaultDelegator = {
        'newConf': undefined,
        'loadConf': undefined,
        'saveConf': function _saveConf(runConfName, callback) {
            require(['plugins/webida.ide.project-management.run/default-view-controller'], function (viewController) {
                viewController.saveConf(runConfName, callback);
            });
        },
        'deleteConf': function _deleteConf(runConfName, callback) {
            require(['plugins/webida.ide.project-management.run/default-view-controller'], function (viewController) {
                viewController.deleteConf(runConfName, callback);
            });
        },
        'run': undefined,
        'debug': undefined
    };

    /**
     * Dojo Widget Object
     * @typedef {Object} DojoWidget
     */

    /**
     * @callback contentCreationCallback
     * @param error
     * @param runConf
     * @param content {Object} dojo object of
     * @memberOf webida.ide.project-management.run.delegator
     */

    /**
     * Default new delegator
     * @param {DojoWidget} content - dojo object of content widget
     * @param {Object} newRunConf - default run configuration
     * @param {contentCreationCallback} callback
     * @type {Function}
     * @memberOf webida.ide.project-management.run.delegator
     */
    defaultDelegator.newConf = function (content, newRunConf, callback) {
        // draw ui
        newRunConf.path = '';   // initialize path value
        require(['plugins/webida.ide.project-management.run/default-view-controller'], function (viewController) {
            viewController.newConf(content, newRunConf, callback);
        });
    };

    /**
     * Default load delegator
     * @param {DojoWidget} content - dojo object of content widget
     * @param {Object} newRunConf - default run configuration
     * @param {contentCreationCallback} callback
     * @type {Function}
     * @memberOf webida.ide.project-management.run.delegator
     */
    defaultDelegator.loadConf = function (content, newRunConf, callback) {
        // draw ui
        require(['plugins/webida.ide.project-management.run/default-view-controller'], function (viewController) {
            viewController.loadConf(content, newRunConf, callback);
        });
    };

    /**
     * Default run delegator
     * @param {Object} runObject - run configuration to execute
     * @param callback
     * @memberOf webida.ide.project-management.run.delegator
     */
    defaultDelegator.run = function (runObject, callback) {
        var projectPath = workspace.getRootPath() + runObject.project;
        var openName = pathUtil.attachSlash(projectPath) + runObject.name;
        var runningWin = window.open('', openName, runObject.openArgument);
        if (!runningWin) {
            callback(i18n.messageFailOpenWindow);
            return;
        }

        fsMount.addAlias(projectPath, 3600, function (err, data) {
            if (err) {
                callback(err);
                return;
            }

            var argStr = runObject.argument ? '?' + runObject.argument : '';
            var sharpStr = runObject.fragment ? '#' + runObject.fragment : '';
            var url = data.url + '/' + runObject.path + argStr + sharpStr;

            runningWin.location.href = './redirect.html#' + url;

            callback();
            if (runningWin.focus) {
                runningWin.focus();
            }

            var reloadHandle = liveReloadHandleList[openName];
            if (reloadHandle) {
                _releaseLiveReloadHandle(reloadHandle);
                liveReloadHandleList[openName] = null;
            }

            if (runObject.liveReload === true) {
                var handle = topic.subscribe('fs/cache/file/set', function (fsURL, target, reason, maybeModified) {
                    if (runningWin.closed) {
                        _releaseLiveReloadHandle(handle);
                    } else {
                        if ((target.indexOf(projectPath) === 0) && (maybeModified)) {
                            runningWin.location.href = './redirect.html#' + url;
                        }
                    }
                });
                liveReloadHandleList[openName] = handle;
            }
        });
    };

    /**
     * @example
     *      Delegator.get(type).action(...)
     * @param {String} type - the type of run configuration
     * @constructor
     * @memberOf webida.ide.project-management.run.delegator
     */
    function Delegator(type) {
        this.type = type;
        var allActions = {};
        if (type) {
            var actions = _.where(runConfActions, {type: type});
            var runners = _.where(runConfRunner, {type: type});

            _.each(_.keys(defaultDelegator), function (delegatorType) {
                var module;
                var delegatorMethodName;
                if (delegatorType === 'run' && !_.isEmpty(runners)) {
                    module = runners[0].module;
                    delegatorMethodName = runners[0].run;
                } else if (delegatorType === 'debug' && !_.isEmpty(runners)) {
                    module = runners[0].module;
                    delegatorMethodName = runners[0].debug;
                } else if (delegatorType !== 'run' && delegatorType !== 'debug' && !_.isEmpty(actions)) {
                    module = actions[0].module;
                    delegatorMethodName = actions[0][delegatorType];
                }

                if (module && delegatorMethodName) {
                    allActions[delegatorType] = function () {
                        var args = arguments;
                        require([module], function (md) {
                            if (md[delegatorMethodName]) {
                                md[delegatorMethodName].apply(md, args);
                            } else {
                                if (args.length > 0) {
                                    var callback = args[args.length - 1];
                                    callback(locale.formatMessage('messageNotFoundImplementation',
                                        {delegatorType: delegatorType, type: type}));
                                }
                                logger.error(locale.formatMessage('messageNotFoundImplementation',
                                    {delegatorType: delegatorType, type: type}));
                            }
                        });
                    };
                }
            });
            _.extend(this, allActions);
        } else {
            _.extend(this, defaultDelegator);
        }
    }

    /**
     * Get a delegators by its type
     * @param type
     * @returns {*}
     * @memberOf webida.ide.project-management.run.delegator
     */
    Delegator.get = function (type) {
        if (!delegators[(type ? type : '_default')]) {
            delegators[(type ? type : '_default')] = new Delegator(type);
        }
        return delegators[(type ? type : '_default')];
    };

    function _releaseLiveReloadHandle(handle) {
        handle.remove();
        handle = null;
    }

    function _makeConfigurationName(projectName) {
        var defaultValue = projectName || i18n.valueNewConfiguration;
        var result = defaultValue;
        var allRunConfs = runConfigurationManager.getAll();
        if (!_.isEmpty(allRunConfs)) {
            if (allRunConfs[result]) {
                var numbering = 1;
                while (true) {
                    result = defaultValue + ' (' + (numbering++) + ')';
                    if (!allRunConfs[result]) {
                        break;
                    }
                }
            }
        }
        return result;
    }

    /**
     * Execute selected run configuration
     * @param {Object} runConf - selected run configuration
     * @param [callback]
     * @memberOf webida.ide.project-management.run.delegator
     */
    module.run = function (runConf, callback) {
        logger.log('run', arguments);
        if (!_.isFunction(Delegator.get(runConf.type).run)) {
            var err = locale.formatMessage('messageNotFoundImplementation',
                {delegatorType: i18n.messageRunDelegator, type: runConf.type});
            notify.error(err);
            if (callback) {
                callback(err);
            }
        } else {
            Delegator.get(runConf.type).run(runConf, function (err) {
                if (err) {
                    notify.error(err);
                } else {
                    runConfigurationManager.setLatestRun(runConf.name);
                    notify.success(locale.formatMessage('messageSuccessRun', runConf));
                }
                if (callback) {
                    callback(err, runConf);
                }
            });
        }
    };

    /**
     * Start to debug for selected run configuration
     * @param {Object} runConf - selected run configuration
     * @param [callback]
     * @memberOf webida.ide.project-management.run.delegator
     */
    module.debug = function (runConf, callback) {
        logger.log('debug', arguments);
        if (!_.isFunction(Delegator.get(runConf.type).debug)) {
            var err = locale.formatMessage('messageNotFoundImplementation',
                {delegatorType: i18n.messageDebugDelegator, type: runConf.type});
            notify.error(err);
            if (callback) {
                callback(err);
            }
        } else {
            Delegator.get(runConf.type).debug(runConf, function (err) {
                if (err) {
                    notify.error(err);
                } else {
                    runConfigurationManager.setLatestRun(runConf.name);
                    notify.success(locale.formatMessage('messageSuccessDebug', runConf));
                }
                if (callback) {
                    callback(err, runConf);
                }
            });
        }
    };

    /**
     * Make a new run configuration
     * @param {DojoWidget} content - dojo object of content widget
     * @param {String} type - the type of configuration
     * @param {String} [projectName] - project name
     * @param {contentCreationCallback} [callback]
     * @memberOf webida.ide.project-management.run.delegator
     */
    module.newConf = function (content, type, projectName, callback) {
        var name = _makeConfigurationName(projectName);
        var runConf = {
            type: type,
            name: name,
            originalName: name,
            project: projectName,
            _dirty: true
        };
        if (!_.isFunction(Delegator.get(type).newConf)) {
            logger.warn('newConf function hasn\'t be implemented for the run configurator type(' + type + ')');
            runConfigurationManager.add(runConf);
            if (callback) {
                callback(null, runConf);
            }
        } else {
            Delegator.get(type).newConf(content, runConf, function (err, runConf) {
                if (err) {
                    notify.error(err);
                } else {
                    runConfigurationManager.add(runConf);
                }
                if (callback) {
                    callback(err, runConf);
                }
            });
        }
    };

    /**
     * Load the selected run configuration
     * @param {DojoWidget} content - dojo object of content widget
     * @param {Object} runConf - selected run configuration
     * @param {contentCreationCallback} callback
     * @memberOf webida.ide.project-management.run.delegator
     */
    module.loadConf = function (content, runConf, callback) {
        logger.log('loadConf', arguments);

        if (!_.isFunction(Delegator.get(runConf.type).loadConf)) {
            logger.warn('loadConf function hasn\'t be implemented for the run configurator type(' +
            runConf.type + ')');
            if (callback) {
                callback(null, runConf);
            }
        } else {
            if (!runConf.originalName) {
                runConf.originalName = runConf.name;
            }
            Delegator.get(runConf.type).loadConf(content, runConf, function (err, runConf) {
                if (err) {
                    notify.error(err);
                }
                if (callback) {
                    callback(err, runConf);
                }
            });
        }
    };

    function _isDuplicateRunName(name, originalName) {
        var dupRunConf;
        if (originalName && originalName === name) {
            // When status of this configuration is 'saved' and its name has not been changed,
            // there is no need to check duplication.
            return false;
        }
        dupRunConf = runConfigurationManager.getByName(name);
        return (dupRunConf && !dupRunConf._dirty && !dupRunConf._deleted);
    }

    function _resolveDuplication(runConf) {
        var ret = runConf.name;
        var i = 2;
        while (_isDuplicateRunName(ret, runConf.originalName)) {
            ret = runConf.name + ' (' + i++ + ')';
            if (i > 100) {
                ret = runConf.name + '_' + new Date().toUTCString();
            }
        }
        runConf.name = ret;
    }

    /**
     * Validation for common required fields (name and target project of the run configuration)
     * @param runConf
     * @param callback
     * @returns {*}
     * @private
     * @memberOf webida.ide.project-management.run.delegator
     */
    function _validation(runConf, callback) {
        if (!runConf.name) {
            return callback(i18n.validationNoName);
        }
        if (!runConf.project) {
            return callback(i18n.validationNoProject);
        }
        _resolveDuplication(runConf);
        callback();
    }
    /**
     * Save properties of the selected run configuration
     * @param {Object} runConf - selected run configuration
     * @param callback
     * @memberOf webida.ide.project-management.run.delegator
     */
    module.saveConf = function (runConf, callback) {
        logger.log('saveConf', arguments);
        if (!_.isFunction(Delegator.get(runConf.type).saveConf)) {
            logger.warn('saveConf action hasn\'t be implemented for the run configurator type(' + runConf.type + ')');
            runConfigurationManager.save(runConf);
            if (callback) {
                callback(null, runConf);
            }
        } else {
            require(['plugins/webida.ide.project-management.run/view-controller'], function (viewController) {
                if (viewController.getWindowOpened()) {
                    Delegator.get(runConf.type).saveConf(runConf, function (err, runConf) {
                        if (err) {
                            notify.error(err);
                        } else {
                            // validation for mandatory properties (name, project)
                            _validation(runConf, function (errMsg) {
                                if (!errMsg) {
                                    runConfigurationManager.save(runConf);
                                    viewController.reload();
                                    notify.success(locale.formatMessage('messageSuccessSave', runConf));
                                }
                                callback(errMsg, runConf);
                            });
                        }
                    });
                } else {
                    // if this run configuration has been auto-generated, there is no need to validate options
                    runConfigurationManager.save(runConf);
                    if (callback) {
                        callback(null, runConf);
                    }
                }
            });
        }
    };

    /**
     * Remove the selected run configuration
     * @param {String} runConfName - run configuration's name to remove
     * @param [callback]
     * @memberOf webida.ide.project-management.run.delegator
     */
    module.deleteConf = function (runConfName, callback) {
        var runConf = runConfigurationManager.getByName(runConfName);
        logger.log('deleteConf', arguments);
        if (!_.isFunction(Delegator.get(runConf.type).deleteConf)) {
            logger.warn('saveConf action hasn\'t be implemented for the run configurator type(' + runConf.type + ')');
            runConfigurationManager.delete(runConfName);
            if (callback) {
                callback(null, runConfName);
            }
        } else {
            Delegator.get(runConf.type).deleteConf(runConfName, function (err) {
                if (err) {
                    notify.error(err);
                } else {
                    runConfigurationManager.delete(runConfName);
                    notify.success(locale.formatMessage('messageSuccessRemove', runConf));
                }
                if (callback) {
                    callback(err, runConfName);
                }
            });
        }
    };

    return module;
});
