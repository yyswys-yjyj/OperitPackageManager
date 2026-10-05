declare function isatty(): boolean;
declare function ReadStream(): never;
declare function WriteStream(): never;
declare const api: {
    isatty: typeof isatty;
    ReadStream: typeof ReadStream;
    WriteStream: typeof WriteStream;
};
export = api;
