const modes = {EDITING: 0, SELECTION: 1, OPERATION: 2};
const {on, send} = require("../../senders");
const doc = require("../doc");
const libtextmode = require("../../libtextmode/libtextmode");
const palette = require("../palette");
const keyboard = require("../input/keyboard");
const {statusbar, toolbar} = require("../ui/ui");
const clipboard = require("./clipboard");

class Cursor {
    draw() {
        switch (this.mode) {
        case modes.EDITING:
            if (this.flashing) return;
            const {font, render} = doc;
            this.ctx.globalCompositeOperation = "source-over";
            this.ctx.drawImage(render.ice_color_collection[Math.floor(this.y / render.maximum_rows)], this.x * font.width, (this.y % render.maximum_rows) * font.height, font.width, font.height, 0, 0, font.width, font.height);
            this.ctx.globalCompositeOperation = "difference";
            font.draw_cursor(this.ctx, 0, font.height - 2);
            this.ctx.clearRect(0, 0, this.canvas.width, font.height - 2);
            break;
        case modes.SELECTION:
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            break;
        case modes.OPERATION:
            if (this.operation_blocks.underneath) {
                const canvas = libtextmode.render_blocks(libtextmode.merge_blocks(this.operation_blocks, this.get_blocks_in_operation()), doc.font);
                this.ctx.drawImage(canvas, 2, 2, canvas.width - 4, canvas.height - 4, 0, 0, canvas.width - 4, canvas.height - 4);
            }
            break;
        }
    }

    get_blocks_in_operation() {
        return doc.get_blocks(this.x, this.y, Math.min(doc.columns - 1, this.x + this.operation_blocks.columns - 1), Math.min(doc.rows - 1, this.y + this.operation_blocks.rows - 1));
    }

    scroll(x, y) {
        document.getElementById("viewport").scrollLeft += x * this.width;
        document.getElementById("viewport").scrollTop += y * this.height;
    }

    left() {
        this.move_to(Math.max(this.x - 1, 0), this.y);
        if (this.scroll_document_with_cursor) this.scroll(-1, 0);
    }

    up() {
        this.move_to(this.x, Math.max(this.y - 1, 0));
        if (this.scroll_document_with_cursor) this.scroll(0, -1);
    }

    right() {
        this.move_to(Math.min(this.x + 1, doc.columns - 1), this.y);
        if (this.scroll_document_with_cursor) this.scroll(1, 0);
    }

    down() {
        this.move_to(this.x, Math.min(this.y + 1, doc.rows - 1));
        if (this.scroll_document_with_cursor) this.scroll(0, 1);
    }

    page_up() {
        const characters_in_screen_height = Math.floor(document.getElementById("viewport").getBoundingClientRect().height / this.height);
        this.move_to(this.x, Math.max(this.y - characters_in_screen_height, 0));
        if (this.scroll_document_with_cursor) this.scroll(0, -characters_in_screen_height);
    }

    page_down() {
        const characters_in_screen_height = Math.floor(document.getElementById("viewport").getBoundingClientRect().height / this.height);
        this.move_to(this.x, Math.min(this.y + characters_in_screen_height, doc.rows - 1));
        if (this.scroll_document_with_cursor) this.scroll(0, characters_in_screen_height);
    }

    tab() {
        this.move_to(Math.min(doc.columns - 1, this.x + 8), this.y);
        if (this.scroll_document_with_cursor) this.scroll(8, 0);
    }

    reverse_tab() {
        this.move_to(Math.max(0, this.x - 8), this.y);
        if (this.scroll_document_with_cursor) this.scroll(-8, 0);
    }

    start_of_row() {
        this.move_to(0, this.y);
    }

    end_of_row() {
        if (this.mode == modes.OPERATION) {
            const {sx, dx} = this.reorientate_selection();
            const right_justified_x = doc.columns - (dx - sx + 1);
            if (this.x == right_justified_x) {
                this.move_to(doc.columns - 1, this.y);
            } else {
                this.move_to(right_justified_x, this.y);
            }
        } else {
            this.move_to(doc.columns - 1, this.y);
        }
    }

