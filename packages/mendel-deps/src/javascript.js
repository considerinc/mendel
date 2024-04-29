// `console` is not included as it works flawlessly in Node and browser.
const GLOBAL_WHITELIST = ['global', 'process'];

// {
//     imports: ['./foo', '../bar', 'baz'],
//     exports: ['helloWorld', 'cruelWorld']
// }
const { default: traverse } = require('@babel/traverse');
function _depFinder(ast) {
    const imports = {};
    const exports = {};
    const globals = {};

    const visitor = {
        /************** IMPORT/REQUIRE ***************/
        ImportDeclaration(nodePath) {
            const { node } = nodePath;
            imports[node.source.value] = true;
        },
        CallExpression(nodePath) {
            const { node } = nodePath;

            // cjs require syntax support
            if (
                node.callee.type === 'Identifier' &&
                node.callee.name === 'require' &&
                node.arguments[0].type === 'StringLiteral'
            ) {
                imports[node.arguments[0].value] = true;
            }
        },
        MemberExpression(nodePath) {
            const { node } = nodePath;
            if (
                node.object.type === 'Identifier' &&
                // !nodePath.scope.lookup(node.object.name) &&
                GLOBAL_WHITELIST.indexOf(node.object.name) >= 0
            ) {
                globals[node.object.name] = true;
            }
        },
        ExportNamedDeclaration(nodePath) {
            const { node } = nodePath;

            let exportName = '';

            if (!node.declaration && node.specifiers.length) {
                node.specifiers
                    .filter(({ type }) => type === 'ExportSpecifier')
                    .forEach(({ exported }) => (exports[exported.name] = []));
            } else if (node.declaration) {
                if (node.declaration.type === 'FunctionDeclaration') {
                    exportName = node.declaration.id.name;
                } else if (node.declaration.type === 'VariableDeclaration') {
                    const declarator = node.declaration.declarations.find(
                        ({ type }) => type === 'VariableDeclarator'
                    );
                    exportName = declarator && declarator.id.name;
                }

                if (exportName) {
                    exports[exportName] = [];
                }
            }
        },
        ExportDefaultDeclaration() {
            exports.default = [];
        },
    };

    try {
        traverse(ast, visitor);
    } catch (e) {
        const { message } = e;
        const { loc: { filename } = {} } = ast;
        if (filename) {
            console.error(
                `[Mendel] deps (@babel/traverse) ${message} \n wile parsing: ${filename}`
            );
        } else {
            console.error(`[Mendel] deps (@babel/traverse) ${message}`);
        }
    }

    Object.keys(globals).forEach((use) => {
        imports[use] = true;
    });

    return {
        imports: Object.keys(imports),
        exports: Object.keys(exports),
    };
}

/**
 * Returns a map of imports in a file.
 * The map is keyed by the literal in the import statement to its resolved path
 * using the resolver that was pased.
 * @example of output
 * {
 *   "./foo": "src/foo/index.ts",
 *   "./bar": "src/bar.js",
 *   "../baz.js": "./baz.js"
 * }
 */
const { parse } = require('@babel/parser');
module.exports = function jsDependency(source, filePath) {
    let ast;

    try {
        ast = parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            allowHashBang: true,
            errorRecovery: true,
            sourceFilename: filePath,
            allowUndeclaredExports: true,
            allowSuperOutsideMethod: true,
            allowAwaitOutsideFunction: true,
            allowReturnOutsideFunction: true,
            allowImportExportEverywhere: true,
            allowNewTargetOutsideFunction: true,
            plugins: ['jsx', 'flow'],
        });
    } catch (e) {
        const { message, loc: { line, column } = {} } = e;

        if (message && line && column) {
            console.error(
                `[Mendel] deps (@babel/parser) ${message} ${filePath}:${line}:${column}`
            );
        } else {
            console.error(e);
        }

        return false;
    }

    return _depFinder(ast);
};

module.exports.supports = new Set(['.js', '.jsx', '.esnext']);
