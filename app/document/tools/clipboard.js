const electron = require("electron");
const libtextmode = require("../../libtextmode/libtextmode");
const doc = require("../doc");
const palette = require("../palette");

function copy(blocks) {
    const text = [];
    for (let y = 0, i = 0; y < blocks.rows; y++) {
        text.push("");
        for (let x = 0; x < blocks.columns; x++, i++) {
            text[text.length - 1] += libtextmode.cp437_to_unicode(blocks.data[i].code);
        }
    }
    electron.clipboard.write({text: text.join("\r\n"), html: JSON.stringify(blocks)});
}

function paste_blocks() {
    try {
        const blocks = JSON.parse(electron.clipboard.readHTML().replace(/^<[^>]+>/, ""));
        if (blocks.columns && blocks.rows && (blocks.data.length == blocks.columns * blocks.rows)) {
            return blocks;
        } else {
            throw("catch!");
        }
    } catch (err) {
        const text = electron.clipboard.readText();
        if (text.length) {
            const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
            if (!lines.length) return;
            const columns = Math.max.apply(null, lines.map((line) => line.length));
            const rows = lines.length;
            const data = new Array(columns * rows);
            const {fg, bg} = palette;
            for (let y = 0, i = 0; y < rows; y++) {
                for (let x = 0; x < columns; x++, i++) {
                    data[i] = {code: (x >= lines[y].length) ? 32 : lines[y].charCodeAt(x), fg, bg};
                }
            }
            return {columns, rows, data};
        }
    }
}

function paste(x, y) {
    const blocks = paste_blocks();
    if (!paste_blocks) return;
    doc.place(blocks, x, y);
}

module.exports = {copy, paste_blocks, paste};
