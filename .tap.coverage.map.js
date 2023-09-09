// npx tap --coverage-map=.tap.coverage.map.js ./test/some-file.js

const { relative } = require('node:path');

module.exports = function (testFile) {
    return map[relative(__dirname, testFile)] || [];
};

const map = {
    'test/trees.js': ['packages/mendel-core/tree.js'],
    'test/tree-walker.js': ['packages/mendel-core/tree-walker.js'],
    'test/tree-serialiser.js': ['packages/mendel-core/tree-serialiser.js'],
    'test/tree-deserialiser.js': ['packages/mendel-core/tree-deserialiser.js'],
    'test/tree-hash-walker.js': ['packages/mendel-core/tree-hash-walker.js'],
    'test/tree-walker.js': ['packages/mendel-core/tree-walker.js'],
    'test/tree-variation-walker-server.js': [
        'packages/mendel-core/tree-variation-walker-server.js',
    ],
    'test/tree-variation-walker.js': [
        'packages/mendel-core/tree-variation-walker.js',
    ],
};
