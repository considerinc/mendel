/* Copyright 2015, Yahoo Inc.
   Copyrights licensed under the MIT License.
   See the accompanying LICENSE file for terms. */

import React from 'react';
import _debug from 'debug';
const debugKey = 'mendel:full-example';
const debug = _debug(debugKey);

if (typeof localStorage !== 'undefined') {
    const oldDebug = localStorage.debug;
    if (!oldDebug || oldDebug === '') localStorage.debug = debugKey;
} else {
    debug.enabled = true;
}

function foo() {
    const env = process.env.NODE_ENV || 'development';
    debug(env);
    return env;
}

class Footer extends React.Component {
    render() {
        return (
            <footer>
                <div>--- footer stuff ---</div>
                <div>{'Current NODE_ENV is ' + foo()}</div>
            </footer>
        );
    }
}

export default Footer;
