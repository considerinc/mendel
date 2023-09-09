/* Copyright 2018, Irae Carvalho,
   Copyrights licensed under the MIT License.
   See the accompanying LICENSE file for terms. */
/* Inspired by both karma-commonjs and karma-closure */
var debug = require('debug')('mendel:karma-mendel:plugin');
var verbose = require('debug')('verbose:mendel:karma-mendel:plugin');
var path = require('path');
var fs = require('fs');
var File = require('karma/lib/file');
const { createHash } = require('crypto');
var configLoader = require('mendel-config');
var MendelClient = require('mendel-pipeline/client');
var { SourceMapGenerator, SourceMapConsumer } = require('source-map');

var INLINE_MAP_PREFIX = '//# sourceMappingURL=data:application/json;base64,';
var BRIDGE_FILE_PATH = path.normalize(
    __dirname + '/../client/mendel_bridge.js'
);
var MENDEL_GLOBAL_PATH = '/tmp/mendel-global.js';
fs.writeFileSync(MENDEL_GLOBAL_PATH, 'window');

var globalClient;
var globalConfig;

async function initMendelFramework(logger, emitter, fileList, karmaConfig) {
    debug('initMendelFramework');
    var configMendel = karmaConfig.mendel;
    var configFiles = karmaConfig.files;

    // Mendel needs ahead of karma, otherwise karma will manage to
    // query for files and get other versions before Mendel could
    karmaConfig.autoWatchBatchDelay = Math.max(
        Number(karmaConfig.autoWatchBatchDelay),
        250
    );

    var log = logger.create('framework:mendel');
    var client = new MendelClient(
        Object.assign({}, configMendel, { noout: true })
    );
    client.run();
    var config = configLoader(configMendel);

    globalConfig = config;
    globalClient = client;

    log.info('Found mendel config at "%s".', config.projectRoot);

    // Include the file that resolves all the dependencies on the client.
    configFiles.push({
        pattern: BRIDGE_FILE_PATH,
        included: true,
        served: true,
        watched: false,
    });

    configFiles.unshift({
        pattern: MENDEL_GLOBAL_PATH,
        included: true,
        served: true,
        watched: false,
    });

    fs.writeFileSync(MENDEL_GLOBAL_PATH, globalModuleContent());

    var root = config.projectRoot;

    // When karma starts or detects file changes, provide dependencies
    emitter.on('file_list_modified', async function (files) {
        debug('file_list_modified');
        // karma will swallow errors without this try/catch
        try {
            await new Promise(function waiter(resolve) {
                if (globalClient.isSynced()) {
                    return resolve();
                }
                debug('file_list_modified hold');
                setTimeout(() => waiter(resolve), 100);
            });

            debug('file_list_modified continue');

            // from karma loaded files, find matching mendel modules
            var filesWithMendelModule = files.served.map((item) => {
                var relative = path.relative(root, item.originalPath);
                var module = client.registry.getEntry('./' + relative);
                if (module) {
                    item.module = module;
                }
                return item;
            });

            // all found mendel modules are entries
            var entryModules = filesWithMendelModule
                .map((_) => _.module)
                .filter(Boolean)
                .reduce((map, item) => {
                    map.set(item.id, item);
                    return map;
                }, new Map());

            Array.from(entryModules.values())
                .map((_) => _.id)
                .forEach((_) => log.debug('looking for dependencies for ' + _));

            // calculate which files to never modify
            var passThroughFiles = filesWithMendelModule
                .filter((_) => !_.module)
                .filter((_) => !_.originalPath !== MENDEL_GLOBAL_PATH);

            passThroughFiles
                .map((_) => _.originalPath)
                .forEach((_) => log.debug('passThroughFiles ' + _));

            var globalModule = filesWithMendelModule.find(
                (_) => _.originalPath === MENDEL_GLOBAL_PATH
            );
            globalModule.content = globalModuleContent();

            var collectedModules = new Map();

            Array.from(entryModules.values()).forEach((module) => {
                client.registry.walk(
                    module.normalizedId,
                    { types: config.types.map((_) => _.name) },
                    (dep) => {
                        if (collectedModules.has(dep.id)) return false;
                        collectedModules.set(dep.id, dep);
                    }
                );
            });

            var servedFiles = files.served;
            var injectedModules = await Promise.all(
                Array.from(collectedModules.values()).map(async (mod) => {
                    var filepath = path.join(root, mod.id);
                    for (
                        var i = 0, length = servedFiles.length;
                        i < length;
                        i++
                    ) {
                        if (servedFiles[i].originalPath === filepath) {
                            return servedFiles[i];
                        }
                    }

                    if (entryModules.has(mod.id)) {
                        mod.entry = true;
                    }

                    var contents = await wrapMendelModule(mod);

                    // TODO: if mendel client/server module cache adds modification time
                    // we can improve karma caching by passing the correct time
                    const modificationTime = new Date(Date.now());
                    // doNotCache must be false, otherwise `contents` will be ignored
                    // and karma will load the unprocessed module from the filesystem
                    const doNotCache = false;
                    const type = 'js';
                    const isBinary = false;
                    // integrity is used on the <script> tag to prevent loading the wrong file
                    var integrity = sha256(contents);

                    var externalFile = new File(
                        filepath,
                        modificationTime,
                        doNotCache,
                        type,
                        isBinary,
                        integrity
                    );

                    externalFile.content = contents;
                    // sha is used in URL request to prevent http caching
                    externalFile.sha = integrity;

                    servedFiles.push(externalFile);
                    // files.included.push(externalFile);
                    log.debug('added (preprocessed) dependency ', mod.id);
                    return externalFile;
                })
            );

            files.included = [globalModule]
                .concat(injectedModules)
                .concat(passThroughFiles);
        } catch (e) {
            log.error(e);
        }
    });

    // Mendel provides dependencies that Karma don't know about
    // tell karma when those changed
    client.on('change', function () {
        fileList.refresh();
    });
}

