const {Font} = require("./font");
const {create_canvas, join_canvases} = require("./canvas");
const {Ansi, encode_as_ansi} = require("./ansi");
const {BinaryText, encode_as_bin} = require("./binary_text");
const {XBin, encode_as_xbin} = require("./xbin");
const {ega, convert_ega_to_style, has_default_palette} = require("./palette");
const path = require("path");
const {current_date, resize_canvas} = require("./textmode");
const {cp437_to_unicode, cp437_to_unicode_bytes, unicode_to_cp437} = require("./encodings");
const fs = require("fs");
const upng = require("upng-js");

function read_bytes(bytes, file) {
    switch (path.extname(file).toLowerCase()) {
        case ".bin": return new BinaryText(bytes);
        case ".xb": return new XBin(bytes);
        case ".ans":
        default:
        return new Ansi(bytes);
    }
}

async function read_file(file) {
    return new Promise((resolve) => {
        fs.readFile(file, (err, bytes) => {
            if (err) throw(`Error: ${file} not found!`);
            resolve(read_bytes(bytes, file));
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

function write_file(doc, file, {utf8 = false} = {}) {
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
        bytes = encode_as_ansi(doc, {utf8});
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
    return {canvas, font};
}

function render_blocks(blocks, font) {
    const {canvas, ctx} = create_canvas(blocks.columns * font.width, blocks.rows * font.height);
    for (let y = 0, py = 0, i = 0; y < blocks.rows; y++, py += font.height) {
        for (let x = 0, px = 0; x < blocks.columns; x++, px += font.width, i++) {
            const block = blocks.data[i];
            if (!blocks.transparent || block.code != 32 || block.bg != 0) font.draw(ctx, block, px, py);
        }
    }
    return canvas;
}

function merge_blocks(under_blocks, over_blocks) {
    const merged_blocks = {columns: Math.max(under_blocks.columns, over_blocks.columns), rows: Math.max(under_blocks.rows, over_blocks.rows), data: new Array(Math.max(under_blocks.rows, over_blocks.rows) * Math.max(under_blocks.columns, over_blocks.columns)), transparent: false};
    for (let y = 0, i = 0; y < merged_blocks.rows; y++) {
        for (let x = 0; x < merged_blocks.columns; x++, i++) {
            const under_block = (y < under_blocks.rows && x < under_blocks.columns) ? under_blocks.data[y * under_blocks.columns + x] : undefined;
            const over_block = (y < over_blocks.rows && x < over_blocks.columns) ? over_blocks.data[y * over_blocks.columns + x] : undefined;
            if (over_block == undefined || (over_block.code == 32 && over_block.bg == 0)) {
                merged_blocks.data[i] = Object.assign(under_block);
            } else {
                merged_blocks.data[i] = Object.assign(over_block);
            }
        }
    }
    return merged_blocks;
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

function render_insert_column(doc, x, render) {
    const sx = x * render.font.width;
    const width = render.width - x * render.font.width - render.font.width;
    const dx = sx + render.font.width;
    for (let i = 0; i < render.ice_color_collection.length; i++) {
        render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i], sx, 0, width, render.ice_color_collection[i].height, dx, 0, width, render.ice_color_collection[i].height);
        render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i], sx, 0, width, render.preview_collection[i].height, dx, 0, width, render.preview_collection[i].height);
        render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i], sx, 0, width, render.blink_on_collection[i].height, dx, 0, width, render.blink_on_collection[i].height);
        render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i], sx, 0, width, render.blink_off_collection[i].height, dx, 0, width, render.blink_off_collection[i].height);
    }
    for (let y = 0; y < doc.rows; y++) render_at(render, x, y, doc.data[y * doc.columns + x]);
}

