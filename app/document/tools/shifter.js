const {tools, toolbar} = require("../ui/ui");
const doc = require("../doc");
const mouse = require("../input/mouse");
const keyboard = require("../input/keyboard");
const palette = require("../palette");
const {Overlay} = require("./overlay");
const {on} = require("../../senders");
let overlay;
let enabled = false;

tools.on("start", (mode) => {
    enabled = (mode == tools.modes.SHIFTER);
    if (enabled) {
        toolbar.show_sample();
        overlay = new Overlay(true);
        overlay.hide();
    } else if (overlay) {
        overlay.destroy();
    }
});

mouse.on("move", (x, y, half_y, is_legal) => {
    if (!enabled) return;
    if (!is_legal) {
        overlay.hide();
        return;
    }
    const font = doc.font;
    overlay.update(x * font.width, y * font.height, font.width, font.height);
    overlay.show();
    toolbar.set_sample(x, y);
});

mouse.on("down", (x, y, half_y, is_legal, button, shift_key) => {
    if (!enabled) return;
    if (shift_key) {
        doc.start_undo();
        doc.change_data(x, y, 32, 7, 0);
        return;
    }
    const block = doc.at(x, y);
    switch (block.code) {
    case 0: case 32: case 255:
        doc.start_undo();
        const {fg} = palette;
        doc.change_data(x, y, button == mouse.buttons.LEFT ? 222 : 221, fg, block.bg);
        break;
    case 219: case 220: case 223:
        doc.start_undo();
        doc.change_data(x, y, button == mouse.buttons.LEFT ? 221 : 222, block.fg, block.bg);
        break;
    case 221:
        doc.start_undo();
        doc.change_data(x, y, button == mouse.buttons.LEFT ? 32 : 219, block.fg, block.bg);
        break;
    case 222:
        doc.start_undo();
        doc.change_data(x, y, button == mouse.buttons.LEFT ? 219 : 32, block.fg, block.bg);
        break;
    }
});

function select_attribute() {
    if (!enabled) return;
    palette.select_attribute();
}

keyboard.on("escape", () => select_attribute());
on("select_attribute", (event) => select_attribute());
