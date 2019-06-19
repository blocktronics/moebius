const libtextmode = require("../js/libtextmode/libtextmode");
const fs = require("fs");
let render, interval, mouse_button;
const events = require("events");

const cursor_modes = {EDITING: 0, SELECTION: 1, OPERATION: 2};

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function update_status_bar_cursor_pos(x, y) {
    document.getElementById("cursor_x").textContent = `${x + 1}`;
    document.getElementById("cursor_y").textContent = `${y + 1}`;
}

function update_columns_and_rows(columns, rows) {
    document.getElementById("columns").textContent = `${columns}`;
    document.getElementById("rows").textContent = `${rows}`;
    document.getElementById("columns_s").textContent = (columns > 1) ? "s" : "";
    document.getElementById("rows_s").textContent = (rows > 1) ? "s" : "";
}

class Cursor extends events.EventEmitter {
    draw() {
        const ctx = this.canvas.getContext("2d");
        switch (this.mode) {
            case cursor_modes.EDITING:
                if (!this.flashing) {
                    ctx.globalCompositeOperation = "source-over";
                    ctx.drawImage(render.ice_color_collection[Math.floor(this.y / render.maximum_rows)], this.x * render.font.width, (this.y % render.maximum_rows) * render.font.height, render.font.width, render.font.height, 0, 0, render.font.width, render.font.height);
                    ctx.globalCompositeOperation = "difference";
                    render.font.draw_cursor(ctx, 0, render.font.height - 2);
                    ctx.clearRect(0, 0, this.canvas.width, render.font.height - 2);
                }
            break;
            case cursor_modes.SELECTION:
                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                break;
        }
    }

    reorientate_selection() {
        const reorientated_selection = {sx: 0, sy: 0, dx: 0, dy: 0};
        if (this.selection.dx < this.selection.sx) {
            reorientated_selection.sx = this.selection.dx;
            reorientated_selection.dx = this.selection.sx;
        } else {
            reorientated_selection.sx = this.selection.sx;
            reorientated_selection.dx = this.selection.dx;
        }
        if (this.selection.dy < this.selection.sy) {
            reorientated_selection.sy = this.selection.dy;
            reorientated_selection.dy = this.selection.sy;
        } else {
            reorientated_selection.sy = this.selection.sy;
            reorientated_selection.dy = this.selection.dy;
        }
        return reorientated_selection;
    }

    move_to(x, y, scroll_view = false, emit = true) {
        this.x = x; this.y = y;
        if (this.user) update_status_bar_cursor_pos(this.x, this.y);
        switch (this.mode) {
            case cursor_modes.EDITING:
                this.canvas.style.left = `${x * render.font.width}px`;
                this.canvas.style.top = `${y * render.font.height}px`;
                this.canvas.style.width = `${render.font.width}px`;
                this.canvas.style.height = `${render.font.height}px`;
                if (this.connection) this.connection.cursor(x, y);
                break;
            case cursor_modes.SELECTION:
                this.selection.dx = x;
                this.selection.dy = y;
                const {sx, sy, dx, dy} = this.reorientate_selection();
                this.canvas.style.left = `${sx * render.font.width}px`;
                this.canvas.style.top = `${sy * render.font.height}px`;
                this.canvas.style.width = `${(dx - sx + 1) * render.font.width}px`;
                this.canvas.style.height = `${(dy - sy + 1) * render.font.height}px`;
                if (this.connection) this.connection.selection(x, y);
                if (this.user) update_columns_and_rows(dx - sx + 1, dy - sy + 1);
                break;
            case cursor_modes.OPERATION:
                this.canvas.style.left = `${x * render.font.width}px`;
                this.canvas.style.top = `${y * render.font.height}px`;
                if (this.connection) this.connection.operation(x, y);
                if (this.user && emit) this.emit("move");
                break;
        }
        this.draw();
        if (scroll_view) {
            const cursor_top = render.font.height * this.y;
            const cursor_left = render.font.width * this.x;
            const viewport = document.getElementById("viewport");
            const viewport_rect = viewport.getBoundingClientRect();
            if (viewport.scrollTop > cursor_top) {
                viewport.scrollTop = cursor_top;
            } else {
                const bottom_of_view = viewport.scrollTop + viewport_rect.height;
                const cursor_bottom = render.font.height * (this.y + 1) + 1;
                if (bottom_of_view < cursor_bottom) viewport.scrollTop = cursor_bottom - viewport_rect.height;
            }
            if (viewport.scrollLeft > cursor_left) {
                viewport.scrollLeft = cursor_left;
            } else {
                const right_of_view = viewport.scrollLeft + viewport_rect.width - 2;
                const cursor_farthest_right = render.font.width * this.x + render.font.width - 1;
                if (right_of_view < cursor_farthest_right) viewport.scrollLeft = cursor_farthest_right - viewport_rect.width + 2;
            }
        }
    }

