const {ega} = require("./palette");
const {bytes_to_utf8, bytes_to_blocks, Textmode, add_sauce_for_xbin} = require("./textmode");
const repeating = {NONE: 0, CHARACTERS: 1, ATTRIBUTES: 2, BOTH_CHARACTERS_AND_ATTRIBUTES: 3};
const {encode_as_bin} = require("./binary_text");

function uncompress({bytes, columns, rows}) {
    const data = new Array(columns * rows);
    for (let i = 0, j = 0; i < bytes.length;) {
        const value = bytes[i++];
        const count = value & 63;
        switch (value >> 6) {
            case repeating.NONE:
            for (let k = 0; k <= count; i += 2, j++, k++) {
                data[j] = {code: bytes[i], bg: bytes[i + 1] >> 4, fg: bytes[i + 1] & 0xf};
            }
            break;
            case repeating.CHARACTERS:
            for (let k = 0, code = bytes[i++]; k <= count; i++, k++, j++) {
                data[j] = {code, bg: bytes[i] >> 4, fg: bytes[i] & 0xf};
            }
            break;
            case repeating.ATTRIBUTES:
            for (let k = 0, bg = bytes[i] >> 4, fg = bytes[i++] & 0xf; k <= count; i++, j++, k++) {
                data[j] = {code: bytes[i], bg, fg};
            }
            break;
            case repeating.BOTH_CHARACTERS_AND_ATTRIBUTES:
            for (let k = 0, code = bytes[i++], bg = bytes[i] >> 4, fg = bytes[i++] & 0xf; k <= count; j++, k++) {
                data[j] = {code, bg, fg};
            }
            break;
        }
    }
    return data;
}

class XBin extends Textmode {
    constructor(bytes) {
        super(bytes);
        if (bytes_to_utf8(this.bytes, 0, 4) != "XBIN" | this.bytes[4] != 0x1A) {
            throw("Error whilst attempting to load XBin file: Unexpected header.");
        }
        this.columns = (this.bytes[6] << 8) + this.bytes[5];
        this.rows = (this.bytes[8] << 8) + this.bytes[7];
        this.font_height = this.bytes[9] || 16;
        const flags = this.bytes[10];
        const palette_flag = (flags & 1) == 1;
        const font_flag = (flags >> 1 & 1) == 1;
        const compress_flag = (flags >> 2 & 1) == 1;
        this.ice_colors = (flags >> 3 & 1) == 1;
        const font_512_flag = (flags >> 4 & 1) == 1;
        if (font_512_flag) {
            throw("Error whilst attempting to load XBin file: Unsupported font size.");
        }
        let i = 11;
        if (palette_flag) {
            const palette_bytes = this.bytes.subarray(11, 11 + 48);
            this.palette = new Array(16);
            for (let i = 0, j = 0; i < 16; i++, j += 3) {
                this.palette[i] = {r: palette_bytes[j], g: palette_bytes[j + 1], b: palette_bytes[j + 2]};
            }
            i += 48;
        } else {
            this.palette = ega;
        }
        if (font_flag) {
            this.font_bytes = this.bytes.subarray(i, i + 256 * this.font_height);
            i += 256 * this.font_height;
        }
        if (compress_flag) {
            this.data = uncompress({columns: this.columns, rows: this.rows, bytes: this.bytes.subarray(i, i + this.filesize)});
        } else {
            this.data = bytes_to_blocks({columns: this.columns, rows: this.rows, bytes: this.bytes.subarray(i, i + this.filesize)});
        }
    }
}

function encode_as_xbin(doc) {
    let bin_bytes = encode_as_bin(doc);
    let header = [88, 66, 73, 78, 26, doc.columns & 255, doc.columns >> 8, doc.rows & 255, doc.rows >> 8, doc.font_height, 0];
    if (doc.palette) {
        header[10] += 1;
        const palette_bytes = [];
        for (const rgb of doc.palette) {
            palette_bytes.push(rgb.r);
            palette_bytes.push(rgb.g);
            palette_bytes.push(rgb.b);
        }
        header = header.concat(palette_bytes);
    }
    if (doc.font_bytes) {
        header[10] += 1 << 1;
        const font_bytes = [];
        for (const value of doc.font_bytes) {
            font_bytes.push(value);
        }
        header = header.concat(font_bytes);
    }
    if (doc.ice_colors) {
        header[10] += 1 << 3;
    }
    let bytes = new Uint8Array(header.length + bin_bytes.length);
    bytes.set(header, 0);
    bytes.set(bin_bytes, header.length);
    return add_sauce_for_xbin({doc, bytes});
}

module.exports = {XBin, encode_as_xbin};