    scroll_to_cursor() {
        const cursor_top = this.height * this.y;
        const cursor_left = this.width * this.x;
        const viewport = document.getElementById("viewport");
        const viewport_rect = viewport.getBoundingClientRect();
        if (viewport.scrollTop + (this.height * this.scroll_margin) > cursor_top) {
            viewport.scrollTop = cursor_top - (this.height * this.scroll_margin);
        } else {
            const bottom_of_view = viewport.scrollTop + viewport_rect.height;
            const cursor_bottom = this.height * (this.y + this.scroll_margin + 1) + 1;
            if (bottom_of_view < cursor_bottom) viewport.scrollTop = cursor_bottom - viewport_rect.height;
        }
        if (viewport.scrollLeft + (this.width * this.scroll_margin) > cursor_left) {
            viewport.scrollLeft = cursor_left - (this.width * this.scroll_margin);
        } else {
            const right_of_view = viewport.scrollLeft + viewport_rect.width - 2;
            const cursor_farthest_right = this.width * (this.x + this.scroll_margin + 1) + 1;
            if (right_of_view < cursor_farthest_right) viewport.scrollLeft = cursor_farthest_right - viewport_rect.width + 2;
        }
    }

    new_line() {
        if (this.mode != modes.EDITING) return;
        const old_x = this.x;
        this.move_to(0, Math.min(doc.rows - 1, this.y + 1));
        if (this.scroll_document_with_cursor) this.scroll(-old_x, 1);
    }

    reorientate_selection() {
        const [sx, dx] = (this.selection.dx < this.selection.sx) ? [this.selection.dx, this.selection.sx] : [this.selection.sx, this.selection.dx];
        const [sy, dy] = (this.selection.dy < this.selection.sy) ? [this.selection.dy, this.selection.sy] : [this.selection.sy, this.selection.dy];
        return {sx, sy, dx, dy};
    }

    move_to(x, y, scroll = true) {
        this.x = x;
        this.y = y;
        switch (this.mode) {
            case modes.EDITING:
                this.canvas.style.left = `${x * this.width}px`;
                this.canvas.style.top = `${y * this.height}px`;
                this.canvas.style.width = `${this.width}px`;
                this.canvas.style.height = `${this.height}px`;
                if (doc.connection) doc.connection.cursor(this.x, this.y);
                break;
            case modes.SELECTION:
                this.selection.dx = x;
                this.selection.dy = y;
                const {sx, sy, dx, dy} = this.reorientate_selection();
                this.canvas.style.left = `${sx * this.width}px`;
                this.canvas.style.top = `${sy * this.height}px`;
                this.canvas.style.width = `${(dx - sx + 1) * this.width - 4}px`;
                this.canvas.style.height = `${(dy - sy + 1) * this.height - 4}px`;
                statusbar.status_bar_info(dx - sx + 1, dy - sy + 1);
                if (doc.connection) doc.connection.selection(this.x, this.y);
                break;
            case modes.OPERATION:
                this.canvas.style.left = `${x * this.width}px`;
                this.canvas.style.top = `${y * this.height}px`;
                if (doc.connection) doc.connection.operation(this.x, this.y);
                break;
        }
        this.draw();
        statusbar.set_cursor_position(this.x, this.y);
        if (scroll) this.scroll_to_cursor();
    }

    show() {
        if (this.hidden) {
            document.getElementById("editing_layer").appendChild(this.canvas);
            this.hidden = false;
            this.draw();
        }
    }

    hide() {
        if (!this.hidden) {
            document.getElementById("editing_layer").removeChild(this.canvas);
            this.hidden = true;
            if (doc.connection) doc.connection.hide_cursor();
        }
    }

    resize_to_font() {
        const font = doc.font;
        this.width = font.width;
        this.height = font.height;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.move_to(this.x, this.y, false);
    }

    new_render() {
        this.move_to(Math.min(this.x, doc.columns - 1), Math.min(this.y, doc.rows - 1));
        this.resize_to_font();
        if (this.mode == modes.OPERATION) this.redraw_operation_blocks();
    }

    start_selection_mode() {
        this.selection = {sx: this.x, sy: this.y};
        this.canvas.classList.add("selection");
        this.mode = modes.SELECTION;
        this.draw();
        send("enable_selection_menu_items");
        send("show_selection_touchbar");
    }

    start_editing_mode() {
        if (this.mode == modes.SELECTION) {
            this.x = this.selection.sx;
            this.y = this.selection.sy;
        }
        send("enable_editing_shortcuts");
        this.mode = modes.EDITING;
        if (this.canvas.classList.contains("selection")) this.canvas.classList.remove("selection");
        if (this.canvas.classList.contains("operation")) this.canvas.classList.remove("operation");
        this.resize_to_font();
        statusbar.use_canvas_size_for_status_bar();
        send("show_editing_touchbar");
    }

    deselect() {
        if (this.mode == modes.OPERATION && this.operation_blocks.is_move_operation) doc.undo();
        this.start_editing_mode();
    }

