const test = require('tap').test;
const deps = require('../');
const {readFileSync} = require('fs');
const {globSync} = require('glob');
const path = require('path');
const Resolver = require('../../mendel-resolver');

const jsFixtures = globSync(__dirname + '/js-fixtures/**/*.js');

const jsResolver = new Resolver({
    cwd: __dirname + '/fixtures',
    runtimes: ['browser', 'main'],
});

jsFixtures
    .filter((file) => file.endsWith('index.js'))
    .forEach((file) => {
        const dirname = path.dirname(file);
        jsResolver.setBaseDir(dirname);

        test(dirname, function (t) {
            return deps({
                file,
                source: readFileSync(file, 'utf8'),
                jsResolver,
            }).then((deps) => {
                // foo, process, and global
                t.equal(Object.keys(deps).length, 3);

                const fooDep = deps['./foo'];
                t.match(fooDep.browser, /foo\/browser.js$/);
                t.match(fooDep.main, /foo\/server.js$/);
            });
        });
    });

const cssFixtures = globSync(__dirname + '/css-fixtures/**/*.css');

const cssResolver = new Resolver({
    cwd: __dirname + '/fixtures',
    runtimes: ['browser', 'main'],
});

cssFixtures
    .filter((file) => file.endsWith('index.css'))
    .forEach((file) => {
        const dirname = path.dirname(file);
        cssResolver.setBaseDir(dirname);

        test(dirname, function (t) {
            return deps({
                file,
                source: readFileSync(file, 'utf8'),
                cssResolver,
            }).then((deps) => {
                t.equal(Object.keys(deps).length, 1);

                const fooDep = deps['./foo.css'];
                t.match(fooDep.browser, /foo\.css$/);
                t.match(fooDep.main, /foo\.css$/);
            });
        });
    });
