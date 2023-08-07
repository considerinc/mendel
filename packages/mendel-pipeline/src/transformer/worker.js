const analytics = require('../helpers/analytics/analytics-worker')('transform');

module.exports = function() {
    const debug = require('debug')('mendel:transformer:slave-' + process.pid);

    return {
        start({source: startSource, transforms, filename}) {
            debug(`[Slave ${process.pid}] Starting transform.`);
            let promise = Promise.resolve({source: startSource});

            transforms.forEach(transform => {
                const xform = require(transform.plugin);
                if (typeof xform !== 'function') {
                    throw new Error(`Transform ${transform.id} is incompatible with Mendel.`);
                }

                promise = promise
                .then(analytics.tic.bind(analytics, transform.id))
                .then(({source, map}) => {
                    return xform({filename, source, map}, transform.options);
                })
                .then(analytics.toc.bind(analytics, transform.id))
                .then(result => {
                    if(startSource !== undefined && result.source === undefined) {
                        debug(`Transform ${transform.id} returned empty result for non empty input`);
                    } else {
                        debug(`[Slave ${process.pid}][${transform.id}] "${filename}" transformed`);
                    }
                    return result;
                });
            });

            return promise;
        },
    };
};