    redraw_operation_blocks() {
        const font = doc.font;
        this.canvas.width = this.operation_blocks.columns * font.width - 4; this.canvas.height = this.operation_blocks.rows * font.height - 4;
        this.canvas.style.width = `${this.canvas.width}px`; this.canvas.style.height = `${this.canvas.height}px`;
        const canvas = libtextmode.render_blocks(this.operation_blocks, doc.font);
        this.ctx.drawImage(canvas, 2, 2, canvas.width - 4, canvas.height - 4, 0, 0, canvas.width - 4, canvas.height - 4);
    }

    set_operation_mode(blocks) {
        if (this.mode == modes.EDITING) this.start_selection_mode();
        this.operation_blocks = blocks;
        this.mode = modes.OPERATION;
        this.redraw_operation_blocks();
        send("disable_selection_menu_items_except_deselect_and_crop");
        send("enable_operation_menu_items");
        send("show_operation_touchbar");
        statusbar.use_canvas_size_for_status_bar();
        this.canvas.classList.add("operation");
    }

    start_operation_mode(is_move_operation) {
        const {sx, sy, dx, dy} = this.reorientate_selection();
        this.set_operation_mode({...doc.get_blocks(sx, sy, dx, dy), is_move_operation});
        if (doc.connection) doc.connection.operation(sx, sy);
        if (is_move_operation) doc.erase(sx, sy, dx, dy);
        this.move_to(sx, sy);
    }

    erase() {
        const {sx, sy, dx, dy} = this.reorientate_selection();
        doc.erase(sx, sy, dx, dy);
        this.start_editing_mode();
    }

    fill() {
        const {sx, sy, dx, dy} = this.reorientate_selection();
        doc.fill(sx, sy, dx, dy, palette.fg);
        this.start_editing_mode();
    }

    set_flashing(value) {
        if (this.flashing != value) {
            this.flashing = value;
            if (this.flashing) {
                this.canvas.getContext("2d").clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.canvas.classList.add("flashing");
            } else {
                this.canvas.classList.remove("flashing");
            }
            this.draw();
        }
    }

    attribute_under_cursor() {
        const block = doc.at(this.x, this.y);
        palette.fg = block.fg;
        palette.bg = block.bg;
    }

    rotate() {
        libtextmode.rotate(this.operation_blocks);
        this.redraw_operation_blocks();
        if (doc.connection) doc.connection.rotate();
    }

    flip_x() {
        libtextmode.flip_x(this.operation_blocks);
        this.redraw_operation_blocks();
        if (doc.connection) doc.connection.flip_x();
    }

    flip_y() {
        libtextmode.flip_y(this.operation_blocks);
        this.redraw_operation_blocks();
        if (doc.connection) doc.connection.flip_y();
    }

    center() {
        this.move_to(Math.max(Math.floor((doc.columns - this.operation_blocks.columns) / 2), 0), this.y);
    }

    transparent(value) {
        if (value) {
            this.operation_blocks.underneath = false;
            send("uncheck_underneath");
            this.redraw_operation_blocks();
            send("uncheck_over");
        } else {
            send("uncheck_underneath");
            send("check_over");
        }
        this.operation_blocks.transparent = value;
        this.redraw_operation_blocks();
        this.draw();
    }

    over(value) {
        if (value) {
            this.operation_blocks.transparent = false;
            send("uncheck_transparent");
            this.operation_blocks.underneath = false;
            send("uncheck_underneath");
            this.redraw_operation_blocks();
        } else {
            this.operation_blocks.underneath = true;
            send("check_underneath");
        }
        this.draw();
    }

    underneath(value) {
        if (value) {
            this.operation_blocks.transparent = false;
            send("uncheck_transparent");
            send("uncheck_over");
            this.operation_blocks.underneath = true;
        } else {
            this.operation_blocks.underneath = false;
            this.redraw_operation_blocks();
            send("check_over");
        }
        this.draw();
    }

    key_typed(code) {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.start_undo();
        if (keyboard.insert_mode) {
            for (let x = doc.columns - 1; x > this.x; x--) {
                const block = doc.at(x - 1, this.y);
                doc.change_data(x, this.y, block.code, block.fg, block.bg);
            }
        }
        const x = this.x;
        if (!keyboard.overwrite_mode) this.right();
        doc.change_data(x, this.y, code, palette.fg, palette.bg, {prev_x: x, prev_y: this.y}, this);
        this.draw();
    }

