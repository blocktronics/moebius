const {Font} = require("./font");
const {create_canvas, join_canvases} = require("./canvas");
const {Ansi, encode_as_ansi} = require("./ansi");
const {BinaryText, encode_as_bin} = require("./binary_text");
const {XBin, encode_as_xbin} = require("./xbin");
const {ega, convert_ega_to_vga} = require("./palette");
const path = require("path");
const {current_date, resize_canvas} = require("./textmode");
const fs = require("fs");

async function read_file(file) {
    return new Promise((resolve) => {
        fs.readFile(file, (err, bytes) => {
            if (err) throw(`Error: ${file} not found!`);
            switch (path.extname(file).toLowerCase()) {
                case ".bin": resolve(new BinaryText(bytes)); break;
                case ".xb": resolve (new XBin(bytes)); break;
                case ".ans":
                default:
                return resolve(new Ansi(bytes));
            }
        });
    });
}

async function next_frame() {
    return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function animate({file, ctx}) {
    const doc = await read_file(file);
    const font = new Font(doc.palette);
    await font.load({name: doc.font_name, bytes: doc.font_bytes, use_9px_font: doc.use_9px_font});
    for (let y = 0, py = 0, i = 0; y < doc.rows; y++, py += font.height) {
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            const block = doc.data[i];
            if (block.bg >= 8 && !doc.ice_colors) {
                font.draw(ctx, {fg: block.fg, bg: block.bg - 8, code: block.code, fg_rgb: block.fg_rgb, bg_rgb: block.bg_rgb}, px, py);
            } else {
                font.draw(ctx, block, px, py);
            }
            if (i % 30 == 0) await next_frame();
        }
    }
}

function write_file(doc, file) {
    let bytes;
    switch (path.extname(file).toLowerCase()) {
        case ".bin":
        bytes = encode_as_bin(doc);
        break;
        case ".xb":
        bytes = encode_as_xbin(doc);
        break;
        case ".ans":
        default:
        bytes = encode_as_ansi(doc);
    }
    fs.writeFileSync(file, bytes);
}

function create_canvases(width, height, maximum_height) {
    const number_of_canvases = Math.floor(height / maximum_height);
    const canvases = [];
    const ctxs = [];
    for (let i = 0; i < number_of_canvases; i++) {
        const {canvas, ctx} = create_canvas(width, maximum_height);
        canvases.push(canvas);
        ctxs.push(ctx);
    }
    const remainder_height = height % maximum_height;
    if (remainder_height) {
        const {canvas, ctx} = create_canvas(width, remainder_height);
        canvases.push(canvas);
        ctxs.push(ctx);
    }
    return {canvases, ctxs};
}

async function render(doc) {
    const font = new Font(doc.palette);
    await font.load({name: doc.font_name, bytes: doc.font_bytes, use_9px_font: doc.use_9px_font});
    const {canvas, ctx} = create_canvas(font.width * doc.columns, font.height * doc.rows);
    for (let y = 0, py = 0, i = 0; y < doc.rows; y++, py += font.height) {
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            const block = doc.data[i];
            if (block.bg >= 8 && !doc.ice_colors) {
                font.draw(ctx, {fg: block.fg, bg: block.bg - 8, code: block.code, fg_rgb: block.fg_rgb, bg_rgb: block.bg_rgb}, px, py);
            } else {
                font.draw(ctx, block, px, py);
            }
        }
    }
    return canvas;
}

function render_blocks(blocks, font) {
    const {canvas, ctx} = create_canvas(blocks.columns * font.width, blocks.rows * font.height);
    for (let y = 0, py = 0, i = 0; y < blocks.rows; y++, py += font.height) {
        for (let x = 0, px = 0; x < blocks.columns; x++, px += font.width, i++) {
            const block = blocks.data[i];
            font.draw(ctx, block, px, py);
        }
    }
    return canvas;
}

function copy_canvases(sources) {
    return sources.map((source) => {
        const {canvas, ctx} = create_canvas(source.width, source.height);
        ctx.drawImage(source, 0, 0);
        return {canvas, ctx};
    });
}

