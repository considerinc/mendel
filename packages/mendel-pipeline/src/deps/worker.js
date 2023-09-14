const analytics = require('../helpers/analytics/analytics-worker')('deps');
const debug = require('debug')('mendel:deps:slave-' + process.pid);
const verbose = require('debug')('verbose:mendel:deps:slave-' + process.pid);
const mendelDeps = require('mendel-deps');
const path = require('path');
const VariationalResolver = require('mendel-resolver/bisource-resolver');

const pendingInquiry = new Map();
const RUNTIME = ['main', 'browser', 'module'];
const resolveCache = new Map();
let resolver;

let debugFileMatching = process.env.DEBUG_FILE_MATCHING;
if (debugFileMatching && debugFileMatching !== '') {
    debugFileMatching = new RegExp(debugFileMatching);
}

module.exports = function (done) {
    return {
        start(payload, sender) {
            const {
                filePath,
                source,
                projectRoot,
                baseConfig,
                variationConfig,
            } = payload;

            let logFile = debug.enabled;
            if (debug.enabled && debugFileMatching) {
                logFile = debugFileMatching.test(filePath);
            }

            analytics.tic();
            if (!resolver) {
                resolver = new VariationalResolver({
                    cache: resolveCache,
                    runtimes: RUNTIME,
                    extensions: ['.js', '.jsx', '.json'],
                    // entry related
                    basedir: path.resolve(projectRoot, path.dirname(filePath)),
                    // config params
                    projectRoot,
                    baseConfig,
                    variationConfig,
                    recordPackageJson: true,
                    has(filePath) {
                        return new Promise((resolve) => {
                            if (!pendingInquiry.has(filePath))
                                pendingInquiry.set(filePath, []);

                            pendingInquiry.get(filePath).push(resolve);
                            sender('has', { filePath });
                        });
                    },
                });
            } else {
                resolver.setBaseDir(
                    path.resolve(projectRoot, path.dirname(filePath))
                );
            }

            logFile && debug(`Detecting dependencies for ${filePath}`);
            mendelDeps({ file: filePath, source, resolver })
                // mendel-resolver throws in case nothing was found
                .catch(() => {
                    return RUNTIME.reduce((reduced, name) => {
                        reduced[name] = false;
                        return reduced;
                    }, {});
                })
                .then((deps) => {
                    analytics.toc();
                    logFile && debug(`Dependencies for ${filePath} found!`);
                    logFile && verbose({ filePath, deps });
                    done({ filePath, deps });
                });
        },

        has(payload) {
            const { value, filePath } = payload;
            const pendingResolves = pendingInquiry.get(filePath);
            pendingResolves.forEach((resolve) => resolve(value));
        },

        onExit() {
            // Nothing to clean
        },

        clearCache() {
            resolveCache.clear();
        },
    };
};
