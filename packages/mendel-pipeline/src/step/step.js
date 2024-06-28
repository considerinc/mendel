const debug = require('debug');
const EventEmitter = require('events').EventEmitter;
const debugFilter = require('mendel-development/debug-filter');

class Step extends EventEmitter {
    constructor() {
        super();
    }

    static get name() {
        throw new Error('Must implement static "name"');
    }

    perform() {
        throw new Error('Must implement "perform"');
    }

    get verbose() {
        if (this._verbose) return this._verbose;
        const verbose = debug(
            `verbose:mendel:filestep:${this.constructor.name}`
        );
        return (this._verbose = function () {
            debugFilter.apply(null, [verbose].concat(Array.from(arguments)));
        });
    }

    get extraVerbose() {
        if (this._extraVerbose) return this._extraVerbose;
        const verbose = debug(`debug:mendel:filestep:${this.constructor.name}`);
        return (this._extraVerbose = function () {
            debugFilter.apply(null, [verbose].concat(Array.from(arguments)));
        });
    }

    emit(eventName, { entryId = '' } = {}) {
        this.verbose(`${eventName} ${entryId}`);

        super.emit.apply(this, arguments);
    }
}

module.exports = Step;
