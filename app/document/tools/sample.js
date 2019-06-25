const {tools, toolbar} = require("../ui/ui");
const mouse = require("../input/mouse");
const palette = require("../palette");
let enabled = false;

tools.on("start", (mode) => {
    enabled = (mode == tools.modes.SAMPLE);
    if (enabled) toolbar.show_sample();
});

mouse.on("down", (x, y) => {
    if (!enabled) return;
    const block = doc.at(x, y);
    tools.change_to_previous_mode();
    palette.fg = block.fg;
    palette.bg = block.bg;
});

mouse.on("move", (x, y) => {
    if (!enabled) return;
    toolbar.set_sample(x, y);
});
