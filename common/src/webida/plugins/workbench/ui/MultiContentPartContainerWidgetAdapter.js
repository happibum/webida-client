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
 * Constructor
 * MultiContentPartContainerWidgetAdapter
 *
 * @see
 * @since: 2015.07.15
 * @author: hw.shim
 */

// @formatter:off
define([
    'external/eventEmitter/EventEmitter',
    'webida-lib/util/genetic',
    'webida-lib/util/logger/logger-client',
    './PartContainer',
    './PartContainerWidgetAdapter'
], function (
    EventEmitter,
    genetic, 
    Logger,
    PartContainer,
    PartContainerWidgetAdapter
) {
    'use strict';
// @formatter:on

    /**
     * @typedef {Object} DataSource
     */

    var logger = new Logger();
    //logger.setConfig('level', Logger.LEVELS.log);
    //logger.off();

    function MultiContentPartContainerWidgetAdapter(container) {
        logger.info('new MultiContentPartContainerWidgetAdapter(container)');
        dojo.connect(container.getContentPane(), 'resize', function (changeSize) {
            container.emit(PartContainer.CONTAINER_RESIZE, changeSize);
        });
        this.setWidget(container.getContentPane());
    }


    genetic.inherits(MultiContentPartContainerWidgetAdapter, PartContainerWidgetAdapter, {

    });

    return MultiContentPartContainerWidgetAdapter;
});