async function render_split(doc, maximum_rows = 100) {
    const font = new Font(doc.palette);
    await font.load({name: doc.font_name, bytes: doc.font_bytes, use_9px_font: doc.use_9px_font});
    const {canvases, ctxs} = create_canvases(font.width * doc.columns, font.height * doc.rows, font.height * maximum_rows);
    for (let y = 0, py = 0, i = 0, canvas_i = 0; y < doc.rows; y++, py += font.height) {
        if (py == 100 * font.height) {
            py = 0;
            canvas_i += 1;
        }
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            font.draw(ctxs[canvas_i], doc.data[i], px, py);
        }
    }
    const blink_on_collection = copy_canvases(canvases);
    const blink_off_collection = copy_canvases(canvases);
    for (let y = 0, py = 0, i = 0, canvas_i = 0; y < doc.rows; y++, py += font.height) {
        if (py == 100 * font.height) {
            py = 0;
            canvas_i += 1;
        }
        for (let x = 0, px = 0; x < doc.columns; x++, px += font.width, i++) {
            const block = doc.data[i];
            if (block.bg >= 8 && !block.bg_rgb) {
                font.draw_bg(blink_on_collection[canvas_i].ctx, block.bg - 8, px, py);
                font.draw(blink_off_collection[canvas_i].ctx, {fg: block.fg, bg: block.bg - 8, code: block.code, fg_rgb: block.fg_rgb, bg_rgb: block.bg_rgb}, px, py);
            }
        }
    }
    return {
        columns: doc.columns,
        rows: doc.rows,
        width: doc.columns * font.width,
        height: doc.rows * font.height,
        ice_color_collection: canvases,
        blink_on_collection: blink_on_collection.map((blink_on => blink_on.canvas)),
        blink_off_collection: blink_off_collection.map((blink_off => blink_off.canvas)),
        preview_collection: copy_canvases(canvases).map((collection => collection.canvas)),
        maximum_rows,
        font: font
    };
}

function render_at(render, x, y, block) {
    const i = Math.floor(y / render.maximum_rows);
    const px = x * render.font.width;
    const py = (y % render.maximum_rows) * render.font.height;
    render.font.draw(render.ice_color_collection[i].getContext("2d"), block, px, py);
    render.font.draw(render.preview_collection[i].getContext("2d"), block, px, py);
    if (block.bg < 8) {
        render.font.draw(render.blink_on_collection[i].getContext("2d"), block, px, py);
        render.font.draw(render.blink_off_collection[i].getContext("2d"), block, px, py);
    } else {
        render.font.draw_bg(render.blink_on_collection[i].getContext("2d"), block.bg - 8, px, py);
        render.font.draw(render.blink_off_collection[i].getContext("2d"), {code: block.code, fg: block.fg, bg: block.bg - 8}, px, py);
    }
}

function flip_code_x(code) {
    switch (code) {
        case 40: return 41;
        case 41: return 40;
        case 47: return 92;
        case 60: return 62;
        case 62: return 60;
        case 91: return 93;
        case 92: return 47;
        case 93: return 91;
        case 123: return 125;
        case 125: return 123;
        case 169: return 170;
        case 170: return 169;
        case 174: return 175;
        case 175: return 174;
        case 180: return 195;
        case 181: return 198;
        case 182: return 199;
        case 183: return 214;
        case 185: return 204;
        case 187: return 201;
        case 188: return 200;
        case 189: return 211;
        case 195: return 180;
        case 198: return 181;
        case 190: return 212;
        case 191: return 218;
        case 192: return 217;
        case 199: return 182;
        case 200: return 188;
        case 201: return 187;
        case 204: return 185;
        case 211: return 189;
        case 214: return 183;
        case 212: return 190;
        case 217: return 192;
        case 218: return 191;
        case 221: return 222;
        case 222: return 221;
        case 242: return 243;
        case 243: return 242;
        default: return code;
    }
}

function flip_x(blocks) {
    const new_data = Array(blocks.data.length);
    for (let y = 0, i = 0; y < blocks.rows; y++) {
        for (let x = 0; x < blocks.columns; x++, i++) {
            new_data[blocks.columns * y + blocks.columns - 1 - x] = Object.assign({...blocks.data[i], code: flip_code_x(blocks.data[i].code)});
        }
    }
    blocks.data = new_data;
    return blocks;
}

