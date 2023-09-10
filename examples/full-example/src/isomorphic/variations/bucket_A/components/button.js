/* Copyright 2015, Yahoo Inc.
   Copyrights licensed under the MIT License.
   See the accompanying LICENSE file for terms. */

import React from 'react';

var count = 0;

class Button extends React.Component {
    render() {
        const text = `${this.props.children} A#${++count}`;
        return <button {...this.props}>{text}</button>;
    }
}

export default Button;
