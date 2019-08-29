const doc = require("../doc");
const {tools, toolbar} = require("../ui/ui");
const mouse = require("../input/mouse");
const keyboard = require("../input/keyboard");
const brushes = require("./brushes");
const palette = require("../palette");
const {Overlay} = require("./overlay");
const {on} = require("../../senders");
let enabled = false;
let overlay;
let clear = false;

tools.on("start", (mode) => {
    enabled = (mode == tools.modes.ELLIPSE);
    if (enabled) toolbar.show_brush();
});

function ellipse_outline(sx, sy, width, height) {
    if (width == 0 || height == 0) return;
    const a2 = width * width;
    const b2 = height * height;
    const fa2 = 4 * a2;
    const fb2 = 4 * b2;
    coords = [];
    for (let px = 0, py = height, sigma = 2 * b2 + a2 * (1 - 2 * height); b2 * px <= a2 * py; px += 1) {
        coords.push({x: sx + px, y: sy + py});
        coords.push({x: sx - px, y: sy + py});
        coords.push({x: sx + px, y: sy - py});
        coords.push({x: sx - px, y: sy - py});
        if (sigma >= 0) {
            sigma += fa2 * (1 - py);
            py -= 1;
        }
        sigma += b2 * ((4 * px) + 6);
    }
    for (let px = width, py = 0, sigma = 2 * a2 + b2 * (1 - 2 * width); a2 * py <= b2 * px; py += 1) {
        coords.push({x: sx + px, y: sy + py});
        coords.push({x: sx - px, y: sy + py});
        coords.push({x: sx + px, y: sy - py});
        coords.push({x: sx - px, y: sy - py});
        if (sigma >= 0) {
            sigma += fb2 * (1 - px);
            px -= 1;
        }
        sigma += a2 * ((4 * py) + 6);
    }
    return coords;
}

function ellipse_coords(sx, sy, dx, dy) {
    const radius_x = Math.abs(dx - sx);
    const radius_y = Math.abs(dy - sy);
    sx = (sx < dx) ? sx + (sx - dx) : sx + (dx - sx);
    sy = (sy < dy) ? sy + (sy - dy) : sy + (dy - sy);
    return ellipse_outline(sx + radius_x, sy + radius_y, radius_x, radius_y);
}

function orientate_preview(sx, sy, dx, dy) {
    const radius_x = Math.abs(dx - sx);
    const radius_y = Math.abs(dy - sy);
    const x = (sx < dx) ? sx + (sx - dx) : sx + (dx - sx);
    const y = (sy < dy) ? sy + (sy - dy) : sy + (dy - sy);
    return {x, y, radius_x, radius_y};
}

function half_block_ellipse_overlay(sx, sy, dx, dy, col) {
    const font = doc.font;
    const {x, y, radius_x, radius_y} = orientate_preview(sx, sy, dx, dy);
    overlay.update(x * font.width, Math.floor(y * font.height / 2), (radius_x * 2 + 1) * font.width, Math.floor((radius_y * 2 + 1) * font.height / 2));
    const coords = ellipse_outline(radius_x, radius_y, radius_x, radius_y);
    if (!coords) return;
    overlay.fill_style(font, col);
    for (const coord of coords) overlay.fill_rect(coord.x * font.width, Math.floor(coord.y * font.height / 2), font.width, Math.floor(font.height / 2));
}

function full_block_ellipse_overlay(sx, sy, dx, dy, col) {
    const font = doc.font;
    const {x, y, radius_x, radius_y} = orientate_preview(sx, sy, dx, dy);
    overlay.update(x * font.width, y * font.height, (radius_x * 2 + 1) * font.width, (radius_y * 2 + 1) * font.height);
    const coords = ellipse_outline(radius_x, radius_y, radius_x, radius_y);
    if (!coords) return;
    overlay.fill_style(font, col);
    for (const coord of coords) overlay.fill_rect(coord.x * font.width, coord.y * font.height, font.width, font.height);
}

function draw_half_block_ellipse(sx, sy, dx, dy, col) {
    const coords = ellipse_coords(sx, sy, dx, dy);
    if (!coords) return;
    for (const coord of coords) doc.set_half_block(coord.x, coord.y, col);
}

function draw_clear_block_ellipse(sx, sy, dx, dy) {
    const coords = ellipse_coords(sx, sy, dx, dy);
    if (!coords) return;
    for (const coord of coords) doc.change_data(coord.x, coord.y, 32, 7, 0);
}

function draw_full_block_ellipse(sx, sy, dx, dy, col) {
    const coords = ellipse_coords(sx, sy, dx, dy);
    if (!coords) return;
    for (const coord of coords) doc.change_data(coord.x, coord.y, 219, col, 0);
}