function render_delete_column(doc, x, render) {
    const sx = x * render.font.width + render.font.width;
    const width = render.width - x * render.font.width - render.font.width;
    const dx = sx - render.font.width;
    for (let i = 0; i < render.ice_color_collection.length; i++) {
        render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i], sx, 0, width, render.ice_color_collection[i].height, dx, 0, width, render.ice_color_collection[i].height);
        render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i], sx, 0, width, render.preview_collection[i].height, dx, 0, width, render.preview_collection[i].height);
        render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i], sx, 0, width, render.blink_on_collection[i].height, dx, 0, width, render.blink_on_collection[i].height);
        render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i], sx, 0, width, render.blink_off_collection[i].height, dx, 0, width, render.blink_off_collection[i].height);
    }
    for (let y = 0; y < doc.rows; y++) render_at(render, doc.columns - 1, y, doc.data[y * doc.columns + doc.columns - 1]);
}

function render_insert_row(doc, y, render) {
    const canvas_row = Math.floor(y / render.maximum_rows);
    for (let i = render.ice_color_collection.length - 1; i > canvas_row; i--) {
        const ice_color_ctx = render.ice_color_collection[i].getContext("2d");
        const preview_collection_ctx = render.preview_collection[i].getContext("2d");
        const blink_on_ctx = render.blink_on_collection[i].getContext("2d");
        const blink_off_ctx = render.blink_off_collection[i].getContext("2d");
        ice_color_ctx.drawImage(render.ice_color_collection[i], 0, 0, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height, 0, render.font.height, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height);
        ice_color_ctx.drawImage(render.ice_color_collection[i - 1], 0, render.ice_color_collection[i - 1].height - render.font.height, render.ice_color_collection[i - 1].width, render.font.height, 0, 0, render.ice_color_collection[i].width, render.font.height);
        preview_collection_ctx.drawImage(render.preview_collection[i], 0, 0, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height, 0, render.font.height, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height);
        preview_collection_ctx.drawImage(render.preview_collection[i - 1], 0, render.preview_collection[i - 1].height - render.font.height, render.preview_collection[i - 1].width, render.font.height, 0, 0, render.preview_collection[i].width, render.font.height);
        blink_on_ctx.drawImage(render.blink_on_collection[i], 0, 0, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height, 0, render.font.height, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height);
        blink_on_ctx.drawImage(render.blink_on_collection[i - 1], 0, render.blink_on_collection[i - 1].height - render.font.height, render.blink_on_collection[i - 1].width, render.font.height, 0, 0, render.blink_on_collection[i].width, render.font.height);
        blink_off_ctx.drawImage(render.blink_off_collection[i], 0, 0, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height, 0, render.font.height, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height);
        blink_off_ctx.drawImage(render.blink_off_collection[i - 1], 0, render.blink_off_collection[i - 1].height - render.font.height, render.blink_off_collection[i - 1].width, render.font.height, 0, 0, render.blink_off_collection[i].width, render.font.height);
    }
    const sy = (y % render.maximum_rows) * render.font.height;
    const height = render.ice_color_collection[canvas_row].height - sy - render.font.height;
    render.ice_color_collection[canvas_row].getContext("2d").drawImage(render.ice_color_collection[canvas_row], 0, sy, render.ice_color_collection[canvas_row].width, height, 0, sy + render.font.height, render.ice_color_collection[canvas_row].width, height);
    render.preview_collection[canvas_row].getContext("2d").drawImage(render.preview_collection[canvas_row], 0, sy, render.preview_collection[canvas_row].width, height, 0, sy + render.font.height, render.preview_collection[canvas_row].width, height);
    render.blink_on_collection[canvas_row].getContext("2d").drawImage(render.blink_on_collection[canvas_row], 0, sy, render.blink_on_collection[canvas_row].width, height, 0, sy + render.font.height, render.blink_on_collection[canvas_row].width, height);
    render.blink_off_collection[canvas_row].getContext("2d").drawImage(render.blink_off_collection[canvas_row], 0, sy, render.blink_off_collection[canvas_row].width, height, 0, sy + render.font.height, render.blink_off_collection[canvas_row].width, height);
    for (let x = 0; x < doc.columns; x++) render_at(render, x, y, doc.data[y * doc.columns + x]);
}

