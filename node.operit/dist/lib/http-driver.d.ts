export interface HttpRequestSpec {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
}
export interface HttpHostResponse {
    url: string;
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    contentType: string;
    content: string;
    contentBase64: string | null;
    size: number;
}
export interface HttpDriver {
    /** 返回的是**未校验**的宿主返回值，交给 normalizeResponse 校验成 HttpHostResponse。 */
    request(spec: HttpRequestSpec): Promise<unknown>;
}
/** 宿主注入点：桌面测试用，传 null 恢复为走 toolCall 的默认实现。 */
export declare function setDriver(next: HttpDriver | null): void;
/**
 * 把宿主返回的对象校验成 HttpHostResponse；形状不对就明确报错，不做静默兜底。
 *
 * 这一步必须对**所有**驱动都跑（包括测试注入的），所以由 http.ts 在 send() 里调用，
 * 而不是只放在默认驱动里 —— 否则注入的驱动会绕开校验。
 */
export declare function normalizeResponse(raw: unknown): HttpHostResponse;
export declare function getDriver(): HttpDriver;