function draw_shaded_block_ellipse(sx, sy, dx, dy, fg, bg, reduce) {
    const coords = ellipse_coords(sx, sy, dx, dy);
    if (!coords) return;
    for (const coord of coords) brushes.shading_block(coord.x, coord.y, fg, bg, reduce);
}

function draw_replace_color_block_ellipse(sx, sy, dx, dy, to, from) {
    const coords = ellipse_coords(sx, sy, dx, dy);
    if (!coords) return;
    for (const coord of coords) {
        const block = doc.at(coord.x, coord.y);
        if (block && (block.fg == from || block.bg == from)) doc.change_data(coord.x, coord.y, block.code, (block.fg == from) ? to : block.fg, (block.bg == from) ? to : block.bg);
    }
}

function draw_blink_ellipse(sx, sy, dx, dy, unblink) {
    const coords = ellipse_coords(sx, sy, dx, dy);
    if (!coords) return;
    for (const coord of coords) {
        const block = doc.at(coord.x, coord.y);
        if (block && ((!unblink && block.bg < 8) || (unblink && block.bg >= 8)) && (block.code != 0 && block.code != 32 && block.code != 255)) doc.change_data(coord.x, coord.y, block.code, block.fg, unblink ? block.bg - 8 : block.bg + 8);
    }
}

function draw_colorize_block_ellipse(sx, sy, dx, dy, fg, bg) {
    const coords = ellipse_coords(sx, sy, dx, dy);
    if (!coords) return;
    for (const coord of coords) {
        const block = doc.at(coord.x, coord.y);
        if (block) doc.change_data(coord.x, coord.y, block.code, (fg != undefined) ? fg : block.fg, (bg != undefined) ? bg : block.bg);
    }
}

mouse.on("down",(x, y, half_y, is_legal, button, shift_key) => {
    if (!enabled) return;
    clear = shift_key;
    overlay = new Overlay();
    mouse.record_start();
});

mouse.on("to", (x, y, half_y, button) => {
    if (!enabled) return;
    const {fg, bg} = palette;
    if (toolbar.mode == toolbar.modes.HALF_BLOCK) {
        if (clear) {
            half_block_ellipse_overlay(mouse.start.x, mouse.start.half_y, x, half_y, 0);
        } else {
            half_block_ellipse_overlay(mouse.start.x, mouse.start.half_y, x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
        }
        return;
    }
    if (clear || toolbar.mode == toolbar.modes.CLEAR_BLOCK) {
        full_block_ellipse_overlay(mouse.start.x, mouse.start.y, x, y, 0);
    } else {
        full_block_ellipse_overlay(mouse.start.x, mouse.start.y, x, y, (button == mouse.buttons.LEFT) ? fg : bg);
    }
});

mouse.on("up", (x, y, half_y, button) => {
    if (!enabled) return;
    overlay.destroy();
    doc.start_undo();
    const {fg, bg} = palette;
    if (toolbar.mode == toolbar.modes.HALF_BLOCK) {
        if (clear) {
            draw_half_block_ellipse(mouse.start.x, mouse.start.half_y, x, half_y, 0);
        } else {
            draw_half_block_ellipse(mouse.start.x, mouse.start.half_y, x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
        }
        return;
    }
    if (clear || toolbar.mode == toolbar.modes.CLEAR_BLOCK) {
        draw_clear_block_ellipse(mouse.start.x, mouse.start.y, x, y);
    } else {
        switch (toolbar.mode) {
            case toolbar.modes.FULL_BLOCK:
                draw_full_block_ellipse(mouse.start.x, mouse.start.y, x, y, (button == mouse.buttons.LEFT) ? fg : bg);
                break;
            case toolbar.modes.SHADING_BLOCK:
                const reduce = (button != mouse.buttons.LEFT);
                draw_shaded_block_ellipse(mouse.start.x, mouse.start.y, x, y, fg, bg, reduce);
                break;
            case toolbar.modes.REPLACE_COLOR:
                draw_replace_color_block_ellipse(mouse.start.x, mouse.start.y, x, y, fg, bg);
                break;
            case toolbar.modes.BLINK:
                draw_blink_ellipse(mouse.start.x, mouse.start.y, x, y, button != mouse.buttons.LEFT);
                break;
            case toolbar.modes.COLORIZE:
                draw_colorize_block_ellipse(mouse.start.x, mouse.start.y, x, y, toolbar.colorize_fg ? fg : undefined, toolbar.colorize_bg ? bg : undefined);
                break;
        }
    }
});

mouse.on("out", () => {
    if (!enabled) return;
    overlay.destroy();
});

keyboard.on("escape", () => {
    if (!enabled) return;
    if (mouse.started) {
        mouse.escape();
    } else {
        palette.select_attribute();
    }
});

on("select_attribute", (event) => {
    if (!enabled) return;
    palette.select_attribute();
});
