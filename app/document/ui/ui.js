const electron = require("electron");
const {on, send, open_box} = require("../../senders");
const doc = require("../doc");
const palette = require("../palette");
const keyboard = require("../input/keyboard");
const events = require("events");
let interval;

function $(name) {
    return document.getElementById(name);
}

function set_var(name, value) {
    document.documentElement.style.setProperty(`--${name}`, value);
}

function set_var_px(name, value) {
    set_var(name, `${value}px`);
}

function open_reference_image() {
    open_box({filters: [{name: "Images", extensions: ["png", "jpg"]}]}, (files) => {
        if (files) {
            $("reference_image").style.backgroundImage = `url(${electron.nativeImage.createFromPath(files[0]).toDataURL()})`;
            $("reference_image").style.opacity = 0.4;
            send("enable_reference_image");
        }
    });
}

function toggle_reference_image(visible) {
    $("reference_image").style.opacity = visible ? 0.4 : 0.0;
}

function clear_reference_image() {
    $("reference_image").style.removeProperty("background-image");
    send("disable_clear_reference_image");
}

on("open_reference_image", (event) => open_reference_image());
on("toggle_reference_image", (event, visible) => toggle_reference_image(visible));
on("clear_reference_image", (event) => clear_reference_image());

function set_text(name, text) {
    $(name).textContent = text;
}

class StatusBar {
    status_bar_info(columns, rows) {
        set_text("columns", `${columns}`);
        set_text("rows", `${rows}`);
        set_text("columns_s", (columns > 1) ? "s" : "");
        set_text("rows_s", (rows > 1) ? "s" : "");
    }

    use_canvas_size_for_status_bar() {
        this.status_bar_info(doc.columns, doc.rows);
    }

    set_cursor_position(x, y) {
        set_text("cursor_x", `${x + 1}`);
        set_text("cursor_y", `${y + 1}`);
    }

    hide_cursor_position() {
        $("cursor_position").style.opacity = 0;
    }

    show_cursor_position() {
        $("cursor_position").style.opacity = 1;
    }
}


function show_statusbar(visible) {
    set_var("statusbar-height", visible ? "22px" : "0px");
}

function show_preview(visible) {
    set_var("preview-width", visible ? "300px" : "1px");
}

function use_pixel_aliasing(value) {
    set_var("scaling-type", value ? "high-quality" : "pixelated");
}

function hide_scrollbars(value) {
    set_var("scrollbar-width", value ? "0px" : "8px");
    set_var("scrollbar-height", value ? "0px" : "8px");
}

function current_zoom_factor() {
    return parseFloat(electron.remote.getCurrentWebContents().getZoomFactor().toFixed(1));
}

function set_zoom(factor) {
    const zoom_element = $("zoom");
    electron.remote.getCurrentWebContents().setZoomFactor(factor);
    zoom_element.textContent = `${Math.ceil(factor * 10) * 10}%`;
    zoom_element.classList.remove("fade");
    document.body.removeChild(zoom_element);
    document.body.appendChild(zoom_element);
    zoom_element.classList.add("fade");
    send("update_menu_checkboxes", {actual_size: (electron.remote.getCurrentWebContents().getZoomFactor() == 1)});
}

function zoom_in() {
    set_zoom(Math.min(current_zoom_factor() + 0.1, 3.0));
}

function zoom_out() {
    set_zoom(Math.max(current_zoom_factor() - 0.1, 0.4));
}

function actual_size() {
    set_zoom(1.0);
}

function ice_colors(value) {
    if (!value) {
        let vis_toggle = false;
        $("ice_color_container").style.display = "none";
        $("blink_off_container").style.removeProperty("display");
        if (interval) clearInterval(interval);
        interval = setInterval(() => {
            if (vis_toggle) {
                $("blink_on_container").style.display = "none";
                $("blink_off_container").style.removeProperty("display");
            } else {
                $("blink_off_container").style.display = "none";
                $("blink_on_container").style.removeProperty("display");
            }
            vis_toggle = !vis_toggle;
        }, 300);
        set_text("ice_colors", "Off");
    } else {
        if (interval) clearInterval(interval);
        $("ice_color_container").style.removeProperty("display");
        $("blink_off_container").style.display = "none";
        $("blink_on_container").style.display = "none";
        set_text("ice_colors", "On");
    }
    send("update_menu_checkboxes", {ice_colors: value});
}

function use_9px_font(value) {
    set_text("use_9px_font", value ? "On" : "Off");
    send("update_menu_checkboxes", {use_9px_font: value});
}