function flip_code_y(code) {
    switch (code) {
        case 183: return 189;
        case 184: return 190;
        case 187: return 188;
        case 188: return 187;
        case 189: return 183;
        case 190: return 184;
        case 191: return 217;
        case 192: return 218;
        case 193: return 194;
        case 194: return 193;
        case 200: return 201;
        case 201: return 200;
        case 202: return 203;
        case 203: return 202;
        case 207: return 209;
        case 208: return 210;
        case 209: return 207;
        case 210: return 208;
        case 211: return 214;
        case 212: return 213;
        case 213: return 212;
        case 214: return 211;
        case 217: return 191;
        case 218: return 192;
        case 220: return 223;
        case 223: return 220;
        default: return code;
    }
}

function flip_y(blocks) {
    const new_data = Array(blocks.data.length);
    for (let y = 0, i = 0; y < blocks.rows; y++) {
        for (let x = 0; x < blocks.columns; x++, i++) {
            new_data[blocks.columns * (blocks.rows - 1 - y) + x] = Object.assign({...blocks.data[i], code: flip_code_y(blocks.data[i].code)});
        }
    }
    blocks.data = new_data;
    return blocks;
}

function rotate_code(code) {
    // TODO: more cases; http://www.asciitable.com
    switch (code) {
        case 220: return 221;
        case 221: return 223;
        case 222: return 220;
        case 187: return 188;
        case 221: return 223;
        case 223: return 222;
        default: return code;
    }
}

function rotate(blocks) {
    const new_data = Array(blocks.data.length);
    const new_columns = blocks.rows, new_rows = blocks.columns;
    for (let y = 0, i = 0; y < new_rows; y++) {
        for (let x = 0; x < new_columns; x++, i++) {
            const j = (new_columns - 1 - x) * blocks.columns + y;
            new_data[i] = Object.assign({...blocks.data[j], code: rotate_code(blocks.data[j].code)});
        }
    }
    blocks.data = new_data;
    blocks.columns = new_columns;
    blocks.rows = new_rows;
    return blocks;
}

function new_document({columns = 80, rows = 24} = {}) {
    const doc = {columns, rows, title: "", author: "", group: "", date: current_date(), ice_colors: false, use_9px_font: false, font_name: "IBM VGA", comments: []};
    doc.data = new Array(columns * rows);
    for (let i = 0; i < doc.data.length; i++) {
        doc.data[i] = {fg: 7, bg: 0, code: 32};
    }
    doc.palette = ega;
    return doc;
}

