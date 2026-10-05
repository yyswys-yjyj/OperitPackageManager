'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.inflateRaw = inflateRaw;
exports.crc32 = crc32;
exports.adler32 = adler32;
/**
 * 纯 JS 的 DEFLATE 解压（RFC 1951），以及 zlib / gzip 的包装层校验和。
 *
 * 为什么自己实现：运行时注入的 pako 只是 1.5KB 的 shim，只支持
 * inflate(base64String, { to: 'string' })，既不解字节流也不支持 raw/zlib/gzip 区分。
 *
 * 正确性由 test/zlib.test.js 双向对拍保证：
 *   Node 压的我们能解，我们解出的与原文逐字节相同。
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
/** 动态 Huffman 头里"码长码长"的读取顺序。 */
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
function makeReader(data, start, end) {
    return { data: data, position: start, end: end, bits: 0, bitCount: 0 };
}
function readBits(reader, count) {
    let value = reader.bits;
    while (reader.bitCount < count) {
        if (reader.position >= reader.end) {
            throw new Error('unexpected end of deflate stream');
        }
        value |= reader.data[reader.position] << reader.bitCount;
        reader.position += 1;
        reader.bitCount += 8;
    }
    reader.bits = value >>> count;
    reader.bitCount -= count;
    return value & ((1 << count) - 1);
}
function alignToByte(reader) {
    reader.bits = 0;
    reader.bitCount = 0;
}
function readByteAligned(reader) {
    if (reader.position >= reader.end) {
        throw new Error('unexpected end of deflate stream');
    }
    const value = reader.data[reader.position];
    reader.position += 1;
    return value;
}
/**
 * 从码长建规范 Huffman 表。解码用 puff 的 counts/symbols 布局，
 * 逐位左移即可自动处理"码本身按 MSB 优先"的位序。
 */
