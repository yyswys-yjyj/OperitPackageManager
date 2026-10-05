export declare class StringDecoder {
    static StringDecoder: typeof StringDecoder;
    readonly encoding: string;
    private pending;
    constructor(encoding?: string);
    get lastNeed(): number;
    get lastTotal(): number;
    get lastChar(): Uint8Array;
    write(buffer: Uint8Array): string;
    end(buffer?: Uint8Array): string;
    private combine;
    private writeUtf8;
    private writeUtf16;
    private writeBase64;
}
