declare function assert(value: unknown, message?: unknown): void;
declare const exported: typeof assert & Record<string, unknown>;
export = exported;