    f_key(num) {
        this.key_typed(toolbar.f_key(num));
    }

    backspace() {
        if (this.hidden || this.mode != modes.EDITING) return;
        if (this.x > 0) {
            doc.start_undo();
            const x = this.x;
            this.left();
            doc.clear_at(x - 1, this.y, {prev_x: x, prev_y: this.y}, this);
        }
    }

    delete_key() {
        if (this.hidden || this.mode == modes.OPERATION) return;
        if (this.mode == this.modes.SELECTION) {
            this.erase();
            return;
        }
        doc.start_undo();
        for (let x = this.x; x < doc.columns - 1; x++) {
            const block = doc.at(x + 1, this.y);
            doc.change_data(x, this.y, block.code, block.fg, block.bg);
        }
        doc.clear_at(doc.columns - 1, this.y, {prev_x: this.x, prev_y: this.y}, this);
    }

    start_selection() {
        if (this.mode == modes.EDITING) this.start_selection_mode();
    }

    start_selection_hotkey() {
        if (this.mode == modes.EDITING) {
            this.start_selection_mode();
            this.move_to(this.x, this.y);
        }
    }

    left_justify_line() {
        if (this.mode == modes.EDITING) doc.left_justify_line(this.y);
    }

    right_justify_line() {
        if (this.mode == modes.EDITING) doc.right_justify_line(this.y);
    }

    center_line() {
        if (this.mode == modes.EDITING) doc.center_line(this.y);
    }

    erase_line() {
        if (this.mode == modes.EDITING) {
            doc.erase_line(this.y);
            this.draw();
        }
    }

    erase_to_start_of_line() {
        if (this.mode == modes.EDITING) {
            doc.erase_to_start_of_line(this.x, this.y);
            this.draw();
        }
    }

    erase_to_end_of_line() {
        if (this.mode == modes.EDITING) {
            doc.erase_to_end_of_line(this.x, this.y);
            this.draw();
        }
    }

    erase_column() {
        if (this.mode == modes.EDITING) {
            doc.erase_column(this.x);
            this.draw();
        }
    }

    erase_to_start_of_column() {
        if (this.mode == modes.EDITING) {
            doc.erase_to_start_of_column(this.x, this.y);
            this.draw();
        }
    }

    erase_to_end_of_column() {
        if (this.mode == modes.EDITING) {
            doc.erase_to_end_of_column(this.x, this.y);
            this.draw();
        }
    }

    insert_row(y) {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.insert_row(y);
        this.draw();
    }

    delete_row(y) {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.delete_row(y);
        this.draw();
    }

    insert_column(x) {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.insert_column(x);
        this.draw();
    }

    delete_column(x) {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.delete_column(x);
        this.draw();
    }

    scroll_canvas_up() {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.scroll_canvas_up();
        this.draw();
    }

    scroll_canvas_down() {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.scroll_canvas_down();
        this.draw();
    }

    scroll_canvas_left() {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.scroll_canvas_left();
        this.draw();
    }

    scroll_canvas_right() {
        if (this.hidden || this.mode != modes.EDITING) return;
        doc.scroll_canvas_right();
        this.draw();
    }

    stamp() {
        const blocks = this.operation_blocks.underneath ? libtextmode.merge_blocks(this.operation_blocks, this.get_blocks_in_operation()) : this.operation_blocks;
        doc.place(blocks, this.x, this.y, this.operation_blocks.is_move_operation);
        if (this.operation_blocks.is_move_operation) this.operation_blocks.is_move_operation = false;
    }

    place() {
        this.stamp();
        this.start_editing_mode();
    }

    crop() {
        if (this.mode == modes.SELECTION) this.start_operation_mode(false);
        send("new_document", {title: doc.title, author: doc.author, group: doc.group, date: doc.date, palette: doc.palette, font_name: doc.font_name, use_9px_font: doc.use_9px_font, ice_colors: doc.ice_colors, ...this.operation_blocks});
        this.deselect();
    }

    copy() {
        if (this.mode == modes.EDITING) return;
        if (this.mode == modes.SELECTION) this.start_operation_mode(false);
        clipboard.copy(this.operation_blocks);
        this.start_editing_mode();
    }

    cut() {
        const {sx, sy, dx, dy} = this.reorientate_selection();
        this.copy();
        doc.erase(sx, sy, dx, dy);
        this.start_editing_mode();
    }

    paste() {
        clipboard.paste(this.x, this.y);
    }