function render_delete_row(doc, y, render) {
    const canvas_row = Math.floor(y / render.maximum_rows);
    if ((y % render.maximum_rows) + 1 < render.maximum_rows) {
        const sy = (y % render.maximum_rows) * render.font.height + render.font.height;
        const height = render.ice_color_collection[canvas_row].height - sy;
        render.ice_color_collection[canvas_row].getContext("2d").drawImage(render.ice_color_collection[canvas_row], 0, sy, render.ice_color_collection[canvas_row].width, height, 0, sy - render.font.height, render.ice_color_collection[canvas_row].width, height);
        render.preview_collection[canvas_row].getContext("2d").drawImage(render.preview_collection[canvas_row], 0, sy, render.preview_collection[canvas_row].width, height, 0, sy - render.font.height, render.preview_collection[canvas_row].width, height);
        render.blink_on_collection[canvas_row].getContext("2d").drawImage(render.blink_on_collection[canvas_row], 0, sy, render.blink_on_collection[canvas_row].width, height, 0, sy - render.font.height, render.blink_on_collection[canvas_row].width, height);
        render.blink_off_collection[canvas_row].getContext("2d").drawImage(render.blink_off_collection[canvas_row], 0, sy, render.blink_off_collection[canvas_row].width, height, 0, sy - render.font.height, render.blink_off_collection[canvas_row].width, height);
    }
    if (canvas_row < render.ice_color_collection.length - 1) {
        render.ice_color_collection[canvas_row].getContext("2d").drawImage(render.ice_color_collection[canvas_row + 1], 0, 0, render.ice_color_collection[canvas_row + 1].width, render.font.height, 0, render.ice_color_collection[canvas_row].height - render.font.height, render.ice_color_collection[canvas_row].width, render.font.height);
        render.preview_collection[canvas_row].getContext("2d").drawImage(render.preview_collection[canvas_row + 1], 0, 0, render.preview_collection[canvas_row + 1].width, render.font.height, 0, render.preview_collection[canvas_row].height - render.font.height, render.preview_collection[canvas_row].width, render.font.height);
        render.blink_on_collection[canvas_row].getContext("2d").drawImage(render.blink_on_collection[canvas_row + 1], 0, 0, render.blink_on_collection[canvas_row + 1].width, render.font.height, 0, render.blink_on_collection[canvas_row].height - render.font.height, render.blink_on_collection[canvas_row].width, render.font.height);
        render.blink_off_collection[canvas_row].getContext("2d").drawImage(render.blink_off_collection[canvas_row + 1], 0, 0, render.blink_off_collection[canvas_row + 1].width, render.font.height, 0, render.blink_off_collection[canvas_row].height - render.font.height, render.blink_off_collection[canvas_row].width, render.font.height);
    }
    for (let i = canvas_row + 1; i < render.ice_color_collection.length; i++) {
        render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i], 0, render.font.height, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height, 0, 0, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height);
        render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i], 0, render.font.height, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height, 0, 0, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height);
        render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i], 0, render.font.height, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height, 0, 0, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height);
        render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i], 0, render.font.height, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height, 0, 0, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height);
        if (i < render.ice_color_collection.length - 1) {
            render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i + 1], 0, 0, render.ice_color_collection[i + 1].width, render.font.height, 0, render.ice_color_collection[i].height - render.font.height, render.ice_color_collection[i].width, render.font.height);
            render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i + 1], 0, 0, render.preview_collection[i + 1].width, render.font.height, 0, render.preview_collection[i].height - render.font.height, render.preview_collection[i].width, render.font.height);
            render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i + 1], 0, 0, render.blink_on_collection[i + 1].width, render.font.height, 0, render.blink_on_collection[i].height - render.font.height, render.blink_on_collection[i].width, render.font.height);
            render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i + 1], 0, 0, render.blink_off_collection[i + 1].width, render.font.height, 0, render.blink_off_collection[i].height - render.font.height, render.blink_off_collection[i].width, render.font.height);
        }
    }
    for (let x = 0; x < doc.columns; x++) render_at(render, x, doc.rows - 1, doc.data[(doc.rows - 1) * doc.columns + x]);
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

