/* Copyright 2015, Yahoo Inc.
   Copyrights licensed under the MIT License.
   See the accompanying LICENSE file for terms. */

var t = require('tap');

var deserialize = require('../tree-deserialiser');

var expected = {
    decoded: {
        branches: [0, 2],
        files: 2,
        hash: '0b0ca69d74be872c914b06e8bdee677917e8e9f2',
        name: 'mendel',
        version: 2,
    },
    error: null,
};
var realHash = 'bWVuZGVsAgAC_wIACwymnXS-hyyRSwbove5neRfo6fI';
var result = deserialize(realHash);
result.decoded.hash = result.decoded.hash.toString('hex'); // Avoid Buffer

t.match(result, expected, 'Decodes valid hash');

var hashWitOtherBranches = 'bWVuZGVsAQEDAAEDBAD_AgALDKaddL6HLJFLBui97md5F-jp8g';
t.match(
    deserialize(hashWitOtherBranches).decoded.branches,
    [1, 3, 0, 1, 3, 4, 0],
    'changing only brances changes hash'
);

var err;
var notEvenAHash = null;
err = deserialize(notEvenAHash).error;
t.match(err, new Error(), 'this hash is bad');
t.match(err.message, 'bad base64 input');

var hashWithWrongName = 'bU9SZGVsAgD_AQBlyvO3YQV4p7brFreXnPz7WctabQ';
err = deserialize(hashWithWrongName).error;
t.match(err, new Error(), 'this hash is bad');
t.match(err.message, 'not generated by mendel');

var hashWithWrongVersion = 'bWVuZGVs-gAC_wIACwymnXS-hyyRSwbove5neRfo6fI';
err = deserialize(hashWithWrongVersion).error;
t.match(err, new Error(), 'this hash is bad');
t.match(err.message, 'version mismatch');

var wrongHashSize = 'bWVuZGVsAgAC_wIACwymnXS-hyyRSwbove5neRf';
err = deserialize(wrongHashSize).error;
t.match(err, new Error(), 'this hash is bad');
t.match(err.message, 'short or missing sha');

// use `DEBUG='mendel:tree-serializer' pnpm tap test/tree-serializer.js`
// to get valid results when changing algorithm version
expected = {
    decoded: {
        result: 'bWVuZGVsAgD-LAH_AgAs-GMlUpHSDtqLrY4iniSKEISKUg',
        branches: [0, 300],
        files: 2,
        hash: '2cf863255291d20eda8bad8e229e248a10848a52',
        name: 'mendel',
        version: 2,
    },
    error: null,
};
var hashWithOverflow = 'bWVuZGVsAgD-LAH_AgAs-GMlUpHSDtqLrY4iniSKEISKUg';
result = deserialize(hashWithOverflow);
result.decoded.hash = result.decoded.hash.toString('hex'); // Avoid Buffer
t.match(expected, result);