function buildTable(lengths, count) {
    const counts = new Int32Array(16);
    for (let i = 0; i < count; i += 1) {
        counts[lengths[i]] += 1;
    }
    if (counts[0] === count) {
        // 全零码长：只有一种符号，按 DEFLATE 规定等价于 0 位编码
        return { counts: counts, symbols: new Int32Array(0) };
    }
    counts[0] = 0;
    const offsets = new Int32Array(16);
    for (let i = 1; i < 16; i += 1) {
        offsets[i] = offsets[i - 1] + counts[i - 1];
    }
    const symbols = new Int32Array(count);
    for (let i = 0; i < count; i += 1) {
        if (lengths[i] !== 0) {
            symbols[offsets[lengths[i]]] = i;
            offsets[lengths[i]] += 1;
        }
    }
    return { counts: counts, symbols: symbols };
}
function decodeSymbol(reader, table) {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length <= 15; length += 1) {
        code |= readBits(reader, 1);
        const count = table.counts[length];
        if (code - first < count) {
            return table.symbols[index + (code - first)];
        }
        index += count;
        first = (first + count) << 1;
        code <<= 1;
    }
    throw new Error('invalid huffman code');
}
let FIXED_LITERAL = null;
let FIXED_DISTANCE = null;
function fixedTables() {
    if (FIXED_LITERAL === null || FIXED_DISTANCE === null) {
        const literalLengths = new Int32Array(288);
        for (let i = 0; i < 144; i += 1) {
            literalLengths[i] = 8;
        }
        for (let i = 144; i < 256; i += 1) {
            literalLengths[i] = 9;
        }
        for (let i = 256; i < 280; i += 1) {
            literalLengths[i] = 7;
        }
        for (let i = 280; i < 288; i += 1) {
            literalLengths[i] = 8;
        }
        const distanceLengths = new Int32Array(30);
        for (let i = 0; i < 30; i += 1) {
            distanceLengths[i] = 5;
        }
        FIXED_LITERAL = buildTable(literalLengths, 288);
        FIXED_DISTANCE = buildTable(distanceLengths, 30);
    }
    return { literal: FIXED_LITERAL, distance: FIXED_DISTANCE };
}
function ensureCapacity(output, extra) {
    if (output.length + extra <= output.bytes.length) {
        return;
    }
    let size = output.bytes.length === 0 ? Math.max(64, extra) : output.bytes.length;
    while (size < output.length + extra) {
        size *= 2;
    }
    const grown = new Uint8Array(size);
    grown.set(output.bytes.subarray(0, output.length));
    output.bytes = grown;
}
function inflateBlockData(reader, output, literal, distance) {
    for (;;) {
        const symbol = decodeSymbol(reader, literal);
        if (symbol === 256) {
            return;
        }
        if (symbol < 256) {
            ensureCapacity(output, 1);
            output.bytes[output.length] = symbol;
            output.length += 1;
            continue;
        }
        const lengthIndex = symbol - 257;
        if (lengthIndex >= LENGTH_BASE.length) {
            throw new Error('invalid length code');
        }
        const matchLength = LENGTH_BASE[lengthIndex] + readBits(reader, LENGTH_EXTRA[lengthIndex]);
        const distanceSymbol = decodeSymbol(reader, distance);
        if (distanceSymbol >= DISTANCE_BASE.length) {
            throw new Error('invalid distance code');
        }
        const matchDistance = DISTANCE_BASE[distanceSymbol] + readBits(reader, DISTANCE_EXTRA[distanceSymbol]);
        if (matchDistance > output.length) {
            throw new Error('distance too far back');
        }
        ensureCapacity(output, matchLength);
        let source = output.length - matchDistance;
        for (let i = 0; i < matchLength; i += 1) {
            output.bytes[output.length] = output.bytes[source];
            output.length += 1;
            source += 1;
        }
    }
}
function inflateDynamicTables(reader) {
    const literalCount = readBits(reader, 5) + 257;
    const distanceCount = readBits(reader, 5) + 1;
    const codeLengthCount = readBits(reader, 4) + 4;
    const codeLengths = new Int32Array(19);
    for (let i = 0; i < codeLengthCount; i += 1) {
        codeLengths[CODE_LENGTH_ORDER[i]] = readBits(reader, 3);
    }
    const codeLengthTable = buildTable(codeLengths, 19);
    const lengths = new Int32Array(literalCount + distanceCount);
    let index = 0;
    while (index < lengths.length) {
        const symbol = decodeSymbol(reader, codeLengthTable);
        if (symbol < 16) {
            lengths[index] = symbol;
            index += 1;
        }
        else if (symbol === 16) {
            if (index === 0) {
                throw new Error('repeat with no previous code length');
            }
            const previous = lengths[index - 1];
            const repeat = readBits(reader, 2) + 3;
            for (let i = 0; i < repeat; i += 1) {
                lengths[index] = previous;
                index += 1;
            }
        }
        else if (symbol === 17) {
            const repeat = readBits(reader, 3) + 3;
            index += repeat;
        }
        else {
            const repeat = readBits(reader, 7) + 11;
            index += repeat;
        }
    }
    const literal = buildTable(lengths.subarray(0, literalCount), literalCount);
    const distance = buildTable(lengths.subarray(literalCount), distanceCount);
    return { literal: literal, distance: distance };
}
/** 解压 raw DEFLATE 数据。 */
function inflateRaw(data, start, end) {
    const reader = makeReader(data, start, end);
    const output = { bytes: new Uint8Array(Math.max(64, (end - start) * 4)), length: 0 };
    const fixed = fixedTables();
    for (;;) {
        const isFinal = readBits(reader, 1);
        const blockType = readBits(reader, 2);
        if (blockType === 0) {
            alignToByte(reader);
            const length = readByteAligned(reader) | (readByteAligned(reader) << 8);
            const inverted = readByteAligned(reader) | (readByteAligned(reader) << 8);
            if ((length ^ 0xffff) !== inverted) {
                throw new Error('stored block length mismatch');
            }
            ensureCapacity(output, length);
            for (let i = 0; i < length; i += 1) {
                output.bytes[output.length] = readByteAligned(reader);
                output.length += 1;
            }
        }
        else if (blockType === 1) {
            inflateBlockData(reader, output, fixed.literal, fixed.distance);
        }
        else if (blockType === 2) {
            const tables = inflateDynamicTables(reader);
            inflateBlockData(reader, output, tables.literal, tables.distance);
        }
        else {
            throw new Error('invalid deflate block type');
        }
        if (isFinal === 1) {
            break;
        }
    }
    return output.bytes.subarray(0, output.length);
}
// ------------------------------------------------------------------ 校验和
const CRC_TABLE = (function buildCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();
/** gzip 的 CRC-32（IEEE 802.3）。 */
function crc32(data, start, end) {
    let crc = 0xffffffff;
    for (let i = start; i < end; i += 1) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
/** zlib 的 Adler-32。 */
function adler32(data, start, end) {
    let a = 1;
    let b = 0;
    for (let i = start; i < end; i += 1) {
        a = (a + data[i]) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}