function insert_row(doc, insert_y, blocks) {
    const removed_blocks = new Array(doc.columns);
    for (let x = 0; x < doc.columns; x++) removed_blocks[x] = Object.assign(doc.data[(doc.rows - 1) * doc.columns + x]);
    for (let y = doc.rows - 1; y > insert_y; y--) {
        for (let x = 0; x < doc.columns; x++) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i - doc.columns]);
        }
    }
    for (let x = 0; x < doc.columns; x++) doc.data[insert_y * doc.columns + x] = blocks ? Object.assign(blocks[x]) : {fg: 7, bg: 0, code: 32};
    return removed_blocks;
}

function delete_row(doc, delete_y, blocks) {
    const removed_blocks = new Array(doc.columns);
    for (let x = 0; x < doc.columns; x++) removed_blocks[x] = Object.assign(doc.data[delete_y * doc.columns + x]);
    for (let y = delete_y; y < doc.rows - 1; y++) {
        for (let x = 0; x < doc.columns; x++) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i + doc.columns]);
        }
    }
    for (let x = 0; x < doc.columns; x++) doc.data[(doc.rows - 1) * doc.columns + x] = blocks ? Object.assign(blocks[x]) : {fg: 7, bg: 0, code: 32};
    return removed_blocks;
}

function insert_column(doc, insert_x, blocks) {
    const removed_blocks = new Array(doc.rows);
    for (let y = 0; y < doc.rows; y++) removed_blocks[y] = Object.assign(doc.data[y * doc.columns + doc.columns - 1]);
    for (let x = doc.columns - 1; x > insert_x; x--) {
        for (let y = 0; y < doc.rows; y++) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i - 1]);
        }
    }
    for (let y = 0; y < doc.rows; y++) doc.data[y * doc.columns + insert_x] = blocks ? Object.assign(blocks[y]) : {fg: 7, bg: 0, code: 32};
    return removed_blocks;
}

function delete_column(doc, delete_x, blocks) {
    const removed_blocks = new Array(doc.rows);
    for (let y = 0; y < doc.rows; y++) removed_blocks[y] = Object.assign(doc.data[y * doc.columns + delete_x]);
    for (let x = delete_x; x < doc.columns - 1; x++) {
        for (let y = 0; y < doc.rows; y++) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i + 1]);
        }
    }
    for (let y = 0; y < doc.rows; y++) doc.data[y * doc.columns + doc.columns - 1] = blocks ? Object.assign(blocks[y]) : {fg: 7, bg: 0, code: 32};
    return removed_blocks;
}

function scroll_canvas_up(doc) {
    for (let x = 0; x < doc.columns; x++) {
        const overwritten_block = Object.assign(doc.data[x]);
        for (let y = 0; y < doc.rows - 1; y++) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i + doc.columns]);
        }
        doc.data[(doc.rows - 1) * doc.columns + x] = Object.assign(overwritten_block);
    }
}

function scroll_canvas_down(doc) {
    for (let x = 0; x < doc.columns; x++) {
        const overwritten_block = Object.assign(doc.data[(doc.rows - 1) * doc.columns + x]);
        for (let y = doc.rows; y > 0; y--) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i - doc.columns]);
        }
        doc.data[x] = Object.assign(overwritten_block);
    }
}

function scroll_canvas_left(doc) {
    for (let y = 0; y < doc.rows; y++) {
        const overwritten_block = Object.assign(doc.data[y * doc.columns]);
        for (let x = 0; x < doc.columns - 1; x++) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i + 1]);
        }
        doc.data[y * doc.columns + doc.columns - 1] = Object.assign(overwritten_block);
    }
}

function scroll_canvas_right(doc) {
    for (let y = 0; y < doc.rows; y++) {
        const overwritten_block = Object.assign(doc.data[y * doc.columns + doc.columns - 1]);
        for (let x = doc.columns - 1; x > 0; x--) {
            const i = y * doc.columns + x;
            doc.data[i] = Object.assign(doc.data[i - 1]);
        }
        doc.data[y * doc.columns] = Object.assign(overwritten_block);
    }
}

