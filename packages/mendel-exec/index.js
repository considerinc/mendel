const debug = require('debug')('mendel:exec');
// const verbose = require('debug')('verbose:mendel:exec');
const vm = require('vm');
const path = require('path');
const m = require('module');
const resolve = require('resolve');
// https://github.com/nodejs/node/blob/master/lib/internal/module.js#L54-L60
const builtinLibs = Object.keys(process.binding('natives'));
const _require = require;
const errorMapper = require('./source-mapper');
const MendelResolver = require('mendel-resolver');

let debugFileMatching = process.env.DEBUG_FILE_MATCHING;
if (debugFileMatching && debugFileMatching !== '') {
    debugFileMatching = new RegExp(debugFileMatching);
}
const debugEnabled = debug.enabled;

const redacted = '--redacted';
const redact = { source: redacted, rawSource: redacted, map: redacted };

function runEntryInVM(filename, source, sandbox, require) {
    if (require.cache[filename]) {
        return require.cache[filename].exports;
    }

    const exports = {};
    const module = { exports };
    // Put the cache first so if return something even in the case when
    // cycle of dependencies happen.
    require.cache[filename] = module;

    // the filename is only necessary for uncaught exception reports to point to the right file
    try {
        const unshebangedSource = source.replace(/^#!.*\n/, '');
        const nodeSource = vm.runInContext(m.wrap(unshebangedSource), sandbox, {
            filename,
        });
        // function (exports, require, module, __filename, __dirname)
        nodeSource(
            exports,
            require.bind(null, filename),
            module,
            filename,
            path.dirname(filename)
        );
    } catch (e) {
        delete require.cache[filename];
        throw e;
    }

    return module.exports;
}

function matchVar(norm, entries, variations, runtime) {
    // variations are variation configurations based on request.
    // How entries resolve in mutltivariate case is a little bit different
    // from variation inheritance, thus this flattening with a caveat.
    const multiVariations = variations.reduce((reduced, { chain }, index) => {
        if (variations.length === index + 1) return reduced.concat(chain);
        // remove base which is part of every chain
        return reduced.concat(chain.slice(0, chain.length - 1));
    }, []);

    let shouldLog = debugEnabled;
    if (debugFileMatching) shouldLog = debugFileMatching.test(norm);
    if (shouldLog) {
        console.log(`matchVar for ${norm}`);
        console.log({
            norm,
            entries: entries.map((_) => ({
                ..._,
                ...redact,
            })),
            variations,
            runtime,
        });
    }

    for (let i = 0; i < multiVariations.length; i++) {
        const varId = multiVariations[i];
        const found = entries.find((entry) => {
            return (
                entry.variation === varId &&
                (entry.runtime === 'isomorphic' ||
                    entry.runtime === runtime ||
                    entry.runtime === 'package')
            );
        });
        if (found) return found;
    }

    throw new RangeError(
        [
            `Could not find entries with norm "${norm}" that matches`,
            `"${JSON.stringify(variations)}"`,
            'in the list of entries',
            `[${entries.map(({ id }) => id)}]`,
        ].join(' ')
    );
}

function exec(fileName, source, { sandbox = {}, resolver }) {
    if (!sandbox) sandbox = {};
    if (!sandbox.cache) sandbox.cache = {};
    vm.createContext(sandbox);
    if (!sandbox.global) sandbox.global = sandbox;
    if (!sandbox.process) sandbox.process = require('process');
    if (!sandbox.Buffer) sandbox.Buffer = global.Buffer;
    if (!sandbox.setTimeout) sandbox.setTimeout = global.setTimeout;
    if (!sandbox.clearTimeout) sandbox.clearTimeout = global.clearTimeout;
    if (!sandbox.setInterval) sandbox.setInterval = global.setInterval;
    if (!sandbox.clearInterval) sandbox.clearInterval = global.clearInterval;
    if (!sandbox.debugFileMatching) {
        sandbox.debugFileMatching = debugFileMatching;
    }
    if (sandbox.debugEnabled === undefined) {
        sandbox.debugEnabled = debugEnabled;
    }

    // Let's pipe vm output to stdout this way
    sandbox.console = console;

    /********
     * TODO: fix the following:
     *
     * The line `if (MendelResolver.isNodeModule(literal)) return _require(literal);`
     * is technically correct, but was added to patch a deficiency on the
     * client registry not receiving the correct files.
     *
     * The `debug` module has a weird pattern that breaks:
     * see:
     * https://github.com/debug-js/debug/blob/f42b9627922995561299b064fce56bd292abb030/package.json#L37-L38
     * and:
     * https://github.com/debug-js/debug/blob/f42b9627922995561299b064fce56bd292abb030/src/index.js#L7-L9
     *
     * If we remove `MendelResolver.isNodeModule(literal)` check, we never get
     * a version of `debug/src/index.js` with {runtine: 'main'} and throw
     * a RangeError
     * *****/

    function varRequire(parentId, literal) {
        if (builtinLibs.indexOf(literal) >= 0) return _require(literal);
        if (MendelResolver.isNodeModule(literal)) return _require(literal);
        const entry = resolver(parentId, literal);
        if (entry) {
            return runEntryInVM(entry.id, entry.source, sandbox, varRequire);
        }

        // In such case, it is real node's module.
        const dependencyPath = resolve.sync(literal, {
            basedir: path.dirname(parentId),
        });

        return _require(dependencyPath);
    }
    // We allow API user to use older version of cache if it passes the same
    // instance of sandbox. If not, we create a new one and make it
    // last one exec execution.
    varRequire.cache = sandbox.cache;

    debug({ runEntryInVM: fileName });
    return runEntryInVM(fileName, source, sandbox, varRequire);
}

module.exports = {
    execWithRegistry(registry, mainId, variations, sandbox, runtime = 'main') {
        function resolve(norm) {
            const entries = registry.getExecutableEntries(norm);
            if (!entries) return null;
            return matchVar(
                norm,
                Array.from(entries.values()),
                variations,
                runtime
            );
        }

        const mainEntry = resolve(mainId);
        if (!mainEntry) return require(mainId);
        try {
            return exec(mainEntry.id, mainEntry.source, {
                sandbox,
                runtime,
                resolver(from, depLiteral) {
                    const parent = registry.getEntry(from);

                    // mendel-exec is memory and garbage collector intensive
                    // take care of not making alocations
                    let shouldLog = debugEnabled;
                    if (debug.enabled) {
                        if (debugFileMatching) {
                            const litMatch = debugFileMatching.test(depLiteral);
                            const depMatch =
                                parent.deps &&
                                Object.keys(parent.deps).some((_) =>
                                    debugFileMatching.test(_)
                                );
                            shouldLog = litMatch || depMatch;
                        }
                    }
                    shouldLog &&
                        debug({
                            depLiteral,
                            runtime,
                            parent: { ...parent, ...redact },
                        });

                    if (!parent.deps[depLiteral])
                        throw new Error(
                            'Any form of dynamic require is not supported by Mendel'
                        ); // eslint-disable-line max-len

                    let normId = parent.deps[depLiteral][runtime];
                    if (typeof normId === 'object') normId = normId[runtime];

                    // If we get _noop from cache, this depLiteral doesn't exist
                    if (normId === '_noop')
                        throw new Error(
                            `Cannot find ${depLiteral} from ${mainEntry.id}`
                        ); // eslint-disable-line max-len

                    return resolve(normId);
                },
            });
        } catch (e) {
            e.stack = errorMapper(e.stack, registry);
            console.error(e.stack);
            throw new Error('Error was thrown while evaluating.');
        }
    },
    exec,
};
