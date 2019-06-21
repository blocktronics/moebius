const events = require("events");
const electron = require("electron");
const toolbar = require("../document/toolbar");
const chat = require("../document/chat");

const modes = {SELECT: 0, BRUSH: 1, LINE: 2, RECTANGLE: 3, FILL: 4, SAMPLE: 5};

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function set_var(name, value) {
    document.documentElement.style.setProperty(`--${name}`, value);
}

function current_zoom_factor() {
    return parseFloat(electron.remote.getCurrentWebContents().getZoomFactor().toFixed(1));
}

function get_tool_div(mode) {
    switch(mode) {
        case modes.SELECT: return document.getElementById("select_mode");
        case modes.BRUSH: return document.getElementById("brush_mode");
        case modes.LINE: return document.getElementById("line_mode");
        case modes.RECTANGLE: return document.getElementById("rectangle_mode");
        case modes.FILL: return document.getElementById("fill_mode");
        case modes.SAMPLE: return document.getElementById("sample_mode");
    }
}

class UIEvent extends events.EventEmitter {
    change_mode(new_mode) {
        if (new_mode == this.mode) return;
        if (this.mode == modes.SELECT) {
            this.emit("hide_cursor");
            send("disable_editing_shortcuts");
            this.emit("stop_editing_mode");
        }
        if (this.mode != undefined) get_tool_div(this.mode).classList.remove("selected");
        this.previous_mode = this.mode;
        this.mode = new_mode;
        get_tool_div(this.mode).classList.add("selected");
        switch (this.mode) {
            case modes.SELECT:
                toolbar.show_select();
                this.emit("show_cursor");
                send("enable_editing_shortcuts");
                this.emit("start_editing_mode");
                send("show_editing_touchbar");
                return;
            case modes.BRUSH:
                toolbar.show_brush();
                send("change_to_brush_mode");
                send("show_brush_touchbar");
                return;
            case modes.LINE:
                toolbar.show_brush();
                this.emit("change_to_line_mode");
                send("show_brush_touchbar");
                return;
            case modes.RECTANGLE:
                toolbar.show_brush();
                this.emit("change_to_rectangle_mode");
                send("show_brush_touchbar");
                return;
            case modes.FILL:
                toolbar.show_sample();
                this.emit("change_to_fill_mode");
                send("show_brush_touchbar");
                return;
            case modes.SAMPLE:
                toolbar.show_sample();
                this.emit("change_to_sample_mode");
                send("show_brush_touchbar");
                return;
        }
    }

    change_to_previous_mode() {
        if (this.previous_mode != undefined) this.change_mode(this.previous_mode);
    }

    show_toolbar(visible) {
        if (!visible) {
            toolbar.hide();
        } else {
            toolbar.show();
        }
    }

    open_reference_image() {
        electron.remote.dialog.showOpenDialog(electron.remote.getCurrentWindow(), {filters: [{name: "Images", extensions: ["png", "jpg"]}], properties: ["openFile"]}, (files) => {
            if (files) {
                document.getElementById("reference_image").style.backgroundImage = `url(${electron.nativeImage.createFromPath(files[0]).toDataURL()})`;
                document.getElementById("reference_image").style.opacity = 0.4;
                send("enable_reference_image");
            }
        });
    }

    toggle_reference_image(visible) {
        document.getElementById("reference_image").style.opacity = visible ? 0.4 : 0.0;
    }

    clear_reference_image() {
        document.getElementById("reference_image").style.removeProperty("background-image");
        send("disable_clear_reference_image");
    }

    update_menu_checkboxes(insert_mode, doc) {
        send("update_menu_checkboxes", {insert_mode, use_9px_font: doc.use_9px_font, ice_colors: doc.ice_colors, actual_size: electron.remote.getCurrentWebContents().getZoomFactor() == 1, font_name: doc.font_name});
    }

    update_status_bar(insert_mode, doc) {
        document.getElementById("use_9px_font").textContent = doc.use_9px_font ? "On" : "Off";
        document.getElementById("ice_colors").textContent = doc.ice_colors ? "On" : "Off";
        document.getElementById("columns").textContent = `${doc.columns}`;
        document.getElementById("rows").textContent = `${doc.rows}`;
        document.getElementById("font_name").textContent = `${doc.font_name}`;
        document.getElementById("insert_mode").textContent = insert_mode ? "Ins" : "";
    }

    set_zoom(factor) {
        const zoom_element = document.getElementById("zoom");
        electron.remote.getCurrentWebContents().setZoomFactor(factor);
        zoom_element.textContent = `${Math.ceil(factor * 10) * 10}%`;
        zoom_element.classList.remove("fade");
        document.body.removeChild(zoom_element);
        document.body.appendChild(zoom_element);
        zoom_element.classList.add("fade");
        send("update_menu_checkboxes", {actual_size: (electron.remote.getCurrentWebContents().getZoomFactor() == 1)});
    }