function render_scroll_canvas_up(doc, render) {
    for (let i = 0; i < render.ice_color_collection.length; i++) {
        render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i], 0, render.font.height, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height, 0, 0, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height);
        render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i], 0, render.font.height, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height, 0, 0, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height);
        render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i], 0, render.font.height, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height, 0, 0, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height);
        render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i], 0, render.font.height, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height, 0, 0, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height);
        if (i < render.ice_color_collection.length - 1) {
            render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i + 1], 0, 0, render.ice_color_collection[i + 1].width, render.font.height, 0, render.ice_color_collection[i].height - render.font.height, render.ice_color_collection[i].width, render.font.height);
            render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i + 1], 0, 0, render.preview_collection[i + 1].width, render.font.height, 0, render.preview_collection[i].height - render.font.height, render.preview_collection[i].width, render.font.height);
            render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i + 1], 0, 0, render.blink_on_collection[i + 1].width, render.font.height, 0, render.blink_on_collection[i].height - render.font.height, render.blink_on_collection[i].width, render.font.height);
            render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i + 1], 0, 0, render.blink_off_collection[i + 1].width, render.font.height, 0, render.blink_off_collection[i].height - render.font.height, render.blink_off_collection[i].width, render.font.height);
        }
    }
    for (let x = 0; x < doc.columns; x++) render_at(render, x, doc.rows - 1, doc.data[(doc.rows - 1) * doc.columns + x]);
}

function render_scroll_canvas_down(doc, render) {
    for (let i = render.ice_color_collection.length - 1; i >= 0; i--) {
        const ice_color_ctx = render.ice_color_collection[i].getContext("2d");
        const preview_collection_ctx = render.preview_collection[i].getContext("2d");
        const blink_on_ctx = render.blink_on_collection[i].getContext("2d");
        const blink_off_ctx = render.blink_off_collection[i].getContext("2d");
        ice_color_ctx.drawImage(render.ice_color_collection[i], 0, 0, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height, 0, render.font.height, render.ice_color_collection[i].width, render.ice_color_collection[i].height - render.font.height);
        preview_collection_ctx.drawImage(render.preview_collection[i], 0, 0, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height, 0, render.font.height, render.preview_collection[i].width, render.preview_collection[i].height - render.font.height);
        blink_on_ctx.drawImage(render.blink_on_collection[i], 0, 0, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height, 0, render.font.height, render.blink_on_collection[i].width, render.blink_on_collection[i].height - render.font.height);
        blink_off_ctx.drawImage(render.blink_off_collection[i], 0, 0, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height, 0, render.font.height, render.blink_off_collection[i].width, render.blink_off_collection[i].height - render.font.height);
        if (i > 0) {
            ice_color_ctx.drawImage(render.ice_color_collection[i - 1], 0, render.ice_color_collection[i - 1].height - render.font.height, render.ice_color_collection[i - 1].width, render.font.height, 0, 0, render.ice_color_collection[i].width, render.font.height);
            preview_collection_ctx.drawImage(render.preview_collection[i - 1], 0, render.preview_collection[i - 1].height - render.font.height, render.preview_collection[i - 1].width, render.font.height, 0, 0, render.preview_collection[i].width, render.font.height);
            blink_on_ctx.drawImage(render.blink_on_collection[i - 1], 0, render.blink_on_collection[i - 1].height - render.font.height, render.blink_on_collection[i - 1].width, render.font.height, 0, 0, render.blink_on_collection[i].width, render.font.height);
            blink_off_ctx.drawImage(render.blink_off_collection[i - 1], 0, render.blink_off_collection[i - 1].height - render.font.height, render.blink_off_collection[i - 1].width, render.font.height, 0, 0, render.blink_off_collection[i].width, render.font.height);
        }
    }
    for (let x = 0; x < doc.columns; x++) render_at(render, x, 0, doc.data[x]);
}