function cp437_to_unicode(cp437) {
    switch(cp437) {
        case 1: return "\u263A";
        case 2: return "\u263B";
        case 3: return "\u2665";
        case 4: return "\u2666";
        case 5: return "\u2663";
        case 6: return "\u2660";
        case 7: return "\u2022";
        case 8: return "\u25D8";
        case 9: return "\u25CB";
        case 10: return "\u25D9";
        case 11: return "\u2642";
        case 12: return "\u2640";
        case 13: return "\u266A";
        case 14: return "\u266B";
        case 15: return "\u263C";
        case 16: return "\u25BA";
        case 17: return "\u25C4";
        case 18: return "\u2195";
        case 19: return "\u203C";
        case 20: return "\u00B6";
        case 21: return "\u00A7";
        case 22: return "\u25AC";
        case 23: return "\u21A8";
        case 24: return "\u2191";
        case 25: return "\u2193";
        case 26: return "\u2192";
        case 27: return "\u2190";
        case 28: return "\u221F";
        case 29: return "\u2194";
        case 30: return "\u25B2";
        case 31: return "\u25BC";
        case 127: return "\u2302";
        case 128: return "\u00C7";
        case 129: return "\u00FC";
        case 130: return "\u00E9";
        case 131: return "\u00E2";
        case 132: return "\u00E4";
        case 133: return "\u00E0";
        case 134: return "\u00E5";
        case 135: return "\u00E7";
        case 136: return "\u00EA";
        case 137: return "\u00EB";
        case 138: return "\u00E8";
        case 139: return "\u00EF";
        case 140: return "\u00EE";
        case 141: return "\u00EC";
        case 142: return "\u00C4";
        case 143: return "\u00C5";
        case 144: return "\u00C9";
        case 145: return "\u00E6";
        case 146: return "\u00C6";
        case 147: return "\u00F4";
        case 148: return "\u00F6";
        case 149: return "\u00F2";
        case 150: return "\u00FB";
        case 151: return "\u00F9";
        case 152: return "\u00FF";
        case 153: return "\u00D6";
        case 154: return "\u00DC";
        case 155: return "\u00A2";
        case 156: return "\u00A3";
        case 157: return "\u00A5";
        case 158: return "\u20A7";
        case 159: return "\u0192";
        case 160: return "\u00E1";
        case 161: return "\u00ED";
        case 162: return "\u00F3";
        case 163: return "\u00FA";
        case 164: return "\u00F1";
        case 165: return "\u00D1";
        case 166: return "\u00AA";
        case 167: return "\u00BA";
        case 168: return "\u00BF";
        case 169: return "\u2310";
        case 170: return "\u00AC";
        case 171: return "\u00BD";
        case 172: return "\u00BC";
        case 173: return "\u00A1";
        case 174: return "\u00AB";
        case 175: return "\u00BB";
        case 176: return "\u2591";
        case 177: return "\u2592";
        case 178: return "\u2593";
        case 179: return "\u2502";
        case 180: return "\u2524";
        case 181: return "\u2561";
        case 182: return "\u2562";
        case 183: return "\u2556";
        case 184: return "\u2555";
        case 185: return "\u2563";
        case 186: return "\u2551";
        case 187: return "\u2557";
        case 188: return "\u255D";
        case 189: return "\u255C";
        case 190: return "\u255B";
        case 191: return "\u2510";
        case 192: return "\u2514";
        case 193: return "\u2534";
        case 194: return "\u252C";
        case 195: return "\u251C";
        case 196: return "\u2500";
        case 197: return "\u253C";
        case 198: return "\u255E";
        case 199: return "\u255F";
        case 200: return "\u255A";
        case 201: return "\u2554";
        case 202: return "\u2569";
        case 203: return "\u2566";
        case 204: return "\u2560";
        case 205: return "\u2550";
        case 206: return "\u256C";
        case 207: return "\u2567";
        case 208: return "\u2568";
        case 209: return "\u2564";
        case 210: return "\u2565";
        case 211: return "\u2559";
        case 212: return "\u2558";
        case 213: return "\u2552";
        case 214: return "\u2553";
        case 215: return "\u256B";
        case 216: return "\u256A";
        case 217: return "\u2518";
        case 218: return "\u250C";
        case 219: return "\u2588";
        case 220: return "\u2584";
        case 221: return "\u258C";
        case 222: return "\u2590";
        case 223: return "\u2580";
        case 224: return "\u03B1";
        case 225: return "\u00DF";
        case 226: return "\u0393";
        case 227: return "\u03C0";
        case 228: return "\u03A3";
        case 229: return "\u03C3";
        case 230: return "\u00B5";
        case 231: return "\u03C4";
        case 232: return "\u03A6";
        case 233: return "\u0398";
        case 234: return "\u03A9";
        case 235: return "\u03B4";
        case 236: return "\u221E";
        case 237: return "\u03C6";
        case 238: return "\u03B5";
        case 239: return "\u2229";
        case 240: return "\u2261";
        case 241: return "\u00B1";
        case 242: return "\u2265";
        case 243: return "\u2264";
        case 244: return "\u2320";
        case 245: return "\u2321";
        case 246: return "\u00F7";
        case 247: return "\u2248";
        case 248: return "\u00B0";
        case 249: return "\u2219";
        case 250: return "\u00B7";
        case 251: return "\u221A";
        case 252: return "\u207F";
        case 253: return "\u00B2";
        case 254: return "\u25A0";
        case 0:
        case 255: return "\u00A0";
        default: return String.fromCharCode(cp437);
    }
}

function get_data_url(canvases) {
    return join_canvases(canvases).toDataURL("image/png");
}

module.exports = {read_file, write_file, animate, render, render_split, render_at, new_document, resize_canvas, cp437_to_unicode, render_blocks, flip_x, flip_y, rotate, get_data_url, convert_ega_to_vga};
