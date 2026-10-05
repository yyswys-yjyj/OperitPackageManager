interface InspectOptions {
    depth?: number | null;
    colors?: boolean;
    showHidden?: boolean;
    compact?: boolean | number;
    breakLength?: number;
    sorted?: boolean;
    maxArrayLength?: number;
    maxStringLength?: number | null;
    getters?: boolean;
    showProxy?: boolean;
}
declare function inspect(value: unknown, options?: InspectOptions | boolean | number): string;
declare function formatWithOptions(options: InspectOptions, template?: unknown, ...rest: unknown[]): string;
declare function format(template?: unknown, ...rest: unknown[]): string;
declare function inherits(constructor: Function, superConstructor: Function): void;
declare function promisify(original: Function): Function;
declare function callbackify(original: Function): Function;
declare function deprecate(fn: Function, message: string): Function;
declare function debuglog(section: string): Function & {
    enabled: boolean;
};
declare function getSystemErrorName(errno: number): string;
declare function stripVTControlCharacters(value: string): string;
declare function isDeepStrictEqual(left: unknown, right: unknown): boolean;
declare class TextEncoder {
    readonly encoding = "utf-8";
    encode(input?: string): Uint8Array;
    encodeInto(source: string, destination: Uint8Array): {
        read: number;
        written: number;
    };
}
declare class TextDecoder {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    constructor(label?: string, options?: {
        fatal?: boolean;
        ignoreBOM?: boolean;
    });
    decode(input?: Uint8Array): string;
}
declare const util: {
    format: typeof format;
    formatWithOptions: typeof formatWithOptions;
    inspect: typeof inspect;
    inherits: typeof inherits;
    promisify: typeof promisify;
    callbackify: typeof callbackify;
    deprecate: typeof deprecate;
    debuglog: typeof debuglog;
    getSystemErrorName: typeof getSystemErrorName;
    stripVTControlCharacters: typeof stripVTControlCharacters;
    isDeepStrictEqual: typeof isDeepStrictEqual;
    types: {
        isDate: (value: unknown) => boolean;
        isRegExp: (value: unknown) => boolean;
        isArray: (value: unknown) => boolean;
        isTypedArray: (value: unknown) => boolean;
        isUint8Array: (value: unknown) => boolean;
        isArrayBuffer: (value: unknown) => boolean;
        isPromise: (value: unknown) => boolean;
        isNativeError: (value: unknown) => boolean;
        isMap: (value: unknown) => boolean;
        isSet: (value: unknown) => boolean;
        isBigInt64Array: (value: unknown) => boolean;
        isAsyncFunction: (value: unknown) => boolean;
        isGeneratorFunction: (value: unknown) => boolean;
    };
    TextEncoder: typeof TextEncoder;
    TextDecoder: typeof TextDecoder;
};
export = util;
