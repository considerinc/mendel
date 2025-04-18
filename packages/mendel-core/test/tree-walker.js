/* Copyright 2015, Yahoo Inc.
   Copyrights licensed under the MIT License.
   See the accompanying LICENSE file for terms. */

var t = require('tap');

var MendelWalker = require('../tree-walker');

var walker = MendelWalker();

t.equal(walker.constructor, MendelWalker, 'constructor');

var shallowModule = {
    id: 'root',
    index: 0,
    data: [
        {
            id: 'stubData',
            sha: '010203',
        },
    ],
};

t.equal(
    walker.find(shallowModule).id,
    'stubData',
    "Shallow module won't call _resolveBranch"
);

t.equal(walker.find({ index: 0 }).id, 'stubData', 'Caches result by index');

t.throws(function () {
    walker.find({ index: 1, data: [1, 2] });
}, 'Throws if _resolveBranch not implemented by subclass');

var branchModule = {
    id: 'leaf1',
    index: 2,
    data: [
        {
            id: 'firstItem',
            sha: '0506FF',
        },
        {
            id: 'secondItem',
            sha: '0506FF',
        },
        {
            id: 'thirdItem',
            sha: 'bb06FF',
            variation: 'variationValue',
        },
    ],
};
walker._resolveBranch = function (module) {
    return {
        resolved: module.data[1],
        index: 1,
    };
};

t.match(
    walker.find(branchModule),
    { id: 'secondItem', sha: '0506FF' },
    'Traverse module with custom function'
);

t.match(walker.deps[2], { id: 'secondItem', sha: '0506FF' }, 'store correctly');

branchModule.id = 'leaf2';
branchModule.index = 3;
walker._resolveBranch = function (module) {
    return {
        resolved: module.data[2],
        index: 2,
    };
};

walker.find(branchModule);

var finalResult = {
    deps: [
        {
            id: 'stubData',
            sha: '010203',
        },
        null,
        {
            id: 'secondItem',
            sha: '0506FF',
        },
        {
            id: 'thirdItem',
            sha: 'bb06FF',
            variation: 'variationValue',
        },
    ],
    hash: 'bWVuZGVsAgEC_wMA5EClgTUZaXjQeWopmqLqqDgWBJ4',
};

t.match(walker.found(), finalResult, 'All toghether with hash');