function render_scroll_canvas_left(doc, render) {
    for (let i = 0; i < render.ice_color_collection.length; i++) {
        render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i], render.font.width, 0, render.ice_color_collection[i].width - render.font.width, render.ice_color_collection[i].height, 0, 0, render.ice_color_collection[i].width - render.font.width, render.ice_color_collection[i].height);
        render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i], render.font.width, 0, render.preview_collection[i].width - render.font.width, render.preview_collection[i].height, 0, 0, render.preview_collection[i].width - render.font.width, render.preview_collection[i].height);
        render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i], render.font.width, 0, render.blink_on_collection[i].width - render.font.width, render.blink_on_collection[i].height, 0, 0, render.blink_on_collection[i].width - render.font.width, render.blink_on_collection[i].height);
        render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i], render.font.width, 0, render.blink_off_collection[i].width - render.font.width, render.blink_off_collection[i].height, 0, 0, render.blink_off_collection[i].width - render.font.width, render.blink_off_collection[i].height);
    }
    for (let y = 0; y < doc.rows; y++) render_at(render, doc.columns - 1, y, doc.data[y * doc.columns + doc.columns - 1]);
}

function render_scroll_canvas_right(doc, render) {
    for (let i = 0; i < render.ice_color_collection.length; i++) {
        render.ice_color_collection[i].getContext("2d").drawImage(render.ice_color_collection[i], 0, 0, render.ice_color_collection[i].width - render.font.width, render.ice_color_collection[i].height, render.font.width, 0, render.ice_color_collection[i].width - render.font.width, render.ice_color_collection[i].height);
        render.preview_collection[i].getContext("2d").drawImage(render.preview_collection[i], 0, 0, render.preview_collection[i].width - render.font.width, render.preview_collection[i].height, render.font.width, 0, render.preview_collection[i].width - render.font.width, render.preview_collection[i].height);
        render.blink_on_collection[i].getContext("2d").drawImage(render.blink_on_collection[i], 0, 0, render.blink_on_collection[i].width - render.font.width, render.blink_on_collection[i].height, render.font.width, 0, render.blink_on_collection[i].width - render.font.width, render.blink_on_collection[i].height);
        render.blink_off_collection[i].getContext("2d").drawImage(render.blink_off_collection[i], 0, 0, render.blink_off_collection[i].width - render.font.width, render.blink_off_collection[i].height, render.font.width, 0, render.blink_off_collection[i].width - render.font.width, render.blink_off_collection[i].height);
    }
    for (let y = 0; y < doc.rows; y++) render_at(render, 0, y, doc.data[y * doc.columns]);
}

function new_document({columns = 80, rows = 100, title = "", author = "", group = "", date = "", palette = ega, font_name = "IBM VGA", ice_colors = false, use_9px_font = false, comments = "", data} = {}) {
    const doc = {columns, rows, title, author, group, date: (date != "") ? date : current_date(), palette, font_name, ice_colors, use_9px_font, comments};
    if (!data || data.length != columns * rows) {
        doc.data = new Array(columns * rows);
        for (let i = 0; i < doc.data.length; i++) doc.data[i] = {fg: 7, bg: 0, code: 32};
    } else {
        doc.data = data;
    }
    return doc;
}

function clone_document(doc) {
    return new_document({columns: doc.columns, rows: doc.rows, title: doc.title, author: doc.author, group: doc.group, date: doc.data, palette: doc.palette, font_name: doc.font_name, ice_colors: doc.ice_colors, use_9px_font: doc.use_9px_font, comments: doc.comments, data: doc.data});
}

function get_data_url(canvases) {
    return join_canvases(canvases).toDataURL("image/png");
}

