const doc = require("../doc");

function line(x0, y0, x1, y1, skip_first = false) {
    const dx = Math.abs(x1 - x0);
    const sx = (x0 < x1) ? 1 : -1;
    const dy = Math.abs(y1 - y0);
    const sy = (y0 < y1) ? 1 : -1;
    let err = ((dx > dy) ? dx : -dy) / 2;
    let e2;
    const coords = [];
    while (true) {
        coords.push({x: x0, y: y0});
        if (x0 == x1 && y0 == y1) break;
        e2 = err;
        if (e2 > -dx) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dy) {
            err += dx;
            y0 += sy;
        }
    }
    if (skip_first && coords.length > 1) coords.shift();
    return coords;
}

function half_block_line(sx, sy, dx, dy, col, skip_first) {
    const coords = line(sx, sy, dx, dy, skip_first);
    for (const coord of coords) doc.set_half_block(coord.x, coord.y, col);
}

function full_block_line(sx, sy, dx, dy, col, skip_first = false) {
    const coords = line(sx, sy, dx, dy, skip_first);
    for (const coord of coords) doc.change_data(coord.x, coord.y, (col == 0) ? 32 : 219, col, 0);
}

function shading_block(x, y, col, reduce) {
    const block = doc.at(x, y);
    if (block) {
        if (reduce) {
            if (block.fg == 0 && block.bg != 0 && block.code == 32) {
                doc.change_data(x, y, 178, block.bg, 0);
            } else {
                switch (block.code) {
                    case 176: doc.change_data(x, y, 32, 0, block.bg); break;
                    case 177: doc.change_data(x, y, 176, col, block.bg); break;
                    case 178: doc.change_data(x, y, 177, col, block.bg); break;
                    case 219: doc.change_data(x, y, 178, col, block.bg); break;
                }
            }
        } else {
            switch (block.code) {
                case 219: if (block.fg != col) doc.change_data(x, y, 176, col, block.fg); break;
                case 178: doc.change_data(x, y, 219, col, block.bg); break;
                case 177: doc.change_data(x, y, 178, col, block.bg); break;
                case 176: doc.change_data(x, y, 177, col, block.bg); break;
                default: doc.change_data(x, y, 176, col, block.bg); break;
            }
        }
    }
}

function shading_block_line(sx, sy, dx, dy, col, reduce, skip_first = false) {
    const coords = line(sx, sy, dx, dy, skip_first);
    for (const coord of coords) shading_block(coord.x, coord.y, col, reduce);
}

function clear_block_line(sx, sy, dx, dy, skip_first = false) {
    const coords = line(sx, sy, dx, dy, skip_first);
    for (const coord of coords) doc.change_data(coord.x, coord.y, 32, 7, 0);
}

function colorize_line(sx, sy, dx, dy, fg, bg, skip_first = false) {
    const coords = line(sx, sy, dx, dy, skip_first);
    for (const coord of coords) {
        const block = doc.at(coord.x, coord.y);
        if (block) doc.change_data(coord.x, coord.y, block.code, (fg != undefined) ? fg : block.fg, (bg != undefined) ? bg : block.bg);
    }
}

module.exports = {half_block_line, full_block_line, shading_block, shading_block_line, clear_block_line, colorize_line, line};
