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
    enabled = (mode == tools.modes.RECTANGLE_OUTLINE);
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
    overlay.fill_style(font, col);
    overlay.fill_rect(0, 0, (dx - sx) * font.width, Math.floor(font.height / 2));
    if (dy > sy) {
        overlay.fill_rect(0, (dy - sy) * Math.floor(font.height / 2), (dx - sx) * font.width, Math.floor(font.height / 2));
        overlay.fill_rect(0, 0, font.width, (dy - sy) * Math.floor(font.height / 2));
        overlay.fill_rect((dx - sx) * font.width, 0, font.width, (dy - sy + 1) * Math.floor(font.height / 2));
    }
}

function rectangle_overlay(sx, sy, dx, dy, col) {
    const font = doc.font;
    overlay.update(sx * font.width, sy * font.height, (dx - sx + 1) * font.width, (dy - sy + 1) * font.height);
    overlay.fill_style(font, col);
    overlay.fill_rect(0, 0, (dx - sx) * font.width, font.height);
    if (dy > sy) {
        overlay.fill_rect(0, (dy - sy) * font.height, (dx - sx) * font.width, font.height);
        overlay.fill_rect(0, 0, font.width, (dy - sy) * font.height);
        overlay.fill_rect((dx - sx) * font.width, 0, font.width, (dy - sy + 1) * font.height);
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
        const {sx, sy, dx, dy} = reorientate(mouse.start.x, mouse.start.half_y, x, half_y);
        if (clear) {
            half_block_rectangle_overlay(sx, sy, dx, dy, 0);
        } else {
            half_block_rectangle_overlay(sx, sy, dx, dy, (button == mouse.buttons.LEFT) ? fg : bg);
        }
        return;
    }
    const {sx, sy, dx, dy} = reorientate(mouse.start.x, mouse.start.y, x, y);
    if (clear) {
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
            brushes.single_half_block_line(sx, sy, dx, sy, 0);
            if (dy > sy) {
                brushes.single_half_block_line(sx, dy, dx, dy, 0);
                if (dy > sy + 1) {
                    brushes.single_half_block_line(sx, sy + 1, sx, dy - 1, 0);
                    brushes.single_half_block_line(dx, sy + 1, dx, dy - 1, 0);
                }
            }
        } else {
            const col = (button == mouse.buttons.LEFT) ? fg : bg;
            brushes.single_half_block_line(sx, sy, dx, sy, col);
            if (dy > sy) {
                brushes.single_half_block_line(sx, dy, dx, dy, col);
                if (dy > sy + 1) {
                    brushes.single_half_block_line(sx, sy + 1, sx, dy - 1, col);
                    brushes.single_half_block_line(dx, sy + 1, dx, dy - 1, col);
                }
            }
        }
        return;
    }
    const {sx, sy, dx, dy} = reorientate(mouse.start.x, mouse.start.y, x, y);
    if (clear) {
        brushes.single_clear_block_line(sx, sy, dx, sy);
        if (dy > sy) {
            brushes.single_clear_block_line(sx, dy, dx, dy);
            if (dy > sy + 1) {
                brushes.single_clear_block_line(sx, sy + 1, sx, dy - 1);
                brushes.single_clear_block_line(dx, sy + 1, dx, dy - 1);
            }
        }
    } else {
        switch (toolbar.mode) {
            case toolbar.modes.CUSTOM_BLOCK:
                brushes.single_custom_block_line(sx, sy, dx, sy, fg, bg);
                if (dy > sy) {
                    brushes.single_custom_block_line(sx, dy, dx, dy, fg, bg);
                    if (dy > sy + 1) {
                        brushes.single_custom_block_line(sx, sy + 1, sx, dy - 1, fg, bg);
                        brushes.single_custom_block_line(dx, sy + 1, dx, dy - 1, fg, bg);
                    }
                }
                break;
            case toolbar.modes.SHADING_BLOCK:
                const reduce = (button != mouse.buttons.LEFT);
                brushes.single_shading_block_line(sx, sy, dx, sy, fg, bg, reduce);
                if (dy > sy) {
                    brushes.single_shading_block_line(sx, dy, dx, dy, fg, bg, reduce);
                    if (dy > sy + 1) {
                        brushes.single_shading_block_line(sx, sy + 1, sx, dy - 1, fg, bg, reduce);
                        brushes.single_shading_block_line(dx, sy + 1, dx, dy - 1, fg, bg, reduce);
                    }
                }
                break;
            case toolbar.modes.REPLACE_COLOR:
                brushes.single_replace_color_line(sx, sy, dx, sy, fg, bg);
                if (dy > sy) {
                    brushes.single_replace_color_line(sx, dy, dx, dy, fg, bg);
                    if (dy > sy + 1) {
                        brushes.single_replace_color_line(sx, sy + 1, sx, dy - 1, fg, bg);
                        brushes.single_replace_color_line(dx, sy + 1, dx, dy - 1, fg, bg);
                    }
                }
                break;
            case toolbar.modes.BLINK:
                const unblink = button != mouse.buttons.LEFT;
                brushes.single_blink_line(sx, sy, dx, sy, unblink);
                if (dy > sy) {
                    brushes.single_blink_line(sx, dy, dx, dy, unblink);
                    if (dy > sy + 1) {
                        brushes.single_blink_line(sx, sy + 1, sx, dy - 1, unblink);
                        brushes.single_blink_line(dx, sy + 1, dx, dy - 1, unblink);
                    }
                }
                break;
            case toolbar.modes.COLORIZE:
                const colorize_fg = toolbar.colorize_fg ? fg : undefined;
                const colorize_bg = toolbar.colorize_bg ? bg : undefined;
                brushes.single_colorize_line(sx, sy, dx, sy, colorize_fg, colorize_bg);
                if (dy > sy) {
                    brushes.single_colorize_line(sx, dy, dx, dy, colorize_fg, colorize_bg);
                    if (dy > sy + 1) {
                        brushes.single_colorize_line(sx, sy + 1, sx, dy - 1, colorize_fg, colorize_bg);
                        brushes.single_colorize_line(dx, sy + 1, dx, dy - 1, colorize_fg, colorize_bg);
                    }
                }
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

keyboard.on("f_key", (num) => {
    if (!enabled) return;
    toolbar.change_custom_brush(num);
});
