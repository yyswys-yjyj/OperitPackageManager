export declare function isDeepStrictEqual(left: unknown, right: unknown, loose?: boolean): boolean;
/** Node 的旧版宽松深比较（assert.deepEqual），叶子用 == 且不检查原型。 */
export declare function isDeepEqual(left: unknown, right: unknown): boolean;