    paste_as_selection() {
        const blocks = clipboard.paste_blocks();
        if (blocks) {
            if (doc.connection) doc.connection.paste_as_selection(blocks);
            this.set_operation_mode(blocks);
        }
    }

    use_scroll_margin(value) {
        const num = Number.parseInt(value);
        if (num >= 0 && num <= 16) this.scroll_margin = num;
    }

    undo_move_to(x, y) {
        if (!this.hidden && this.mode == modes.EDITING) this.move_to(x, y);
    }

    constructor() {
        this.modes = modes;
        this.mode = modes.EDITING;
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        this.x = 0;
        this.y = 0;
        this.hidden = true;
        this.flashing = false;
        this.selection = {sx: 0, sy: 0, dx: 0, dy: 0};
        this.scroll_document_with_cursor = false;
        on("deselect", (event) => this.deselect());
        on("use_flashing_cursor", (event, value) => this.set_flashing(value));
        on("fill", (event) => this.fill());
        on("copy_block", (event) => this.start_operation_mode(false));
        on("move_block", (event) => this.start_operation_mode(true));
        on("scroll_document_with_cursor", (event, value) => this.scroll_document_with_cursor = value);
        on("use_attribute_under_cursor", (event) => this.attribute_under_cursor());
        on("rotate", (event) => this.rotate());
        on("flip_x", (event) => this.flip_x());
        on("flip_y", (event) => this.flip_y());
        on("center", (event) => this.center());
        on("transparent", (event, value) => this.transparent(value));
        on("underneath", (event, value) => this.underneath(value));
        on("over", (event, value) => this.over(value));
        on("left_justify_line", (event, value) => this.left_justify_line());
        on("right_justify_line", (event, value) => this.right_justify_line());
        on("center_line", (event, value) => this.center_line());
        on("erase_line", (event, value) => this.erase_line());
        on("erase_to_start_of_line", (event, value) => this.erase_to_start_of_line());
        on("erase_to_end_of_line", (event, value) => this.erase_to_end_of_line());
        on("erase_column", (event, value) => this.erase_column());
        on("erase_to_start_of_column", (event, value) => this.erase_to_start_of_column());
        on("erase_to_end_of_column", (event, value) => this.erase_to_end_of_column());
        on("insert_row", (event) => this.insert_row(this.y));
        on("delete_row", (event) => this.delete_row(this.y));
        on("insert_column", (event) => this.insert_column(this.x));
        on("delete_column", (event) => this.delete_column(this.x));
        keyboard.on("insert_row", () => this.insert_row(this.y));
        keyboard.on("delete_row", () => this.delete_row(this.y));
        keyboard.on("insert_column", () => this.insert_column(this.x));
        keyboard.on("delete_column", () => this.delete_column(this.x));
        on("scroll_canvas_up", (event) => this.scroll_canvas_up());
        on("scroll_canvas_down", (event) => this.scroll_canvas_down());
        on("scroll_canvas_left", (event) => this.scroll_canvas_left());
        on("scroll_canvas_right", (event) => this.scroll_canvas_right());
        ["left", "right", "up", "down", "page_up", "page_down", "start_of_row", "end_of_row", "tab", "reverse_tab"].map((event) => {
            keyboard.on(event, () => {
                if (!this.hidden) this[event]();
            });
        });
        on("stamp", (event, value) => this.stamp());
        on("erase", (event, value) => this.erase());
        on("place", (event, value) => this.place());
        on("crop", (event, value) => this.crop());
        keyboard.on("key_typed", (code) => this.key_typed(code));
        toolbar.on("key_typed", (code) => this.key_typed(code));
        keyboard.on("backspace", () => this.backspace());
        keyboard.on("delete_key", () => this.delete_key());
        keyboard.on("f_key", (num) => this.f_key(num));
        keyboard.on("start_selection", () => this.start_selection());
        on("start_selection", (event) => this.start_selection_hotkey());
        keyboard.on("new_line", () => this.new_line());
        keyboard.on("cut", () => this.cut());
        keyboard.on("copy", () => this.copy());
        keyboard.on("paste", () => this.paste());
        on("cut", (event) => this.cut());
        on("copy", (event) => this.copy());
        on("paste", (event) => this.paste());
        on("paste_as_selection", (event) => this.paste_as_selection());
        on("scroll_margin", (event, value) => this.use_scroll_margin(value));
        doc.undo_history.on("move_to", (x, y) => this.undo_move_to(x, y));
        doc.on("render", () => this.new_render());
        on("undo", (event) => this.draw());
        on("redo", (event) => this.draw());
    }
}

module.exports = new Cursor();
