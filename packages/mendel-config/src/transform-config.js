var createValidator = require('./validator');
var resolvePlugin = require('./resolve-plugin');

function TransformConfig(
    id,
    transform,
    { projectRoot, baseConfig, variationConfig }
) {
    this.id = id;
    this.options = {
        projectRoot,
        baseConfig,
        variationConfig,
        ...transform.options,
    };

    var resolved = resolvePlugin(transform.plugin, projectRoot);
    this.plugin = resolved.plugin;
    this.mode = resolved.mode;

    TransformConfig.validate(this);
}

TransformConfig.validate = createValidator({
    id: { required: true },
    plugin: { required: true },
    mode: { required: true },
});

module.exports = TransformConfig;
