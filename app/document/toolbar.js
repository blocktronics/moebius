let font;
const F_KEYS = [176, 177, 178, 219, 223, 220, 221, 222, 254, 249];
let fg, bg;
const brush_modes = {HALF_BLOCK: 0, FULL_BLOCK: 1, SHADING_BLOCK: 2, CLEAR_BLOCK: 3, COLORIZE: 4};
let brush_mode = brush_modes.HALF_BLOCK;
let colorize_fg = true;
let colorize_bg = false;

function hide(id) {
    document.getElementById(id).classList.add("hidden");
}

function show(id) {
    document.getElementById(id).classList.remove("hidden");
}

function set_var(name, value) {
    document.documentElement.style.setProperty(`--${name}`, `${value}px`);
}

function show_select() {
    show("select_panel");
    hide_brush();
    hide_sample();
}

function update_button_styles(mode) {
    brush_mode = mode;
    document.getElementById("half_block").classList.remove("brush_mode_selected");
    document.getElementById("colorize").classList.remove("brush_mode_selected");
    document.getElementById("shading_block").classList.remove("brush_mode_selected");
    document.getElementById("full_block").classList.remove("brush_mode_selected");
    document.getElementById("clear_block").classList.remove("brush_mode_selected");
    document.getElementById("colorize_fg").classList.add("brush_mode_ghosted");
    document.getElementById("colorize_fg").classList.remove("brush_mode_selected");
    document.getElementById("colorize_bg").classList.add("brush_mode_ghosted");
    document.getElementById("colorize_bg").classList.remove("brush_mode_selected");
    switch (brush_mode) {
        case brush_modes.HALF_BLOCK: document.getElementById("half_block").classList.add("brush_mode_selected"); break;
        case brush_modes.FULL_BLOCK: document.getElementById("full_block").classList.add("brush_mode_selected"); break;
        case brush_modes.SHADING_BLOCK: document.getElementById("shading_block").classList.add("brush_mode_selected"); break;
        case brush_modes.CLEAR_BLOCK: document.getElementById("clear_block").classList.add("brush_mode_selected"); break;
        case brush_modes.COLORIZE:
            document.getElementById("colorize").classList.add("brush_mode_selected");
            document.getElementById("colorize_fg").classList.remove("brush_mode_ghosted");
            document.getElementById("colorize_bg").classList.remove("brush_mode_ghosted");
        break;
    }
    if (colorize_fg) document.getElementById("colorize_fg").classList.add("brush_mode_selected");
    if (colorize_bg) document.getElementById("colorize_bg").classList.add("brush_mode_selected");
}

function show_brush() {
    hide_select();
    show("brush_panel");
    update_button_styles(brush_mode);
    hide_sample();
}

function show_sample() {
    hide_select();
    hide_brush();
    show("sample_panel");
}

function hide_select() {
    hide("select_panel");
}

function hide_brush() {
    hide("brush_panel");
}

function hide_sample() {
    hide("sample_panel");
}

function show_toolbar() {
    set_var("toolbar-height", 48);
}

function hide_toolbar() {
    set_var("toolbar-height", 0);
}

function draw_fkey(name, code) {
    const canvas = document.getElementById(name);
    canvas.width = font.width;
    canvas.height = font.height;
    canvas.style.width = `${font.width * 2}px`;
    canvas.style.height = `${font.height * 2}px`;
    canvas.style.margin = `${(48 - font.height * 2 - 2) / 2}px`;
    const ctx = canvas.getContext("2d");
    font.draw(ctx, {code, fg, bg}, 0, 0);
}

function get_f_key(value) {
    return F_KEYS[value];
}

function redraw_fkeys() {
    for (let i = 0; i < F_KEYS.length; i++) draw_fkey(`f${i + 1}`, F_KEYS[i]);
}

function set_fg_bg(new_fg, new_bg) {
    fg = new_fg;
    bg = new_bg;
    redraw_fkeys();
}

function set_font(new_font) {
    font = new_font;
    const sample_block = document.getElementById("sample_block");
    sample_block.width = font.width;
    sample_block.height = font.height;
    sample_block.style.width = `${font.width * 2}px`;
    sample_block.style.height = `${font.height * 2}px`;
    sample_block.style.margin = `${(48 - font.height * 2 - 2) / 2}px`;
}

function set_color(name, index) {
    const canvas = document.getElementById(name);
    const ctx = canvas.getContext("2d");
    const rgb = font.get_rgb(index);
    ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function set_sample(block) {
    const canvas = document.getElementById("sample_block");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    font.draw_raw(ctx, block, 0, 0);
    set_color("sample_fg", block.fg);
    set_color("sample_bg", block.bg);
    document.getElementById("code_value").textContent = `${block.code}`;
    document.getElementById("fg_value").textContent = `${block.fg}`;
    document.getElementById("bg_value").textContent = `${block.bg}`;
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("half_block").addEventListener("mousedown", (event) => update_button_styles(brush_modes.HALF_BLOCK));
    document.getElementById("full_block").addEventListener("mousedown", (event) => update_button_styles(brush_modes.FULL_BLOCK));
    document.getElementById("shading_block").addEventListener("mousedown", (event) => update_button_styles(brush_modes.SHADING_BLOCK));
    document.getElementById("clear_block").addEventListener("mousedown", (event) => update_button_styles(brush_modes.CLEAR_BLOCK));
    document.getElementById("colorize").addEventListener("mousedown", (event) => update_button_styles(brush_modes.COLORIZE));
    document.getElementById("colorize_fg").addEventListener("mousedown", (event) => {
        colorize_fg = !colorize_fg;
        update_button_styles(brush_modes.COLORIZE);
    });
    document.getElementById("colorize_bg").addEventListener("mousedown", (event) => {
        colorize_bg = !colorize_bg;
        update_button_styles(brush_modes.COLORIZE);
    });
}, true);

function is_in_half_block_mode() {
    return brush_mode == brush_modes.HALF_BLOCK;
}

function is_in_full_block_mode() {
    return brush_mode == brush_modes.FULL_BLOCK;
}

function is_in_shading_block_mode() {
    return brush_mode == brush_modes.SHADING_BLOCK;
}

function is_in_clear_block_mode() {
    return brush_mode == brush_modes.CLEAR_BLOCK;
}

function is_in_colorize_mode() {
    return brush_mode == brush_modes.COLORIZE;
}

function is_in_colorize_fg_mode() {
    return colorize_fg;
}

function is_in_colorize_bg_mode() {
    return colorize_bg;
}

module.exports = {show_select, show_brush, show_sample, show: show_toolbar, hide: hide_toolbar, set_fg_bg, set_font, set_sample, get_f_key, is_in_half_block_mode, is_in_full_block_mode, is_in_shading_block_mode, is_in_clear_block_mode, is_in_colorize_mode, is_in_colorize_fg_mode, is_in_colorize_bg_mode};