    scroll(x, y) {
        document.getElementById("viewport").scrollLeft += x * render.font.width;
        document.getElementById("viewport").scrollTop += y * render.font.height;
    }

    left() {
        if (this.x > 0) this.move_to(this.x - 1, this.y, !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(-1, 0);
    }

    up() {
        if (this.y > 0) this.move_to(this.x, this.y - 1, !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(0, -1);
    }

    right() {
        if (this.x < render.columns - 1) this.move_to(this.x + 1, this.y, !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(1, 0);
    }

    down() {
        if (this.y < render.rows - 1) this.move_to(this.x, this.y + 1, !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(0, 1);
    }

    new_line() {
        const old_x = this.x;
        this.move_to(0, Math.min(render.rows - 1, this.y + 1), !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(-old_x, 1);
    }

    start_of_row() {
        if (this.x > 0) this.move_to(0, this.y, true);
    }

    end_of_row() {
        if (this.mode == cursor_modes.OPERATION) {
            const {sx, dx} = this.reorientate_selection();
            const right_justified_x = render.columns - (dx - sx + 1);
            if (this.x == right_justified_x) {
                if (this.x < render.columns - 1) this.move_to(render.columns - 1, this.y, true);
            } else {
                this.move_to(right_justified_x, this.y, true);
            }
        } else {
            if (this.x < render.columns - 1) this.move_to(render.columns - 1, this.y, true);
        }
    }

    page_up() {
        const characters_in_screen_height = Math.floor(document.getElementById("viewport").getBoundingClientRect().height / render.font.height);
        if (this.y > 0) this.move_to(this.x, Math.max(this.y - characters_in_screen_height, 0), !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(0, -characters_in_screen_height);
    }

    page_down() {
        const characters_in_screen_height = Math.floor(document.getElementById("viewport").getBoundingClientRect().height / render.font.height);
        if (this.y < render.rows - 1) this.move_to(this.x, Math.min(this.y + characters_in_screen_height, render.rows - 1), !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(0, characters_in_screen_height);
    }

    tab() {
        if (this.x < render.columns - 1) this.move_to(Math.min(render.columns - 1, this.x + 8), this.y, !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(8, 0);
    }

    reverse_tab() {
        if (this.x > 0) this.move_to(Math.max(0, this.x - 8), this.y, !this.scroll_document_with_cursor);
        if (this.scroll_document_with_cursor) this.scroll(-8, 0);
    }

    resize_to_font() {
        this.canvas.width = render.font.width;
        this.canvas.height = render.font.height;
        this.move_to(this.x, this.y);
    }

    show() {
        if (this.hidden) {
            document.getElementById("editing_layer").appendChild(this.canvas);
            this.hidden = false;
            if (this.connection) this.connection.cursor(this.x, this.y);
        }
    }

    hide() {
        if (!this.hidden) {
            document.getElementById("editing_layer").removeChild(this.canvas);
            this.hidden = true;
            if (this.connection) this.connection.hide_cursor();
            if (this.user && this.mode != cursor_modes.EDITING) update_columns_and_rows(render.columns, render.rows);
        }
    }

    start_using_selection_border() {
        this.selection = {sx: this.x, sy: this.y};
        this.canvas.classList.add("selection");
        this.mode = cursor_modes.SELECTION;
    }

    stop_using_selection_border() {
        this.mode = cursor_modes.EDITING;
        this.x = this.selection.sx; this.y = this.selection.sy;
        this.canvas.classList.remove("selection");
        this.resize_to_font();
    }

    start_selection_mode() {
        send("enable_selection_menu_items");
        this.start_using_selection_border();
        send("show_selection_touchbar");
    }

    start_editing_mode() {
        switch (this.mode) {
            case cursor_modes.EDITING:
                send("show_editing_touchbar");
                break;
            case cursor_modes.SELECTION:
                send("disable_selection_menu_items");
                this.stop_using_selection_border();
                send("show_editing_touchbar");
                if (this.user) update_columns_and_rows(render.columns, render.rows);
                break;
            case cursor_modes.OPERATION:
                send("disable_selection_menu_items");
                send("disable_operation_menu_items");
                this.mode = cursor_modes.EDITING;
                this.canvas.classList.remove("selection");
                this.resize_to_font();
                send("show_editing_touchbar");
                if (this.user) update_columns_and_rows(render.columns, render.rows);
                break;
        }
    }

    get_blocks_in_selection(data) {
        if (this.mode == cursor_modes.SELECTION) {
            const {sx, sy, dx, dy} = this.reorientate_selection();
            const blocks = {columns: dx - sx + 1, rows: dy - sy + 1, data: [], transparent: false, underneath: false};
            for (let y = sy; y <= dy; y++) {
                for (let x = sx; x <= dx; x++) {
                    blocks.data.push(Object.assign(data[y * render.columns + x]));
                }
            }
            return blocks;
        }
    }

    get_blocks_in_operation(data) {
        if (this.mode == cursor_modes.OPERATION) {
            let {sx, sy, dx, dy} = this.reorientate_selection();
            dx = Math.min(render.columns - 1, cursor.x + dx - sx);
            dy = Math.min(render.rows - 1, cursor.y + dy - sy);
            const blocks = {columns: dx - cursor.x + 1, rows: dy - cursor.y + 1, data: [], transparent: true};
            for (let y = cursor.y; y <= dy; y++) {
                for (let x = cursor.x; x <= dx; x++) {
                    blocks.data.push(Object.assign(data[y * render.columns + x]));
                }
            }
            return blocks;
        }
    }

    resize_selection(columns, rows) {
        this.canvas.width = columns * render.font.width - 2; this.canvas.height = rows * render.font.height - 2;
        this.canvas.style.width = `${this.canvas.width + 2}px`; this.canvas.style.height = `${this.canvas.height + 2}px`;
        if (this.connection) this.connection.resize_selection(columns, rows);
        if (this.user) update_columns_and_rows(columns, rows);
    }

    update_cursor_with_blocks(blocks) {
        const canvas = libtextmode.render_blocks(blocks, render.font);
        this.resize_selection(blocks.columns, blocks.rows);
        const ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(canvas, 1, 1, canvas.width - 2, canvas.height - 2, 0, 0, canvas.width - 2, canvas.height - 2);
    }

    start_operation_mode(data, is_move_operation = false) {
        if (this.mode == cursor_modes.SELECTION) {
            send("disable_selection_menu_items_except_deselect_and_crop");
            send("enable_operation_menu_items");
            const blocks = this.get_blocks_in_selection(data);
            this.update_cursor_with_blocks(blocks);
            this.mode = cursor_modes.OPERATION;
            const {sx, sy} = this.reorientate_selection();
            this.move_to(sx, sy, true, false);
            this.is_move_operation = is_move_operation;
            send("show_operation_touchbar");
            return blocks;
        }
    }

    index() {
        return render.columns * this.y + this.x;
    }

    appear_ghosted() {
        this.canvas.classList.add("ghosted");
    }

    constructor(user = true) {
        super();
        this.user = user;
        this.canvas = document.createElement("canvas");
        this.x = 0; this.y = 0;
        this.mode = cursor_modes.EDITING;
        this.hidden = true;
        this.flashing = false;
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
}

function hide(id) {
    document.getElementById(id).classList.add("hidden");
}

function show(id) {
    document.getElementById(id).classList.remove("hidden");
}

function start_blinking() {
    let vis_toggle = false;
    document.getElementById("ice_color_container").style.display = "none";
    document.getElementById("blink_off_container").style.removeProperty("display");
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
        if (vis_toggle) {
            document.getElementById("blink_on_container").style.display = "none";
            document.getElementById("blink_off_container").style.removeProperty("display");
        } else {
            document.getElementById("blink_off_container").style.display = "none";
            document.getElementById("blink_on_container").style.removeProperty("display");
        }
        vis_toggle = !vis_toggle;
    }, 300);
}

function stop_blinking() {
    if (interval) clearInterval(interval);
    document.getElementById("ice_color_container").style.removeProperty("display");
    document.getElementById("blink_off_container").style.display = "none";
    document.getElementById("blink_on_container").style.display = "none";
}

function update_frame() {
    const viewport = document.getElementById("viewport");
    const view_rect = viewport.getBoundingClientRect();
    const view_frame = document.getElementById("view_frame");
    if (render) {
        const scale_factor = render.width / 260;
        const width = Math.min(Math.ceil(view_rect.width / scale_factor), 260);
        const height = Math.min(Math.ceil(view_rect.height / scale_factor), render.height / scale_factor);
        const top = Math.ceil(viewport.scrollTop / scale_factor);
        const left = Math.ceil(viewport.scrollLeft / scale_factor);
        view_frame.style.width = `${width}px`;
        view_frame.style.height = `${height}px`;
        view_frame.style.top = `${top}px`;
        view_frame.style.left = `${20 + left}px`;
        if (top < preview.scrollTop) preview.scrollTop = top;
        const preview_height = preview.getBoundingClientRect().height;
        if (top > preview_height + preview.scrollTop - height - 2) preview.scrollTop = top - preview_height + height + 2;
    }
}

function add(new_render) {
    hide("view_frame");
    const ice_color_container = document.getElementById("ice_color_container");
    const blink_off_container = document.getElementById("blink_off_container");
    const blink_on_container = document.getElementById("blink_on_container");
    const preview = document.getElementById("preview");
    if (render) {
        for (const canvas of render.ice_color_collection) ice_color_container.removeChild(canvas);
        for (const canvas of render.blink_off_collection) blink_off_container.removeChild(canvas);
        for (const canvas of render.blink_on_collection) blink_on_container.removeChild(canvas);
        for (const canvas of render.preview_collection) preview.removeChild(canvas);
    }
    render = new_render;
    document.getElementById("canvas_container").style.width = `${render.width}px`;
    document.getElementById("canvas_container").style.height = `${render.height}px`;
    for (const canvas of render.ice_color_collection) ice_color_container.appendChild(canvas);
    for (const canvas of render.blink_off_collection) blink_off_container.appendChild(canvas);
    for (const canvas of render.blink_on_collection) blink_on_container.appendChild(canvas);
    for (const canvas of render.preview_collection) preview.appendChild(canvas);
    show("view_frame");
    update_frame();
}

function update_with_mouse_pos(client_x, client_y) {
    const preview = document.getElementById("preview");
    const viewport = document.getElementById("viewport");
    const preview_rect = preview.getBoundingClientRect();
    const viewport_rect = viewport.getBoundingClientRect();
    const x = client_x - preview_rect.left - 20 + preview.scrollLeft;
    const y = client_y - preview_rect.top + preview.scrollTop;
    const scale_factor = render.width / 260;
    const half_view_width = viewport_rect.width / scale_factor / 2;
    const half_view_height = viewport_rect.height / scale_factor / 2;
    viewport.scrollLeft = Math.floor((x - half_view_width) * scale_factor);
    viewport.scrollTop = Math.floor((y - half_view_height) * scale_factor);
    update_frame();
}

function mouse_down(event) {
    if (event.button == 0) {
        mouse_button = true;
        update_with_mouse_pos(event.clientX, event.clientY);
    }
}

function mouse_move(event) {
    if (mouse_button) update_with_mouse_pos(event.clientX, event.clientY);
}

function unregister_button(event) {
    if (mouse_button) mouse_button = false;
}

function render_at(x, y, block) {
    libtextmode.render_at(render, x, y, block);
}

window.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("viewport").addEventListener("scroll", event => update_frame(), true);
    window.addEventListener("resize", event => update_frame(), true);
    document.getElementById("preview").addEventListener("mousedown", mouse_down, true);
    document.getElementById("preview").addEventListener("mousemove", mouse_move, true);
    preview.addEventListener("mouseup", unregister_button, true);
    preview.addEventListener("mouseout", unregister_button, true);
}, true);

function export_as_png({file, ice_colors}) {
    const base64_string = libtextmode.get_data_url(ice_colors ? render.ice_color_collection : render.blink_off_collection).split(";base64,").pop();
    fs.writeFileSync(file, base64_string, "base64");
}

module.exports = {cursor_modes, Cursor, add, start_blinking, stop_blinking, update_frame, export_as_png, render_at};