function change_font(font_name) {
    set_text("font_name", font_name);
    send("update_menu_checkboxes", {font_name});
}

function insert_mode(value) {
    set_text("insert_mode", value ? "Ins" : "");
    keyboard.overwrite_mode = false;
    send("update_menu_checkboxes", {insert_mode: value, overwrite_mode: false});
}

function overwrite_mode(value) {
    set_text("insert_mode", value ? "Over" : "");
    keyboard.insert_mode = false;
    send("update_menu_checkboxes", {overwrite_mode: value, insert_mode: false});
}

doc.on("new_document", () => {
    ice_colors(doc.ice_colors);
    use_9px_font(doc.use_9px_font);
    change_font(doc.font_name);
});
doc.on("ice_colors", (value) => ice_colors(value));
doc.on("use_9px_font", (value) => use_9px_font(value));
doc.on("change_font", (font_name) => change_font(font_name));
keyboard.on("insert", (value) => insert_mode(value));
on("insert_mode", (event, value) => insert_mode(value));
on("overwrite_mode", (event, value) => overwrite_mode(value));

on("show_statusbar", (event, visible) => show_statusbar(visible));
on("show_preview", (event, visible) => show_preview(visible));
on("use_pixel_aliasing", (event, value) => use_pixel_aliasing(value));
on("hide_scrollbars", (event, value) => hide_scrollbars(value));
on("zoom_in", (event) => zoom_in());
on("zoom_out", (event) => zoom_out());
on("actual_size", (event) => actual_size());

document.addEventListener("DOMContentLoaded", (event) => {
    $("use_9px_font_toggle").addEventListener("mousedown", (event) => doc.use_9px_font = !doc.use_9px_font, true);
    $("ice_colors_toggle").addEventListener("mousedown", (event) => doc.ice_colors = !doc.ice_colors, true);
}, true);

class Tools extends events.EventEmitter {
    get_tool_div(mode) {
        switch(mode) {
            case this.modes.SELECT: return $("select_mode");
            case this.modes.BRUSH: return $("brush_mode");
            case this.modes.LINE: return $("line_mode");
            case this.modes.RECTANGLE: return $("rectangle_mode");
            case this.modes.FILL: return $("fill_mode");
            case this.modes.SAMPLE: return $("sample_mode");
        }
    }

    start(new_mode) {
        if (new_mode == this.mode) return;
        if (this.mode != undefined) this.get_tool_div(this.mode).classList.remove("selected");
        this.previous_mode = this.mode;
        this.mode = new_mode;
        this.get_tool_div(this.mode).classList.add("selected");
        this.emit("start", this.mode);
    }

    change_to_previous_mode() {
        if (this.previous_mode != undefined) this.start(this.previous_mode);
    }

    constructor() {
        super();
        this.modes = {SELECT: 0, BRUSH: 1, LINE: 2, RECTANGLE: 3, FILL: 4, SAMPLE: 5};
        document.addEventListener("DOMContentLoaded", (event) => {
            $("select_mode").addEventListener("mousedown", (event) => this.start(this.modes.SELECT), true);
            $("brush_mode").addEventListener("mousedown", (event) => this.start(this.modes.BRUSH), true);
            $("line_mode").addEventListener("mousedown", (event) => this.start(this.modes.LINE), true);
            $("rectangle_mode").addEventListener("mousedown", (event) => this.start(this.modes.RECTANGLE), true);
            $("fill_mode").addEventListener("mousedown", (event) => this.start(this.modes.FILL), true);
            $("sample_mode").addEventListener("mousedown", (event) => this.start(this.modes.SAMPLE), true);
        });
    }
}