    show_preview(visible) {
        set_var("preview-width", visible ? "300px" : "1px");
    }

    show_statusbar(visible) {
        set_var("statusbar-height", visible ? "22px" : "0px");
    }

    use_pixel_aliasing(value) {
        set_var("scaling-type", value ? "high-quality" : "pixelated");
    }

    hide_scrollbars(value) {
        set_var("scrollbar-width", value ? "0px" : "8px");
        set_var("scrollbar-height", value ? "0px" : "8px");
    }

    chat_resizer(event) {
        event.preventDefault();
        this.mouse_y = event.clientY;
        this.chat_resizing = true;
    }

    stop_resizing() {
        this.chat_resizing = false;
    }

    mouse_move(event) {
        if (this.chat_resizing) {
            event.preventDefault();
            const scroll = chat.is_at_bottom();
            const new_height = document.getElementById("chat").getBoundingClientRect().bottom - event.clientY;
            set_var("chat-height", `${Math.max(new_height, 96)}px`);
            mouse.y = event.clientY;
            if (scroll) chat.scroll_to_bottom();
            this.emit("update_frame");
        }
    }

    zoom_in() {
        this.set_zoom(Math.min(current_zoom_factor() + 0.1, 3.0));
    }

    zoom_out() {
        this.set_zoom(Math.max(current_zoom_factor() - 0.1, 0.4));
    }

    actual_size() {
        this.set_zoom(1.0);
    }

    debug() {
        electron.remote.getCurrentWebContents().openDevTools({mode: "detach"});
    }

    constructor() {
        super();
        this.modes = modes;
        electron.ipcRenderer.on("show_statusbar", (event, visible) => this.show_statusbar(visible));
        electron.ipcRenderer.on("show_preview", (event, visible) => this.show_preview(visible));
        electron.ipcRenderer.on("show_toolbar", (event, visible) => this.show_toolbar(visible));
        electron.ipcRenderer.on("use_pixel_aliasing", (event, value) => this.use_pixel_aliasing(value));
        electron.ipcRenderer.on("hide_scrollbars", (event, value) => this.hide_scrollbars(value));
        electron.ipcRenderer.on("zoom_in", (event) => this.zoom_in());
        electron.ipcRenderer.on("zoom_out", (event) => this.zoom_out());
        electron.ipcRenderer.on("actual_size", (event) => this.actual_size());
        electron.ipcRenderer.on("change_to_select_mode", (event) => this.change_mode(modes.SELECT));
        electron.ipcRenderer.on("change_to_brush_mode", (event) => this.change_mode(modes.BRUSH));
        electron.ipcRenderer.on("debug", (event) => this.debug());
        electron.ipcRenderer.on("open_reference_image", (event) => this.open_reference_image());
        electron.ipcRenderer.on("clear_reference_image", (event) => this.clear_reference_image());
        electron.ipcRenderer.on("toggle_reference_image", (event, visible) => this.toggle_reference_image(visible));
        document.addEventListener("DOMContentLoaded", (event) => {
            document.getElementById("ice_colors_toggle").addEventListener("mousedown", (event) => this.emit("ice_colors_toggle"), true);
            document.getElementById("use_9px_font_toggle").addEventListener("mousedown", (event) => this.emit("use_9px_font_toggle"), true);
            document.getElementById("dimensions").addEventListener("mousedown", (event) => this.emit("get_canvas_size"), true);
            document.getElementById("select_mode").addEventListener("mousedown", (event) => this.change_mode(modes.SELECT), true);
            document.getElementById("brush_mode").addEventListener("mousedown", (event) => this.change_mode(modes.BRUSH), true);
            document.getElementById("line_mode").addEventListener("mousedown", (event) => this.change_mode(modes.LINE), true);
            document.getElementById("rectangle_mode").addEventListener("mousedown", (event) => this.change_mode(modes.RECTANGLE), true);
            document.getElementById("fill_mode").addEventListener("mousedown", (event) => this.change_mode(modes.FILL), true);
            document.getElementById("sample_mode").addEventListener("mousedown", (event) => this.change_mode(modes.SAMPLE), true);
            document.getElementById("chat_resizer").addEventListener("mousedown", (event) => this.chat_resizer(event), true);
            document.body.addEventListener("mousemove", (event) => this.mouse_move(event), true);
            document.body.addEventListener("mouseup", () => this.stop_resizing(), true);
            const chat_input = document.getElementById("chat_input");
            chat_input.addEventListener("focus", (event) => send("chat_input_focus"), true);
            chat_input.addEventListener("blur", (event) => send("chat_input_blur"), true);
        }, true);
    }
}

module.exports = new UIEvent();
