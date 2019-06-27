const events = require("events");
const doc = require("../doc");
const buttons = {NONE: 0, LEFT: 1, RIGHT: 2};
const {toolbar} = require("../ui/ui");
const palette = require("../palette");

class MouseListener extends events.EventEmitter {
    set_dimensions(columns, rows, font) {
        this.columns = columns;
        this.rows = rows;
        this.font = font;
    }

    get_xy(event) {
        const canvas_container = document.getElementById("canvas_container");
        const canvas_container_rect = canvas_container.getBoundingClientRect();
        const x = Math.floor((event.clientX - canvas_container_rect.left) / this.font.width);
        const y = Math.floor((event.clientY - canvas_container_rect.top) / this.font.height);
        const half_y = Math.floor((event.clientY - canvas_container_rect.top) / (this.font.height / 2));
        return {x, y, half_y};
    }

    record_start() {
        [this.start.x, this.start.y, this.start.half_y] = [this.x, this.y, this.half_y];
        this.started = true;
    }

    start_drawing() {
        this.drawing = true;
    }

    end() {
        this.button = buttons.NONE;
        this.started = false;
        this.drawing = false;
    }

    store(x, y, half_y) {
        [this.x, this.y, this.half_y] = [x, y, half_y];
    }

    mouse_down(event) {
        if (!this.font) return;
        const {x, y, half_y} = this.get_xy(event);
        const is_legal = (x >= 0 && x < doc.columns && y >= 0 && y < doc.rows);
        if (event.altKey) {
            if (!is_legal) return;
            const block = doc.get_half_block(x, half_y);
            if (block.is_blocky) {
                palette[(event.button == 0) ? "fg" : "bg"] = block.is_top ? block.upper_block_color : block.lower_block_color;
            } else {
                palette[(event.button == 0) ? "fg" : "bg"] = block.fg;
            }
            return;
        }
        this.store(x, y, half_y);
        if (event.button == 0) {
            this.button = buttons.LEFT;
        } else if (event.button == 2) {
            this.button = buttons.RIGHT;
        }
        this.emit("down", x, y, half_y, is_legal, this.button, event.shiftKey);
        this.last = {x, y, half_y};
    }

    same_as_last(x, y, half_y) {
        if (this.last.x == x && this.last.y == y && (toolbar.mode != toolbar.modes.HALF_BLOCK || this.last.half_y == half_y)) return true;
        this.last = {x, y, half_y};
        return false;
    }

    mouse_move(event) {
        if (!this.font) return;
        const {x, y, half_y} = this.get_xy(event);
        const is_legal = (x >= 0 && x < doc.columns && y >= 0 && y < doc.rows);
        if (this.x == x && this.y == y && this.half_y == half_y) return;
        if (this.drawing) {
            if (!this.same_as_last(x, y, half_y)) {
                this.emit("draw", x, y, half_y, is_legal, this.button, event.shiftKey);
                this.store(x, y, half_y);
            }
        } else if (this.started) {
            if (!this.same_as_last(x, y, half_y)) this.emit("to", x, y, half_y, this.button);
        } else {
            this.emit("move", x, y, half_y, is_legal);
        }
    }

    mouse_up(event) {
        if (!this.font) return;
        const {x, y, half_y} = this.get_xy(event);
        if (this.drawing || this.started) {
            this.emit("up", x, y, half_y, this.button);
            this.end();
        }
    }

    mouse_out(event) {
        if (event.relatedTarget) return;
        this.end();
    }

    constructor() {
        super();
        this.buttons = buttons;
        this.button = buttons.NONE;
        this.start = {x: 0, y: 0, half_y: 0};
        this.started = false;
        this.drawing = false;
        doc.on("render", () => this.set_dimensions(doc.columns, doc.rows, doc.font));
        document.addEventListener("DOMContentLoaded", (event) => {
            document.getElementById("viewport").addEventListener("mousedown", (event) => this.mouse_down(event), true);
            document.body.addEventListener("mousemove", (event) => this.mouse_move(event), true);
            document.body.addEventListener("mouseup", (event) => this.mouse_up(event), true);
            document.body.addEventListener("mouseout", (event) => this.mouse_out(event), true);
        });
    }
}


module.exports = new MouseListener();
