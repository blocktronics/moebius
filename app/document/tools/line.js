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
    enabled = (mode == tools.modes.LINE);
    if (enabled) toolbar.show_brush();
});

function draw_line_overlay_half_block(x, y, col) {
    const font = doc.font;
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.half_y < y) ? [mouse.start.half_y, y] : [y, mouse.start.half_y];
    overlay.update(sx * font.width, Math.floor(sy * font.height / 2), (dx - sx + 1) * font.width, Math.ceil((dy - sy + 1) * font.height / 2));
    overlay.fill_style(font, col);
    const coords = brushes.line(mouse.start.x, mouse.start.half_y, x, y);
    for (const coord of coords) {
        const odd_y = (coord.y % 2);
        overlay.fill_rect((coord.x - sx) * font.width, Math.floor((coord.y - sy) * font.height / 2) - (odd_y ? 1 : 0), font.width, Math.floor(font.height / 2) + (odd_y ? 1 : -1));
    }
}

function draw_line_overlay(x, y, col) {
    const font = doc.font;
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.y < y) ? [mouse.start.y, y] : [y, mouse.start.y];
    overlay.update(sx * font.width, sy * font.height, (dx - sx + 1) * font.width, (dy - sy + 1) * font.height);
    overlay.fill_style(font, col);
    const coords = brushes.line(mouse.start.x, mouse.start.y, x, y);
    for (const coord of coords) overlay.fill_rect((coord.x - sx) * font.width, (coord.y - sy) * font.height, font.width, font.height);
}

mouse.on("down",(x, y, half_y, is_legal, button, shift_key) => {
    if (!enabled) return;
    clear = shift_key;
    if (overlay && !overlay.destroyed) overlay.destroy();
    overlay = new Overlay();
    mouse.record_start();
});

mouse.on("to", (x, y, half_y, button) => {
    if (!enabled) return;
    const {fg, bg} = palette;
    if (toolbar.mode == toolbar.modes.HALF_BLOCK) {
        if (clear) {
            draw_line_overlay_half_block(x, half_y, 0);
        } else {
            draw_line_overlay_half_block(x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
        }
    } else if (clear || toolbar.mode == toolbar.modes.CLEAR_BLOCK) {
        draw_line_overlay(x, y, 0);
    } else {
        draw_line_overlay(x, y, (button == mouse.buttons.LEFT) ? fg : bg);
    }
});

mouse.on("up", (x, y, half_y, button) => {
    if (!enabled) return;
    overlay.destroy();
    doc.start_undo();
    const {fg, bg} = palette;
    if (toolbar.mode == toolbar.modes.HALF_BLOCK) {
        if (clear) {
            brushes.half_block_line(mouse.start.x, mouse.start.half_y, x, half_y, 0);
        } else {
            brushes.half_block_line(mouse.start.x, mouse.start.half_y, x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
        }
    } else if (clear || toolbar.mode == toolbar.modes.CLEAR_BLOCK) {
        brushes.clear_block_line(mouse.start.x, mouse.start.y, x, y);
    } else {
        switch (toolbar.mode) {
            case toolbar.modes.FULL_BLOCK:
                brushes.full_block_line(mouse.start.x, mouse.start.y, x, y, (button == mouse.buttons.LEFT) ? fg : bg);
                break;
            case toolbar.modes.SHADING_BLOCK:
                brushes.shading_block_line(mouse.start.x, mouse.start.y, x, y, fg, bg, button != mouse.buttons.LEFT);
                break;
            case toolbar.modes.REPLACE_COLOR:
                brushes.replace_color_line(mouse.start.x, mouse.start.y, x, y, fg, bg);
                break;
            case toolbar.modes.BLINK:
                brushes.blink_line(mouse.start.x, mouse.start.y, x, y, button != mouse.buttons.LEFT);
                break;
            case toolbar.modes.COLORIZE:
                brushes.colorize_line(mouse.start.x, mouse.start.y, x, y, toolbar.colorize_fg ? fg : undefined, toolbar.colorize_bg ? bg : undefined);
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
