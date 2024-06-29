/* Copyright 2015, Yahoo Inc.
   Designed by Irae Carvalho
   Copyrights licensed under the MIT License.
   See the accompanying LICENSE file for terms. */

var debug = require('debug')('mendel:tree-walker');
var TreeSerialiser = require('./tree-serialiser');

function MendelWalker(_lookupChains, _base, _hash) {
    if (!(this instanceof MendelWalker)) {
        return new MendelWalker(_lookupChains, _base, _hash);
    }

    this.deps = [];
    if (_hash !== false) {
        this.serialiser = new TreeSerialiser();
    }
}

MendelWalker.prototype.find = function (module) {
    var resolved;
    if (this.deps[module.index]) {
        return this.deps[module.index];
    } else if (module.data.length === 1) {
        debug(`module ${module.id} no variations`);
        resolved = module.data[0];
    } else {
        debug(`module ${module.id} needs resolving`);
        var branch = this._resolveBranch(module);
        debug({ branch });
        resolved = branch.resolved;
        if (this.serialiser) {
            this.serialiser.pushBranch(branch.index);
        }
    }
    this.deps[module.index] = resolved;

    if (this.serialiser) {
        if (!resolved.sha) {
            debug({ moduleNoSha: module });
        }
        this.serialiser.pushFileHash(Buffer.from(resolved.sha, 'hex'));
    }

    return resolved;
};

MendelWalker.prototype._resolveBranch = function () {
    throw new Error('You should extend and implement _resolveBranch');
};

MendelWalker.prototype.found = function () {
    var found = {
        deps: this.deps,
    };
    if (this.serialiser) {
        found.hash = this.serialiser.result();
    }
    return found;
};

module.exports = MendelWalker;