class Toolbar {
    set_color(name, index, font) {
        const canvas = document.getElementById(name);
        const ctx = canvas.getContext("2d");
        const rgb = font.get_rgb(index);
        ctx.fillStyle = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    draw_fkey(name, code) {
        const font = doc.font;
        const {fg, bg} = palette;
        const canvas = $(name);
        canvas.width = font.width;
        canvas.height = font.height;
        canvas.style.width = `${font.width * 2}px`;
        canvas.style.height = `${font.height * 2}px`;
        canvas.style.margin = `${(48 - font.height * 2 - 2) / 2}px`;
        const ctx = canvas.getContext("2d");
        font.draw(ctx, {code, fg, bg}, 0, 0);
    }

    redraw_fkeys() {
        for (let i = 0; i < 10; i++) this.draw_fkey(`f${i + 1}`, [176, 177, 178, 219, 223, 220, 221, 222, 254, 249][i]);
    }

    show_select() {
        $("select_panel").classList.remove("hidden");
        $("brush_panel").classList.add("hidden");
        $("sample_panel").classList.add("hidden");
    }

    show_brush() {
        $("select_panel").classList.add("hidden");
        $("brush_panel").classList.remove("hidden");
        $("sample_panel").classList.add("hidden");
    }

    show_sample() {
        $("select_panel").classList.add("hidden");
        $("brush_panel").classList.add("hidden");
        $("sample_panel").classList.remove("hidden");
    }

    change_mode(new_mode) {
        this.mode = new_mode;
        $("half_block").classList.remove("brush_mode_selected");
        $("colorize").classList.remove("brush_mode_selected");
        $("shading_block").classList.remove("brush_mode_selected");
        $("full_block").classList.remove("brush_mode_selected");
        $("clear_block").classList.remove("brush_mode_selected");
        $("colorize_fg").classList.add("brush_mode_ghosted");
        $("colorize_fg").classList.remove("brush_mode_selected");
        $("colorize_bg").classList.add("brush_mode_ghosted");
        $("colorize_bg").classList.remove("brush_mode_selected");
        switch (this.mode) {
            case this.modes.HALF_BLOCK: $("half_block").classList.add("brush_mode_selected"); break;
            case this.modes.FULL_BLOCK: $("full_block").classList.add("brush_mode_selected"); break;
            case this.modes.SHADING_BLOCK: $("shading_block").classList.add("brush_mode_selected"); break;
            case this.modes.CLEAR_BLOCK: $("clear_block").classList.add("brush_mode_selected"); break;
            case this.modes.COLORIZE: $("colorize").classList.add("brush_mode_selected");
                $("colorize_fg").classList.remove("brush_mode_ghosted");
                $("colorize_bg").classList.remove("brush_mode_ghosted");
            break;
        }
        if (this.colorize_fg) $("colorize_fg").classList.add("brush_mode_selected");
        if (this.colorize_bg) $("colorize_bg").classList.add("brush_mode_selected");
    }

    set_sample(x, y) {
        const font = doc.font;
        const block = doc.at(x, y);
        const canvas = document.getElementById("sample_block");
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        font.draw_raw(ctx, block, 0, 0);
        this.set_color("sample_fg", block.fg, font);
        this.set_color("sample_bg", block.bg, font);
        $("code_value").textContent = `${block.code}`;
        $("fg_value").textContent = `${block.fg}`;
        $("bg_value").textContent = `${block.bg}`;
    }

    constructor() {
        this.modes = {HALF_BLOCK: 0, FULL_BLOCK: 1, SHADING_BLOCK: 2, CLEAR_BLOCK: 3, COLORIZE: 4};
        this.colorize_fg = true;
        this.colorize_bg = false;
        on("show_toolbar", (event, visible) => set_var_px("toolbar-height", visible ? 48 : 0));
        palette.on("set_fg", () => this.redraw_fkeys());
        palette.on("set_bg", () => this.redraw_fkeys());
        doc.on("render", () => {
            this.redraw_fkeys();
            const font = doc.font;
            const sample_block = document.getElementById("sample_block");
            sample_block.width = font.width;
            sample_block.height = font.height;
            sample_block.style.width = `${font.width * 2}px`;
            sample_block.style.height = `${font.height * 2}px`;
            sample_block.style.margin = `${(48 - font.height * 2 - 2) / 2}px`;
        });
        document.addEventListener("DOMContentLoaded", (event) => {
            $("half_block").addEventListener("mousedown", (event) => this.change_mode(this.modes.HALF_BLOCK));
            $("full_block").addEventListener("mousedown", (event) => this.change_mode(this.modes.FULL_BLOCK));
            $("shading_block").addEventListener("mousedown", (event) => this.change_mode(this.modes.SHADING_BLOCK));
            $("clear_block").addEventListener("mousedown", (event) => this.change_mode(this.modes.CLEAR_BLOCK));
            $("colorize").addEventListener("mousedown", (event) => this.change_mode(this.modes.COLORIZE));
            $("colorize_fg").addEventListener("mousedown", (event) => {
                this.colorize_fg = !this.colorize_fg;
                this.change_mode(this.modes.COLORIZE);
            });
            $("colorize_bg").addEventListener("mousedown", (event) => {
                this.colorize_bg = !this.colorize_bg;
                this.change_mode(this.modes.COLORIZE);
            });
            this.change_mode(this.modes.HALF_BLOCK);
        }, true);
    }
}

module.exports = {statusbar: new StatusBar(), tools: new Tools(), toolbar: new Toolbar()};
