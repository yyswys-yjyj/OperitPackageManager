declare function isBuiltin(name: unknown): boolean;
declare function createRequire(): never;
declare const api: {
    builtinModules: string[];
    isBuiltin: typeof isBuiltin;
    createRequire: typeof createRequire;
};
export = api;
