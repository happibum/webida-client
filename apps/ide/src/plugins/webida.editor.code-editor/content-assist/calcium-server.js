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
        'external/calcium/dist/calcium',
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
                    var rets = YAtern.findEscapingStatements(result.AST, body.pos);
                    callback(undefined, rets);
                    break;
                case 'thisOccurrences':
                    var thisExprs = YAtern.findThisExpressions(result.AST, body.pos, true);
                    callback(undefined, thisExprs);
                    break;
                case 'showType':
                    var typeData = YAtern.getTypeData(result.AST, result.Ĉ, body.start, body.end);
                    callback(undefined, typeData);
                    break;
                case 'structuredFnTypes':
                    var fns = YAtern.getFnTypeStructuresAt(result.AST, result.Ĉ, body.pos);
                    callback(undefined, fns);
                    break;
                case 'definitionSites':
                    var sites = YAtern.getDefinitionSitesAt(result.AST, result.Ĉ, body.start, body.end);
                    callback(undefined, sites);
                    break;
                case 'completions':
                    var completions = YAtern.getCompletionAtPos(result, body.pos);
                    callback(undefined, completions);
                    break;
                default:
                    throw new Error('Unknown request type');
            }
        };
        return server;
    });
