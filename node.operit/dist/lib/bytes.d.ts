export type BinaryChannel = 'base64' | 'latin1';
export declare function encodeBase64(bytes: Uint8Array): string;
/**
 * 按 Node 的容错规则解码 base64：
 *   - 字母表以外的 ASCII 字符（空白、'!' 等）跳过
 *   - 遇到 '=' 或任何码点 > 0x7f 的字符立即停止
 * 于是 'aGVsbG8=' 与 'aGVs bG8=!' 同结果，而 'a=b' 与 '🚀 emoji' 都是空。
 * 对规范 base64 输入（本库自己的编码器产物）结果与严格解码完全一致。
 */
export declare function decodeBase64(text: string): Uint8Array;
export declare function bytesToLatin1(bytes: Uint8Array): string;
export declare function latin1ToBytes(text: string): Uint8Array;
export declare function utf8Encode(text: string): Uint8Array;
export declare function utf8Decode(bytes: Uint8Array): string;
export declare function getChannel(): BinaryChannel;
export declare function setChannel(name: BinaryChannel): void;
/** 按当前通道把字节编码成可穿过 bridge 的字符串。 */
export declare function encode(bytes: Uint8Array): string;
/** 按当前通道把 bridge 返回的字符串还原成字节。 */
export declare function decode(text: string): Uint8Array;
