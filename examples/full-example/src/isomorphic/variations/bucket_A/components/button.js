/* Copyright 2015, Yahoo Inc.
   Copyrights licensed under the MIT License.
   See the accompanying LICENSE file for terms. */

import React from 'react';

var count = 0;

class Button extends React.Component {
    render() {
        const text = `A#${++count}`;
        return (
            <button {...this.props}>
                {this.props.children}
                {text}
            </button>
        );
    }
}

export default Button;