function compress(doc) {
    const compressed_data = {code: [], fg: [], bg: []};
    for (let i = 0, code_repeat = 0, fg_repeat = 0, bg_repeat = 0; i < doc.data.length; i++) {
        const block = doc.data[i];
        if (i + 1 == doc.data.length) {
            compressed_data.code.push([block.code, code_repeat]);
            compressed_data.fg.push([block.fg, fg_repeat]);
            compressed_data.bg.push([block.bg, bg_repeat]);
        } else {
            const next_block = doc.data[i + 1];
            if (block.code != next_block.code) {
                compressed_data.code.push([block.code, code_repeat]);
                code_repeat = 0;
            } else {
                code_repeat += 1;
            }
            if (block.fg != next_block.fg) {
                compressed_data.fg.push([block.fg, fg_repeat]);
                fg_repeat = 0;
            } else {
                fg_repeat += 1;
            }
            if (block.bg != next_block.bg) {
                compressed_data.bg.push([block.bg, bg_repeat]);
                bg_repeat = 0;
            } else {
                bg_repeat += 1;
            }
        }
    }
    return {columns: doc.columns, rows: doc.rows, title: doc.title, author: doc.author, group: doc.group, date: doc.date, palette: doc.palette, font_name: doc.font_name, ice_colors: doc.ice_colors, use_9px_font: doc.use_9px_font, comments: doc.comments, compressed_data};
}

function uncompress(doc) {
    if (doc.compressed_data) {
        const codes = [];
        const fgs = [];
        const bgs = [];
        for (const code of doc.compressed_data.code) {
            for (let i = 0; i <= code[1]; i++) codes.push(code[0]);
        }
        for (const fg of doc.compressed_data.fg) {
            for (let i = 0; i <= fg[1]; i++) fgs.push(fg[0]);
        }
        for (const bg of doc.compressed_data.bg) {
            for (let i = 0; i <= bg[1]; i++) bgs.push(bg[0]);
        }
        doc.data = new Array(codes.length);
        for (let i = 0; i < doc.data.length; i++) doc.data[i] = {code: codes[i], fg: fgs[i], bg: bgs[i]};
        delete doc.compressed_data;
    }
    return doc;
}

function get_blocks(doc, sx, sy, dx, dy, opts = {}) {
    dx = Math.min(doc.columns - 1, dx);
    dy = Math.min(doc.rows - 1, dy);
    const columns = dx - sx + 1;
    const rows = dy - sy + 1;
    const blocks = {columns, rows, data: new Array(columns * rows), ...opts};
    for (let y = sy, i = 0; y <= dy; y++) {
        for (let x = sx; x <= dx; x++, i++) {
            blocks.data[i] = Object.assign(doc.data[y * doc.columns + x]);
        }
    }
    return blocks;
}

function get_all_blocks(doc) {
    return get_blocks(doc, 0, 0, doc.columns - 1, doc.rows -1);
}

function export_as_png(doc, render, file) {
    const base64_string = get_data_url(doc.ice_colors ? render.ice_color_collection : render.blink_off_collection).split(";base64,").pop();
    fs.writeFileSync(file, base64_string, "base64");
}

function export_as_apng(render, file) {
    const blink_off = join_canvases(render.blink_off_collection).getContext("2d").getImageData(0, 0, render.width, render.height).data;
    const blink_on = join_canvases(render.blink_on_collection).getContext("2d").getImageData(0, 0, render.width, render.height).data;
    const bytes = upng.encode([blink_off.buffer, blink_on.buffer], render.width, render.height, 16, [300, 300]);
    fs.writeFileSync(file, Buffer.from(bytes));
}

module.exports = {Font, read_bytes, read_file, write_file, animate, render, render_split, render_at, render_insert_column, render_delete_column, render_insert_row, render_delete_row, new_document, clone_document, resize_canvas, cp437_to_unicode, cp437_to_unicode_bytes, unicode_to_cp437, render_blocks, merge_blocks, flip_code_x, flip_x, flip_y, rotate, insert_column, insert_row, delete_column, delete_row, scroll_canvas_up, scroll_canvas_down, scroll_canvas_left, scroll_canvas_right, render_scroll_canvas_up, render_scroll_canvas_down, render_scroll_canvas_left, render_scroll_canvas_right, get_data_url, convert_ega_to_style, compress, uncompress, get_blocks, get_all_blocks, export_as_png, export_as_apng, has_default_palette, encode_as_bin, encode_as_xbin, encode_as_ansi};
