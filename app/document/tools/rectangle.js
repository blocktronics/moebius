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
    enabled = (mode == tools.modes.RECTANGLE);
    if (enabled) toolbar.show_brush();
});

function reorientate(sx, sy, dx, dy) {
    const [new_sx, new_dx] = (sx < dx) ? [sx, dx] : [dx, sx];
    const [new_sy, new_dy] = (sy < dy) ? [sy, dy] : [dy, sy];
    return {sx: new_sx, sy: new_sy, dx: new_dx, dy: new_dy};
}

function half_block_rectangle_overlay(sx, sy, dx, dy, col) {
    const font = doc.font;
    overlay.update(sx * font.width, Math.floor(sy * font.height / 2), (dx - sx + 1) * font.width, Math.ceil((dy - sy + 1) * font.height / 2));
    overlay.background_color(font, col);
}

function rectangle_overlay(sx, sy, dx, dy, col) {
    const font = doc.font;
    overlay.update(sx * font.width, sy * font.height, (dx - sx + 1) * font.width, (dy - sy + 1) * font.height);
    overlay.background_color(font, col);
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
        const {sx, sy, dx, dy} = reorientate(mouse.start.x, mouse.start.half_y, x, half_y);
        if (clear) {
            half_block_rectangle_overlay(sx, sy, dx, dy, 0);
        } else {
            half_block_rectangle_overlay(sx, sy, dx, dy, (button == mouse.buttons.LEFT) ? fg : bg);
        }
        return;
    }
    const {sx, sy, dx, dy} = reorientate(mouse.start.x, mouse.start.y, x, y);
    if (clear || toolbar.mode == toolbar.modes.CLEAR_BLOCK) {
        rectangle_overlay(sx, sy, dx, dy, 0);
    } else {
        rectangle_overlay(sx, sy, dx, dy, (button == mouse.buttons.LEFT) ? fg : bg);
    }
});

mouse.on("up", (x, y, half_y, button) => {
    if (!enabled) return;
    overlay.destroy();
    doc.start_undo();
    const {fg, bg} = palette;
    if (toolbar.mode == toolbar.modes.HALF_BLOCK) {
        const {sx, sy, dx, dy} = reorientate(mouse.start.x, mouse.start.half_y, x, half_y);
        if (clear) {
            for (let y = sy; y <= dy; y++) brushes.half_block_line(sx, y, dx, y, 0);
        } else {
            const col = (button == mouse.buttons.LEFT) ? fg : bg;
            for (let y = sy; y <= dy; y++) brushes.half_block_line(sx, y, dx, y, col);
        }
        return;
    }
    const {sx, sy, dx, dy} = reorientate(mouse.start.x, mouse.start.y, x, y);
    if (clear || toolbar.mode == toolbar.modes.CLEAR_BLOCK) {
        for (let y = sy; y <= dy; y++) brushes.clear_block_line(sx, y, dx, y);
    } else {
        switch (toolbar.mode) {
            case toolbar.modes.FULL_BLOCK:
                for (let y = sy; y <= dy; y++) brushes.full_block_line(sx, y, dx, y, (button == mouse.buttons.LEFT) ? fg : bg);
                break;
            case toolbar.modes.SHADING_BLOCK:
                const reduce = (button != mouse.buttons.LEFT);
                for (let y = sy; y <= dy; y++) brushes.shading_block_line(sx, y, dx, y, fg, bg, reduce);
                break;
            case toolbar.modes.REPLACE_COLOR:
                for (let y = sy; y <= dy; y++) brushes.replace_color_line(sx, y, dx, y, fg, bg);
                break;
            case toolbar.modes.BLINK:
                for (let y = sy; y <= dy; y++) brushes.blink_line(sx, y, dx, y, button != mouse.buttons.LEFT);
                break;
            case toolbar.modes.COLORIZE:
                for (let y = sy; y <= dy; y++) brushes.colorize_line(sx, y, dx, y, toolbar.colorize_fg ? fg : undefined, toolbar.colorize_bg ? bg : undefined);
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
