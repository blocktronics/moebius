const doc = require("./doc");
const libtextmode = require("../libtextmode/libtextmode");
const keyboard = require("./input/keyboard");
const {on, send_sync} = require("../senders");
const events = require("events");

class PaletteChooser extends events.EventEmitter {
    set fg(value) {
        if (this.fg_value != undefined) this.divs[this.fg_value].classList.remove("selected_fg");
        this.divs[value].classList.add("selected_fg");
        document.getElementById("fg").style.backgroundColor = this.divs[value].style.backgroundColor;
        this.fg_value = value;
        this.emit("set_fg", this.fg_value);
    }

    get fg() {
        return this.fg_value;
    }

    set bg(value) {
        if (this.bg_value != undefined) this.divs[this.bg_value].classList.remove("selected_bg");
        this.divs[value].classList.add("selected_bg");
        document.getElementById("bg").style.backgroundColor = this.divs[value].style.backgroundColor;
        this.bg_value = value;
        this.emit("set_bg", this.bg_value);
        if (libtextmode.has_c64_palette(doc.palette)) {
            doc.c64_background = this.bg_value;
            doc.start_rendering();
        }
    }

    get bg() {
        return this.bg_value;
    }

    update_swatches() {
        const swatches = document.getElementById("swatches");
        if (this.divs) for (const div of this.divs) swatches.removeChild(div);
        this.divs = doc.palette.map((rgb, i) => {
            const div = document.createElement("div");
            div.style.backgroundColor = libtextmode.convert_ega_to_style(rgb);
            div.addEventListener("mousedown", (event) => {
                if (event.button == 2 || event.ctrlKey) {
                    this.bg = i;
                    if (doc.connection) doc.connection.set_bg(this.bg);
                } else if (event.button == 0) {
                    this.fg = i;
                }
            });
            return div;
        });
        for (const div of this.divs) swatches.appendChild(div);
        this.fg = this.fg_value;
        this.bg = this.bg_value;
        if (libtextmode.has_c64_palette(doc.palette)) {
            doc.c64_background = this.bg_value;
        } else {
            doc.c64_background = undefined;
        }
    }

    new_document() {
        if (libtextmode.has_c64_palette(doc.palette)) {
            this.bg_value = doc.get_blocks(0, 0, 0, 0).data[0].bg;
            this.emit("set_bg", this.bg_value);
            doc.c64_background = this.bg_value;
        }
        this.update_swatches();
    }

    previous_foreground_color() {
        this.fg = (this.fg == 0) ? 15 : this.fg - 1;
    }

    next_foreground_color() {
        this.fg = (this.fg == 15) ? 0 : this.fg + 1;
    }

    previous_background_color() {
        this.bg = (this.bg == 0) ? 15 : this.bg - 1;
        if (doc.connection) doc.connection.set_bg(this.bg);
    }

    next_background_color() {
        this.bg = (this.bg == 15) ? 0 : this.bg + 1;
        if (doc.connection) doc.connection.set_bg(this.bg);
    }

    default_color() {
        this.fg = 7;
        this.bg = 0;
        if (doc.connection) doc.connection.set_bg(this.bg);
    }

    switch_foreground_background() {
        const tmp = this.fg;
        this.fg = this.bg;
        this.bg = tmp;
        if (doc.connection) doc.connection.set_bg(this.bg);
    }

    toggle_fg(num) {
        if (this.fg == num || (this.fg >= 8 && this.fg != num + 8)) {
            this.fg = num + 8;
        } else {
            this.fg = num;
        }
    }

    toggle_bg(num) {
        if (this.bg == num || (this.bg >= 8 && this.bg != num + 8)) {
            this.bg = num + 8;
        } else {
            this.bg = num;
            if (doc.connection) doc.connection.set_bg(this.bg);
        }
    }

    select_attribute() {
        send_sync("select_attribute", {fg: this.fg, bg: this.bg, palette: doc.palette});
    }

    constructor() {
        super();
        this.fg_value = 7;
        this.bg_value = 0;
        doc.on("new_document", () => this.new_document());
        doc.on("update_swatches", () => this.update_swatches());
        doc.on("set_bg", (value) => this.bg  = value);
        keyboard.on("previous_foreground_color", () => this.previous_foreground_color());
        keyboard.on("next_foreground_color", () => this.next_foreground_color());
        keyboard.on("previous_background_color", () => this.previous_background_color());
        keyboard.on("next_background_color", () => this.next_background_color());
        on("previous_foreground_color", (event) => this.previous_foreground_color());
        on("next_foreground_color", (event) => this.next_foreground_color());
        on("previous_background_color", (event) => this.previous_background_color());
        on("next_background_color", (event) => this.next_background_color());
        on("default_color", (event) => this.default_color());
        on("switch_foreground_background", (event) => this.switch_foreground_background());
        on("set_fg", (event, new_fg) => this.fg = new_fg);
        on("set_bg", (event, new_bg) => {
            this.bg = new_bg;
            if (doc.connection) doc.connection.set_bg(this.bg);
        });
        keyboard.on("toggle_fg", (num) => this.toggle_fg(num));
        keyboard.on("toggle_bg", (num) => this.toggle_bg(num));
    }
}

module.exports = new PaletteChooser();
