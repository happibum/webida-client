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
        'external/yatern/dist/yatern',
        './file-server'
    ],
    function (YAtern, fileServer) {
        'use strict';
        console.info('CREATING SEVER');

        var server = Object.create(null);

        server.startServer = function (server) {
            console.info('START');
        };

        server.stopServer = function (server) {
            console.info('STOP');
        };

        server.addFile = function (server, path, text) {
            console.info('ADDFILE');
        };

        server.delFile = function (server, path) {
            console.info('DELFILE');
        };

        server.getFile = function (server, cb) {
            console.info('GETFILE');
        };

        server.request = function (server, body, callback) {
            console.info('REQUEST');

            var result = YAtern.analyze(body.code, true);
            switch (body.type) {
                case 'variableOccurrences':
                    var refs = YAtern.findVarRefsAt(result.AST, body.pos);
                    callback(undefined, refs);
                    break;
                case 'returnOccurrences':
                    var rets = YAtern.findReturnStatements(result.AST, body.pos, true);
                    callback(undefined, rets);
                    break;
            }
        };
        return server;
    });
