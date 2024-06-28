let debugFileMatching = process.env.DEBUG_FILE_MATCHING;
if (debugFileMatching && debugFileMatching !== '') {
    debugFileMatching = new RegExp(debugFileMatching);
}

module.exports = function debugFilter(
    debug,
    messageOrDebugArgs,
    fileName,
    arrayCheck,
    arrayProp
) {
    if (!fileName && typeof messageOrDebugArgs === 'string') {
        fileName = messageOrDebugArgs;
    }
    if (typeof fileName !== 'string') return false;

    let shouldLog = debug.enabled;
    if (debugFileMatching) {
        shouldLog = debugFileMatching.test(fileName);
        if (Array.isArray(arrayCheck) && !arrayProp) {
            shouldLog = arrayCheck.some((_) => debugFileMatching.test(_));
        }
        if (Array.isArray(arrayCheck) && arrayProp) {
            shouldLog = arrayCheck.some((_) =>
                debugFileMatching.test(_[arrayProp])
            );
        }
    }
    if (shouldLog) {
        if (Array.isArray(messageOrDebugArgs)) {
            debug.apply(null, messageOrDebugArgs);
            return shouldLog;
        }
        debug(messageOrDebugArgs);
    }
    return shouldLog;
};
