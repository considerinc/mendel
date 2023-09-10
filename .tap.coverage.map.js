// npx tap --coverage-map=.tap.coverage.map.js ./test/some-file.js

const { relative } = require('node:path');
const { existsSync } = require('node:fs');

module.exports = function (testFile) {
    const rel = relative(process.cwd(), testFile);
    const out = rel.replace(/(^|\/)test\//, '$1');
    if (existsSync(out)) {
        return out;
    }
    return [];
};
