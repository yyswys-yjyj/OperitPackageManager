'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.deflateRaw = deflateRaw;
/**
 * 纯 JS 的 DEFLATE 压缩（RFC 1951）。
 *
 * 策略：
 *   level <= 0  -> 只用 stored 块（不压缩，但一定是合法流）
 *   level > 0   -> 定长 Huffman 块 + LZ77（哈希链，链长随 level 增大）
 *
 * 没有实现动态 Huffman（那需要再写一套频率统计与码长编码），
 * 因此压缩率不如 zlib，但**输出一定是任何解压器都能读的合法 DEFLATE 流** ——
 * 这一点由 test/zlib.test.js 的"我们压的 Node 能解"方向验证。
 */
const LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31,
    35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258
];
const LENGTH_EXTRA = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
    3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0
];
const DISTANCE_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193,
    257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577
];
const DISTANCE_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13
];
const WINDOW_SIZE = 32768;
const MIN_MATCH = 3;
const MAX_MATCH = 258;
const HASH_BITS = 15;
const HASH_SIZE = 1 << HASH_BITS;
const HASH_MASK = HASH_SIZE - 1;
function makeWriter(hint) {
    return {
        bytes: new Uint8Array(Math.max(64, hint)),
        length: 0,
        bits: 0,
        bitCount: 0
    };
}
function ensureCapacity(writer, extra) {
    if (writer.length + extra <= writer.bytes.length) {
        return;
    }
    let size = writer.bytes.length;
    while (size < writer.length + extra) {
        size *= 2;
    }
    const grown = new Uint8Array(size);
    grown.set(writer.bytes.subarray(0, writer.length));
    writer.bytes = grown;
}
/** DEFLATE 的位是"字节内低位优先"，所以按 LSB 累加。 */
function writeBits(writer, value, count) {
    writer.bits |= value << writer.bitCount;
    writer.bitCount += count;
    while (writer.bitCount >= 8) {
        ensureCapacity(writer, 1);
        writer.bytes[writer.length] = writer.bits & 0xff;
        writer.length += 1;
        writer.bits >>>= 8;
        writer.bitCount -= 8;
    }
}
/** Huffman 码本身是"高位优先"，所以逐位从最高位发出。 */
function writeCode(writer, code, length) {
    for (let i = length - 1; i >= 0; i -= 1) {
        writeBits(writer, (code >> i) & 1, 1);
    }
}
function writeFixedLiteral(writer, symbol) {
    if (symbol < 144) {
        writeCode(writer, 0x30 + symbol, 8);
    }
    else if (symbol < 256) {
        writeCode(writer, 0x190 + (symbol - 144), 9);
    }
    else if (symbol < 280) {
        writeCode(writer, symbol - 256, 7);
    }
    else {
        writeCode(writer, 0xc0 + (symbol - 280), 8);
    }
}
function writeFixedDistance(writer, symbol) {
    writeCode(writer, symbol, 5);
}
function lengthIndex(length) {
    for (let i = LENGTH_BASE.length - 1; i >= 0; i -= 1) {
        if (length >= LENGTH_BASE[i]) {
            return i;
        }
    }
    return 0;
}
function distanceIndex(distance) {
    for (let i = DISTANCE_BASE.length - 1; i >= 0; i -= 1) {
        if (distance >= DISTANCE_BASE[i]) {
            return i;
        }
    }
    return 0;
}
function flushBits(writer) {
    if (writer.bitCount > 0) {
        ensureCapacity(writer, 1);
        writer.bytes[writer.length] = writer.bits & 0xff;
        writer.length += 1;
        writer.bits = 0;
        writer.bitCount = 0;
    }
}
function writeStoredBlocks(writer, data) {
    flushBits(writer);
    let offset = 0;
    const MAX_STORED = 65535;
    if (data.length === 0) {
        writeBits(writer, 1, 1);
        writeBits(writer, 0, 2);
        flushBits(writer);
        ensureCapacity(writer, 4);
        writer.bytes[writer.length] = 0;
        writer.bytes[writer.length + 1] = 0;
        writer.bytes[writer.length + 2] = 0xff;
        writer.bytes[writer.length + 3] = 0xff;
        writer.length += 4;
        return;
    }
    while (offset < data.length) {
        const size = Math.min(MAX_STORED, data.length - offset);
        const isFinal = offset + size >= data.length ? 1 : 0;
        writeBits(writer, isFinal, 1);
        writeBits(writer, 0, 2);
        flushBits(writer);
        ensureCapacity(writer, 4 + size);
        writer.bytes[writer.length] = size & 0xff;
        writer.bytes[writer.length + 1] = (size >>> 8) & 0xff;
        writer.bytes[writer.length + 2] = (~size) & 0xff;
        writer.bytes[writer.length + 3] = ((~size) >>> 8) & 0xff;
        writer.length += 4;
        writer.bytes.set(data.subarray(offset, offset + size), writer.length);
        writer.length += size;
        offset += size;
    }
}
function hashAt(data, position) {
    const value = (data[position] << 16) ^ (data[position + 1] << 8) ^ data[position + 2];
    return (value * 2654435761) >>> (32 - HASH_BITS) & HASH_MASK;
}
function writeCompressedBlock(writer, data, maxChain) {
    const head = new Int32Array(HASH_SIZE).fill(-1);
    const previous = new Int32Array(data.length).fill(-1);
    writeBits(writer, 1, 1);
    writeBits(writer, 1, 2);
    let position = 0;
    while (position < data.length) {
        let bestLength = 0;
        let bestDistance = 0;
        if (position + MIN_MATCH <= data.length) {
            const hash = hashAt(data, position);
            let candidate = head[hash];
            let chain = 0;
            const limit = Math.max(0, position - WINDOW_SIZE);
            while (candidate >= limit && candidate >= 0 && chain < maxChain) {
                if (data[candidate] === data[position] &&
                    data[candidate + 1] === data[position + 1] &&
                    data[candidate + 2] === data[position + 2]) {
                    let length = 0;
                    const maxLength = Math.min(MAX_MATCH, data.length - position);
                    while (length < maxLength && data[candidate + length] === data[position + length]) {
                        length += 1;
                    }
                    if (length > bestLength) {
                        bestLength = length;
                        bestDistance = position - candidate;
                        if (length === maxLength) {
                            break;
                        }
                    }
                }
                candidate = previous[candidate];
                chain += 1;
            }
        }
        if (bestLength >= MIN_MATCH) {
            const lIndex = lengthIndex(bestLength);
            writeFixedLiteral(writer, 257 + lIndex);
            if (LENGTH_EXTRA[lIndex] > 0) {
                writeBits(writer, bestLength - LENGTH_BASE[lIndex], LENGTH_EXTRA[lIndex]);
            }
            const dIndex = distanceIndex(bestDistance);
            writeFixedDistance(writer, dIndex);
            if (DISTANCE_EXTRA[dIndex] > 0) {
                writeBits(writer, bestDistance - DISTANCE_BASE[dIndex], DISTANCE_EXTRA[dIndex]);
            }
            for (let i = 0; i < bestLength; i += 1) {
                const at = position + i;
                if (at + MIN_MATCH <= data.length) {
                    const hash = hashAt(data, at);
                    previous[at] = head[hash];
                    head[hash] = at;
                }
            }
            position += bestLength;
        }
        else {
            writeFixedLiteral(writer, data[position]);
            if (position + MIN_MATCH <= data.length) {
                const hash = hashAt(data, position);
                previous[position] = head[hash];
                head[hash] = position;
            }
            position += 1;
        }
    }
    writeFixedLiteral(writer, 256);
}
/** 压缩为 raw DEFLATE 流。level <= 0 时退化为 stored 块。 */
function deflateRaw(data, level) {
    const writer = makeWriter(Math.max(64, Math.floor(data.length / 2)));
    if (level <= 0) {
        writeStoredBlocks(writer, data);
        return writer.bytes.subarray(0, writer.length);
    }
    const normalized = Math.min(9, Math.floor(level));
    const maxChain = normalized <= 1 ? 4 : (normalized <= 3 ? 8 : (normalized <= 6 ? 32 : 128));
    writeCompressedBlock(writer, data, maxChain);
    flushBits(writer);
    return writer.bytes.subarray(0, writer.length);
}
