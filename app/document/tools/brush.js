const {tools} = require("../ui/ui");
const doc = require("../doc");
const mouse = require("../input/mouse");
const {toolbar} = require("../ui/ui");
const palette = require("../palette");
const brushes = require("./brushes");
const {on} = require("../../senders");
let enabled = false;
let chunked_undo = true;

tools.on("start", (mode) => {
    enabled = (mode == tools.modes.BRUSH);
    if (enabled) toolbar.show_brush();
});

function mouse_handler(skip_first) {
    return (x, y, half_y, button, shift_key) => {
        if (!enabled) return;
        if (!chunked_undo || !skip_first) doc.start_undo();
        mouse.start_drawing();
        const {fg, bg} = palette;
        if (toolbar.mode == toolbar.modes.HALF_BLOCK) {
            if (shift_key) {
                brushes.half_block_line(mouse.x, mouse.half_y, x, half_y, 0, skip_first);
            } else {
                brushes.half_block_line(mouse.x, mouse.half_y, x, half_y, (button == mouse.buttons.LEFT) ? fg : bg, skip_first);
            }
        } else if (shift_key || toolbar.mode == toolbar.modes.CLEAR_BLOCK) {
            brushes.clear_block_line(mouse.x, mouse.y, x, y);
        } else {
            switch (toolbar.mode) {
                case toolbar.modes.FULL_BLOCK:
                    brushes.full_block_line(mouse.x, mouse.y, x, y, (button == mouse.buttons.LEFT) ? fg : bg, skip_first);
                    break;
                case toolbar.modes.SHADING_BLOCK:
                    brushes.shading_block_line(mouse.x, mouse.y, x, y, fg, button != mouse.buttons.LEFT, skip_first);
                    break;
                case toolbar.modes.COLORIZE:
                    brushes.colorize_line(mouse.x, mouse.y, x, y, toolbar.colorize_fg ? fg : undefined, toolbar.colorize_bg ? bg : undefined, skip_first);
                    break;
            }
        }
    };
}

on("chunked_undo", (event, value) => chunked_undo = value);

mouse.on("down", mouse_handler(false));
mouse.on("draw", mouse_handler(true));