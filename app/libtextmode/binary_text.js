const {ega, c64} = require("./palette");
const {bytes_to_blocks, Textmode, add_sauce_for_bin} = require("./textmode");

class BinaryText extends Textmode {
    constructor(bytes) {
        super(bytes);
        if (this.columns == undefined) {
            this.columns = 160;
        }
        const rows = this.filesize / this.columns / 2;
        if (rows % 1 != 0) {
            throw("Error parsing BinaryText file: unexpected number of rows");
        }
        this.rows = rows;
        if (this.font_name == "C64 PETSCII unshifted" || this.font_name == "C64 PETSCII shifted") {
            this.palette = c64;
        } else {
            this.palette = ega;
        }
        this.data = bytes_to_blocks({columns: this.columns, rows: this.rows, bytes: this.bytes.subarray(0, this.filesize)});
    }
}

function encode_as_bin(doc, save_without_sauce) {
    if (doc.columns % 2 != 0) {
        throw("Cannot save in Binary Text format with an odd number of columns.");
    }
    const bytes = new Uint8Array(doc.data.length * 2);
    if (doc.c64_background == undefined) {
        for (let i = 0, j = 0; i < doc.data.length; i++, j += 2) {
            bytes[j] = doc.data[i].code;
            bytes[j + 1] = (doc.data[i].bg << 4) + doc.data[i].fg;
        }
    } else {
        for (let i = 0, j = 0; i < doc.data.length; i++, j += 2) {
            bytes[j] = doc.data[i].code;
            bytes[j + 1] = (doc.c64_background << 4) + doc.data[i].fg;
        }
    }
    if (!save_without_sauce) {
        return add_sauce_for_bin({doc, bytes});
    }
    return bytes;
}

module.exports = {BinaryText, encode_as_bin};
