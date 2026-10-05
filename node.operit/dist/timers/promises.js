'use strict';
function abortFailure() {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    error.code = 'ABORT_ERR';
    return error;
}
function alreadyAborted(signal) {
    return signal !== undefined && signal.aborted === true;
}
/** 到点后用 value 决议；signal 中止则用 AbortError 拒绝。 */
function waitFor(delayMs, value, options) {
    return new Promise(function (resolve, reject) {
        const signal = options === undefined ? undefined : options.signal;
        if (alreadyAborted(signal)) {
            reject(abortFailure());
            return;
        }
        let settled = false;
        const handle = setTimeout(function () {
            settled = true;
            detach();
            resolve(value);
        }, delayMs);
        const onAbort = function () {
            if (settled) {
                return;
            }
            settled = true;
            detach();
            clearTimeout(handle);
            reject(abortFailure());
        };
        function detach() {
            if (signal !== undefined && typeof signal.removeEventListener === 'function') {
                signal.removeEventListener('abort', onAbort);
            }
        }
        if (signal !== undefined && typeof signal.addEventListener === 'function') {
            signal.addEventListener('abort', onAbort);
        }
    });
}
async function* interval(delayMs, value, options) {
    for (;;) {
        await waitFor(delayMs, undefined, options);
        yield value;
    }
}
const scheduler = {
    wait: function (delayMs, options) {
        return waitFor(delayMs === undefined ? 1 : delayMs, undefined, options);
    },
    yield: function () {
        return new Promise(function (resolve) {
            queueMicrotask(function () {
                resolve();
            });
        });
    }
};
const api = {
    setTimeout: function (delayMs, value, options) {
        return waitFor(delayMs === undefined ? 1 : delayMs, value, options);
    },
    setImmediate: function (value, options) {
        return waitFor(0, value, options);
    },
    setInterval: function (delayMs, value, options) {
        return interval(delayMs, value, options);
    },
    scheduler: scheduler
};
module.exports = api;