initMendelFramework.$inject = ['logger', 'emitter', 'fileList', 'config'];

var createPreprocesor = function (logger) {
    var log = logger.create('preprocessor:mendel');
    var debounce = true;

    return async function getFile(content, file, done, logged) {
        var relativeFile =
            './' + path.relative(globalConfig.projectRoot, file.originalPath);
        logged !== 'logged' && log.debug('transforming "%s".', relativeFile);

        if (!globalClient.isSynced() || debounce) {
            debounce = false;
            setTimeout(() => getFile(content, file, done, 'logged'), 250);
            return;
        }

        if (file.originalPath === BRIDGE_FILE_PATH) {
            debounce = true;
            done(null, content);
            return;
        }

        var module = globalClient.registry.getEntry(relativeFile);

        if (!module) {
            debounce = true;
            done(null, content);
            return;
        }

        // preprocessed modules are always entry, as injected modules don't
        // get preprocessed by karma
        module.entry = true;

        var output = await wrapMendelModule(module, file.originalPath);

        log.debug(relativeFile, 'transformed');
        debounce = true;
        done(null, output);
    };
};
createPreprocesor.$inject = ['logger'];

function globalModuleContent() {
    var variationsString = JSON.stringify(
        globalConfig.variationConfig.variations
    );

    const contents = `
        window.__mendel_module__ = window.__mendel_module__ || {};
        window.__mendel_config__ = {
            variations: ${variationsString},
            baseVariationDir: ${JSON.stringify(globalConfig.baseConfig.dir)},
            baseVariationId: ${JSON.stringify(globalConfig.baseConfig.id)},
        };
        process = {
            env: ${JSON.stringify(process.env)},
        };
    `;
    return contents;
}

async function wrapMendelModule(module) {
    var keepProps = ['id', 'normalizedId', 'variation', 'entry', 'expose'];
    var browserModule = Object.keys(module).reduce((bModule, key) => {
        if (keepProps.includes(key)) {
            bModule[key] = module[key];
        }
        return bModule;
    }, {});

    browserModule.deps = Object.keys(module.deps).reduce((deps, key) => {
        let originalDep = module.deps[key];

        if (typeof originalDep === 'string') {
            deps[key] = originalDep;
            return deps;
        }

        const firstKey = Object.keys(originalDep)[0];
        // most important last will override prev
        deps[key] = [firstKey, 'main', 'browser'].reduce((prev, key) => {
            return originalDep[key] || prev;
        }, '');

        return deps;
    }, {});

    browserModule.moduleFn = 'MENDEL_REPLACE';

    var moduleString = JSON.stringify(browserModule);

    var moduleBeforeSource =
        'window.__mendel_module__["' + module.id + '"] = ' + moduleString + ';';

    var parts = moduleBeforeSource.split('"MENDEL_REPLACE"');
    parts[0] = parts[0] + 'function(require,module,exports){\n';
    parts[1] = '\n}' + parts[1];
    var padLines = parts[0].split('\n');
    var padCol = padLines[padLines.length - 1].length;

    var output = parts[0] + module.source + parts[1];

    var newSourceMap = new SourceMapGenerator({ file: module.id });
    var finalMap;
    if (module.map) {
        // remap existing map summing our module padding
        var existingMap = await new SourceMapConsumer(module.map);
        existingMap.eachMapping(function (mapping) {
            const {
                source,
                generatedLine,
                generatedColumn,
                originalLine,
                originalColumn,
                name,
            } = mapping;
            const add = {
                original: {
                    line: originalLine,
                    column: originalColumn,
                },
                generated: {
                    line: padLines.length - 1 + generatedLine,
                    column:
                        mapping.generatedLine !== 1
                            ? generatedColumn
                            : padCol + generatedColumn,
                },
                source,
                name,
            };
            if (null === originalLine || null === originalColumn) {
                add.original = null;
            }
            newSourceMap.addMapping(add);
        });
        // Only use mappings from new map, so we keep paths in a way
        // that karma understands and keeps track of it
        const newMapObject = JSON.parse(newSourceMap.toString());
        finalMap = JSON.stringify(
            Object.assign({}, module.map, {
                mappings: newMapObject.mappings,
            })
        );
    } else {
        // create a line-only sourcemap, accounting for padding
        var sourceLinesCount = module.source.split('\n');
        for (var i = 1; i <= sourceLinesCount.length; i++) {
            newSourceMap.addMapping({
                original: {
                    line: i,
                    column: 0,
                },
                generated: {
                    line: i + padLines.length - 1,
                    column: i === 1 ? padCol : 0,
                },
                source: module.id,
            });
        }
        newSourceMap.setSourceContent(module.id, module.source);
        finalMap = newSourceMap.toString();
    }

    var comment = [
        INLINE_MAP_PREFIX,
        Buffer.from(finalMap).toString('base64'),
    ].join('');

    const logModules = [
        'chai/lib/chai/utils/inspect.js',
        'node_modules/react/index.js',
        'src/isomorphic/base/components/_test_/button_test.js',
    ];

    if (logModules.some((_) => module.id.indexOf(_) !== -1)) {
        verbose(output);
    }

    return output + '\n' + comment + '\n';
}

function sha256(string) {
    const enc = 'utf8';
    const algorithm = 'sha256';
    const hash = createHash(algorithm).update(string, enc);
    const sha = hash.digest('base64');

    return `${algorithm}-${sha}`;
}

// PUBLISH DI MODULE
module.exports = {
    'framework:mendel': ['factory', initMendelFramework],
    'preprocessor:mendel': ['factory', createPreprocesor],
};
