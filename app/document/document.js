const electron = require("electron");
const libtextmode = require("../libtextmode/libtextmode");
const canvas = require("../document/canvas");
const palette = require("../document/palette");
const undo_history = require("../document/undo_history")(change_undo);
const toolbar = require("../document/toolbar");
const ui = require("../document/ui");
const chat = require("../document/chat");
const network = require("../document/network");
const keyboard = require("../document/keyboard");
const {ToolPreview} = require("../document/tool_preview");
const mouse = require("../document/mouse");
const path = require("path");
const hourly_saver = require("../hourly_saver");
let file = "Untitled";
let nick, group, doc, render, stored_blocks, tool_preview, connection;
let insert_mode = false;
let fg = 7;
let bg = 0;
const cursor = new canvas.Cursor();
const users = [];

function send_sync(channel, opts) {
    return electron.ipcRenderer.sendSync(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function change_undo(x, y) {
    render_at(x, y);
    if (connection) connection.draw(x, y, doc.data[doc.columns * y + x]);
}

undo_history.on("move_to", (x, y) => {
    if (cursor.mode == cursor.modes.EDITING) cursor.move_to(x, y);
});

function set_fg(value) {
    toolbar.set_fg_bg(value, bg);
    palette.set_fg(value);
    fg = value;
}

function set_bg(value) {
    toolbar.set_fg_bg(fg, value);
    palette.set_bg(value);
    bg = value;
}

async function start_render() {
    palette.add({palette: doc.palette, set_fg, set_bg});
    if (doc.data.length > 80 * 1000) {
        send_sync("show_rendering_modal");
        render = await libtextmode.render_split(doc);
        send("close_modal");
    } else {
        render = await libtextmode.render_split(doc);
    }
    ui.update_menu_checkboxes(insert_mode, doc);
    ui.update_status_bar(insert_mode, doc);
    canvas.add(render);
    toolbar.set_font(render.font);
    mouse.set_dimensions(doc.columns, doc.rows, render.font);
    set_fg(fg);
    set_bg(bg);
    if (doc.ice_colors) {
        canvas.stop_blinking();
    } else {
        canvas.start_blinking();
    }
    switch (cursor.mode) {
        case cursor.modes.EDITING:
        case cursor.modes.SELECTION:
            cursor.resize_to_font();
            break;
        case cursor.modes.OPERATION:
            if (stored_blocks.underneath) {
                draw_underneath_cursor();
            } else {
                cursor.update_cursor_with_blocks(stored_blocks);
            }
            break;
    }
}

function set_insert_mode(value) {
    insert_mode = value;
    ui.update_status_bar(insert_mode, doc);
}

function render_at(x, y) {
    canvas.render_at(x, y, doc.data[doc.columns * y + x]);
    if (cursor.x == x && cursor.y == y) cursor.draw();
    if (connection) {
        for (const id of Object.keys(users)) {
            if (id != connection.id && users[id].nick != undefined) {
                if (users[id].cursor.x == x && users[id].cursor.y == y) users[id].cursor.draw();
            }
        }
    }
}

function change_data(x, y, code, fg, bg, prev_cursor) {
    const i = doc.columns * y + x;
    if (prev_cursor) {
        undo_history.push(x, y, doc.data[i], {prev_x: prev_cursor.prev_x, prev_y: prev_cursor.prev_y, post_x: cursor.x, post_y: cursor.y});
    } else {
        undo_history.push(x, y, doc.data[i]);
    }
    doc.data[i] = {code, fg, bg};
    render_at(x, y);
    if (connection) connection.draw(x, y, doc.data[i]);
}

// Keyboard routines
function key_typed(code) {
    undo_history.start_chunk();
    if (insert_mode) {
        for (let x = doc.columns - 1; x > cursor.x; x--) {
            const block = doc.data[doc.columns * cursor.y + x - 1];
            change_data(x, cursor.y, block.code, block.fg, block.bg);
        }
    }
    const x = cursor.x;
    cursor.right();
    change_data(x, cursor.y, code, fg, bg, {prev_x: x, prev_y: cursor.y});
}

function f_key(value) {
    key_typed(toolbar.get_f_key(value));
}

keyboard.on("f_key", (value) => f_key(value));
keyboard.on("key_typed", (ascii) => key_typed(ascii));

keyboard.on("start_selection_if_necessary", () => {
    if (cursor.mode != cursor.modes.SELECTION) start_selection_mode();
});

keyboard.on("left", () => cursor.left());

keyboard.on("right", () => cursor.right());

keyboard.on("up", () => cursor.up());

keyboard.on("down", () => cursor.down());

keyboard.on("page_up", () => cursor.page_up());

keyboard.on("page_down", () => cursor.page_down());

keyboard.on("start_of_row", () => cursor.start_of_row());

keyboard.on("end_of_row", () => cursor.end_of_row());

keyboard.on("tab", () => cursor.tab());

keyboard.on("reverse_tab", () => cursor.reverse_tab());

keyboard.on("backspace", () => {
    if (cursor.x > 0) {
        undo_history.start_chunk();
        const x = cursor.x;
        cursor.left();
        change_data(x - 1, cursor.y, 32, 7, 0, {prev_x: x, prev_y: cursor.y});
    }
});

keyboard.on("delete_key", () => {
    undo_history.start_chunk();
    for (let x = cursor.x, i = cursor.index() + 1; x < doc.columns - 1; x++, i++) {
        const block = doc.data[i];
        change_data(x, cursor.y, block.code, block.fg, block.bg, {prev_x: cursor.x, prev_y: cursor.y});
    }
    change_data(doc.columns - 1, cursor.y, 32, 7, 0);
});

keyboard.on("insert", () => {
    set_insert_mode(!insert_mode);
    ui.update_menu_checkboxes(insert_mode, doc);
});

keyboard.on("toggle_fg", (num) => {
    if (fg == num || (fg >= 8 && fg != num + 8)) {
        set_fg(num + 8);
    } else {
        set_fg(num);
    }
});

keyboard.on("toggle_bg", (num) => {
    if (bg == num || (bg >= 8 && bg != num + 8)) {
        set_bg(num + 8);
    } else {
        set_bg(num);
    }
});

keyboard.on("chat", (text) => {
    if (connection) connection.chat(nick, group, text);
});

function start_selection_mode() {
    keyboard.prevent_typing = true;
    cursor.start_selection_mode();
}

function start_editing_mode() {
    keyboard.prevent_typing = false;
    if (cursor.hidden) cursor.show();
    cursor.start_editing_mode();
}

function stop_editing_mode() {
    keyboard.prevent_typing = true;
    if (!cursor.hidden) cursor.hide();
}

function line(x0, y0, x1, y1, skip_first = false) {
    const dx = Math.abs(x1 - x0);
    const sx = (x0 < x1) ? 1 : -1;
    const dy = Math.abs(y1 - y0);
    const sy = (y0 < y1) ? 1 : -1;
    let err = ((dx > dy) ? dx : -dy) / 2;
    let e2;
    const coords = [];
    while (true) {
        coords.push({x: x0, y: y0});
        if (x0 === x1 && y0 === y1) break;
        e2 = err;
        if (e2 > -dx) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dy) {
            err += dx;
            y0 += sy;
        }
    }
    if (skip_first && coords.length > 1) coords.shift();
    return coords;
}

function shading_block_brush(x, y, col, skip_first = false) {
    const coords = line(mouse.x, mouse.y, x, y, skip_first);
    for (const coord of coords) draw_shading_block(coord.x, coord.y, col);
}

function get_half_block(x, y) {
    const text_y = Math.floor(y / 2);
    const is_top = (y % 2 == 0);
    const block = doc.data[doc.columns * text_y + x];
    let upper_block_color = 0;
    let lower_block_color = 0;
    let left_block_color = 0;
    let right_block_color = 0;
    let is_blocky = false;
    let is_vertically_blocky = false;
    switch (block.code) {
    case 0: case 32: case 255: upper_block_color = block.bg; lower_block_color = block.bg; is_blocky = true; break;
    case 220: upper_block_color = block.bg; lower_block_color = block.fg; is_blocky = true; break;
    case 223: upper_block_color = block.fg; lower_block_color = block.bg; is_blocky = true; break;
    case 219: upper_block_color = block.fg; lower_block_color = block.fg; is_blocky = true; break;
    case 221: left_block_color = block.fg; right_block_color = block.bg; is_vertically_blocky = true; break;
    case 222: left_block_color = block.bg; right_block_color = block.fg; is_vertically_blocky = true; break;
    default:
        if (block.fg == block.bg) {
            is_blocky = true;
            upper_block_color = block.fg;
            lower_block_color = block.fg;
        } else {
            is_blocky = false;
        }
    }
    return {x, y, text_y, is_blocky, is_vertically_blocky, upper_block_color, lower_block_color, left_block_color, right_block_color, is_top, fg: block.fg, bg: block.bg};
}

function fill(x, y, col) {
    const block = get_half_block(x, y);
    if (block.is_blocky) {
        const target_color = block.is_top ? block.upper_block_color : block.lower_block_color;
        if (target_color == col) return;
        if (connection) {
            const choice = electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {type: "question", message: "Fill", detail: "Using fill whilst connected to a server is a potentially destructive operation. Are you sure?", buttons: ["Perform Fill", "Cancel"], defaultId: 1, cancelId: 1});
            if (choice == 1) return;
        }
        undo_history.start_chunk();
        const queue = [{to: {x, y}, from: {x, y}}];
        while (queue.length) {
            const coord = queue.pop();
            const block = get_half_block(coord.to.x, coord.to.y);
            if (block.is_blocky && ((block.is_top && block.upper_block_color == target_color) || (!block.is_top && block.lower_block_color == target_color))) {
                draw_half_block(coord.to.x, coord.to.y, col);
                if (coord.to.x > 0) queue.push({to: {x: coord.to.x - 1, y: coord.to.y}, from: Object.assign(coord.to)});
                if (coord.to.y > 0) queue.push({to: {x: coord.to.x, y: coord.to.y - 1}, from: Object.assign(coord.to)});
                if (coord.to.x < doc.columns - 1) queue.push({to: {x: coord.to.x + 1, y: coord.to.y}, from: Object.assign(coord.to)});
                if (coord.to.y < doc.rows * 2 - 1) queue.push({to: {x: coord.to.x, y: coord.to.y + 1}, from: Object.assign(coord.to)});
            } else if (block.is_vertically_blocky) {
                if (coord.from.y == coord.to.y - 1 && block.left_block_color == target_color) {
                    change_data(coord.to.x, block.text_y, 221, col, block.right_block_color);
                } else if (coord.from.y == coord.to.y - 1 && block.right_block_color == target_color) {
                    change_data(coord.to.x, block.text_y, 222, col, block.left_block_color);
                } else if (coord.from.y == coord.to.y + 1 && block.right_block_color == target_color) {
                    change_data(coord.to.x, block.text_y, 222, col, block.left_block_color);
                } else if (coord.from.y == coord.to.y + 1 && block.left_block_color == target_color) {
                    change_data(coord.to.x, block.text_y, 221, col, block.right_block_color);
                } else if (coord.from.x == coord.to.x - 1 && block.left_block_color == target_color) {
                    change_data(coord.to.x, block.text_y, 221, col, block.right_block_color);
                } else if (coord.from.x == coord.to.x + 1 && block.right_block_color == target_color) {
                    change_data(coord.to.x, block.text_y, 222, col, block.left_block_color);
                }
            }
        }
    }
}

function sample_half_block(x, y, set_fg_or_bg) {
    const block = get_half_block(x, y);
    if (mouse.button == mouse.buttons.LEFT) {
        if (block.is_blocky) {
            set_fg_or_bg(block.is_top ? block.upper_block_color : block.lower_block_color);
        } else {
            set_fg_or_bg(block.fg);
        }
    } else {
        if (block.is_blocky) {
            set_fg_or_bg(block.is_top ? block.upper_block_color : block.lower_block_color);
        } else {
            set_fg_or_bg(block.fg);
        }
    }
}

function optimize_block(x, y) {
    const i = y * doc.columns + x;
    const block = doc.data[i];
    if (block.bg >= 8 && block.fg < 8) {
        switch (block.code) {
        case 0: case 32: case 255: change_data(x, y, 219, block.bg, 0); break;
        case 219: change_data(x, y, 0, block.bg, block.fg); break;
        case 220: change_data(x, y, 223, block.bg, block.fg); break;
        case 223: change_data(x, y, 220, block.bg, block.fg); break;
        }
    }
    if (block.fg == 0) {
        if (block.bg == 0 || block.code == 219) {
            change_data(x, y, 32, 7, 0);
        } else {
            switch (block.code) {
                case 220: change_data(x, y, 223, block.bg, block.fg); break;
                case 223: change_data(x, y, 220, block.bg, block.fg); break;
            }
        }
    }
}

function draw_half_block(x, y, col) {
    const block_y = Math.floor(y / 2);
    const block = doc.data[block_y * doc.columns + x];
    const is_top = (y % 2 == 0);
    if (block.code == 219) {
        if (block.fg != col) {
            if (is_top) {
                change_data(x, block_y, 223, col, block.fg);
            } else {
                change_data(x, block_y, 220, col, block.fg);
            }
        }
    } else if (block.code != 220 && block.code != 223) {
        if (is_top) {
            change_data(x, block_y, 223, col, block.bg);
        } else {
            change_data(x, block_y, 220, col, block.bg);
        }
    } else {
        if (is_top) {
            if (block.code == 223) {
                if (block.bg == col) {
                    change_data(x, block_y, 219, col, 0);
                } else {
                    change_data(x, block_y, 223, col, block.bg);
                }
            } else if (block.fg == col) {
                change_data(x, block_y, 219, col, 0);
            } else {
                change_data(x, block_y, 223, col, block.fg);
            }
        } else {
            if (block.code == 220) {
                if (block.bg == col) {
                    change_data(x, block_y, 219, col, 0);
                } else {
                    change_data(x, block_y, 220, col, block.bg);
                }
            } else if (block.fg == col) {
                change_data(x, block_y, 219, col, 0);
            } else {
                change_data(x, block_y, 220, col, block.fg);
            }
        }
    }
    optimize_block(x, block_y);
}

mouse.on("down", ({x, y, half_y, button, shift_key, alt_key}) => {
    if (alt_key) {
        sample_half_block(x, half_y, (button == mouse.buttons.LEFT) ? set_fg : set_bg);
        return;
    }
    switch (ui.mode) {
        case ui.modes.SELECT:
            switch (cursor.mode) {
            case cursor.modes.EDITING:
                mouse.record_start();
                cursor.move_to(x, y);
                break;
            case cursor.modes.SELECTION:
                start_editing_mode();
                mouse.record_start();
                cursor.move_to(x, y);
                break;
            case cursor.modes.OPERATION:
                cursor.move_to(x, y);
                stamp(cursor.is_move_operation);
                start_editing_mode();
                break;
            }
            break;
        case ui.modes.BRUSH:
            undo_history.start_chunk();
            const half_block_mode = toolbar.is_in_half_block_mode();
            mouse.start_drawing(half_block_mode);
            if (half_block_mode) {
                if (shift_key) {
                    half_block_brush(x, half_y, 0);
                } else {
                    half_block_brush(x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
                }
            } else if (shift_key || toolbar.is_in_clear_block_mode()) {
                clear_block_brush(x, y);
            } else if (toolbar.is_in_shading_block_mode()) {
                shading_block_brush(x, y, (button == mouse.buttons.LEFT) ? fg : bg);
            } else if (toolbar.is_in_full_block_mode()) {
                full_block_brush(x, y, (button == mouse.buttons.LEFT) ? fg : bg);
            } else if (toolbar.is_in_colorize_mode()) {
                colorize_brush(x, y);
            }
            break;
        case ui.modes.LINE:
        case ui.modes.RECTANGLE:
            mouse.record_start(toolbar.is_in_half_block_mode());
            tool_preview = new ToolPreview();
            break;
        case ui.modes.FILL:
            fill(x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
            break;
        case ui.modes.SAMPLE:
            const block = doc.data[doc.columns * y + x];
            set_fg(block.fg);
            set_bg(block.bg);
            ui.change_to_previous_mode();
            break;
    }
});

mouse.on("to", ({x, y, half_y, button}) => {
    switch (ui.mode) {
    case ui.modes.SELECT:
        switch (cursor.mode) {
        case cursor.modes.EDITING:
            start_selection_mode();
            cursor.move_to(x, y);
            break;
        case cursor.modes.SELECTION:
            cursor.move_to(x, y);
            break;
        }
        break;
    case ui.modes.LINE:
        if (toolbar.is_in_half_block_mode()) {
            draw_line_preview_half_block(x, half_y, (mouse.button == mouse.buttons.LEFT) ? fg : bg);
        } else if (toolbar.is_in_clear_block_mode()) {
            draw_line_preview(x, y, 0);
        } else {
            draw_line_preview(x, y, (mouse.button == mouse.buttons.LEFT) ? fg : bg);
        }
        break;
    case ui.modes.RECTANGLE:
        if (toolbar.is_in_half_block_mode()) {
            draw_half_block_rectangle_preview(x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
        } else if (toolbar.is_in_clear_block_mode()) {
            draw_rectangle_preview(x, y, 0);
        } else {
            draw_rectangle_preview(x, y, (button == mouse.buttons.LEFT) ? fg : bg);
        }
        break;
    }
});

function half_block_brush(x, y, col, skip_first = false) {
    const coords = line(mouse.x, mouse.half_y, x, y, skip_first);
    for (const coord of coords) draw_half_block(coord.x, coord.y, col);
}

function colorize_brush(x, y, skip_first = false) {
    const coords = line(mouse.x, mouse.y, x, y, skip_first);
    for (const coord of coords) {
        const block = doc.data[coord.y * doc.columns + coord.x];
        change_data(coord.x, coord.y, block.code, toolbar.is_in_colorize_fg_mode() ? fg : block.fg, toolbar.is_in_colorize_bg_mode() ? bg : block.bg);
    }
}

function clear_block_brush(x, y, skip_first = false) {
    const coords = line(mouse.x, mouse.y, x, y, skip_first);
    for (const coord of coords) change_data(coord.x, coord.y, 32, 7, 0);
}

function full_block_brush(x, y, col, skip_first = false) {
    const coords = line(mouse.x, mouse.y, x, y, skip_first);
    for (const coord of coords) change_data(coord.x, coord.y, 219, col, 0);
}

function draw_shading_block(x, y, col) {
    const block = doc.data[y * doc.columns + x];
    switch (block.code) {
        case 219:
            if (block.fg != col) change_data(x, y, 176, col, block.fg);
            break;
        case 178: change_data(x, y, 219, col, block.bg); break;
        case 177: change_data(x, y, 178, col, block.bg); break;
        case 176: change_data(x, y, 177, col, block.bg); break;
        default: change_data(x, y, 176, col, block.bg); break;
    }
}

mouse.on("draw", ({x, y, half_y, button, shift_key}) => {
    switch (ui.mode) {
        case ui.modes.BRUSH:
            if (toolbar.is_in_half_block_mode()) {
                if (shift_key) {
                    half_block_brush(x, half_y, 0, true);
                } else {
                    half_block_brush(x, half_y, (button == mouse.buttons.LEFT) ? fg : bg, true);
                }
            } else if (shift_key || toolbar.is_in_clear_block_mode()) {
                clear_block_brush(x, y);
            } else if (toolbar.is_in_shading_block_mode()) {
                shading_block_brush(x, y, (button == mouse.buttons.LEFT) ? fg : bg, true);
            } else if (toolbar.is_in_full_block_mode()) {
                full_block_brush(x, y, (button == mouse.buttons.LEFT) ? fg : bg, true);
            } else if (toolbar.is_in_colorize_mode()) {
                colorize_brush(x, y, true);
            }
            break;
    }
});

mouse.on("move", ({x, y, half_y}) => {
    switch (ui.mode) {
        case ui.modes.SELECT:
            if (cursor.mode == cursor.modes.OPERATION) cursor.move_to(x, y);
            break;
        case ui.modes.FILL:
        case ui.modes.SAMPLE:
            toolbar.set_sample(doc.data[doc.columns * y + x]);
            break;
    }
});

mouse.on("up", ({x, y, half_y, button}) => {
    switch (ui.mode) {
        case ui.modes.LINE:
            tool_preview.destroy();
            undo_history.start_chunk();
            if (toolbar.is_in_half_block_mode()) {
                half_block_brush(x, half_y, (button == mouse.buttons.LEFT) ? fg : bg);
            } else if (toolbar.is_in_full_block_mode()) {
                full_block_brush(x, y, (button == mouse.buttons.LEFT) ? fg : bg);
            } else if (toolbar.is_in_shading_block_mode()) {
                shading_block_brush(x, y, (button == mouse.buttons.LEFT) ? fg : bg);
            } else if (toolbar.is_in_clear_block_mode()) {
                clear_block_brush(x, y);
            } else if (toolbar.is_in_colorize_mode()) {
                colorize_brush(x, y);
            }
            break;
        case ui.modes.RECTANGLE:
            tool_preview.destroy();
            if (toolbar.is_in_half_block_mode()) {
                draw_half_block_rectangle(x, toolbar.is_in_half_block_mode() ? half_y : y, (button == mouse.buttons.LEFT) ? fg : bg);
            } else {
                draw_rectangle(x, toolbar.is_in_half_block_mode() ? half_y : y, (button == mouse.buttons.LEFT) ? fg : bg);
            }
            break;
    }
});

function draw_line_preview_half_block(x, y, col) {
    if (x != mouse.x || y != mouse.half_y) {
        const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
        const [sy, dy] = (mouse.start.half_y < y) ? [mouse.start.half_y, y] : [y, mouse.start.half_y];
        tool_preview.update(sx * render.font.width, Math.floor(sy * render.font.height / 2), (dx - sx + 1) * render.font.width, Math.ceil((dy - sy + 1) * render.font.height / 2));
        tool_preview.fill_style(render.font, col);
        const coords = line(mouse.start.x, mouse.start.half_y, x, y);
        for (const coord of coords) {
            const odd_y = (coord.y % 2);
            tool_preview.fill_rect((coord.x - sx) * render.font.width, Math.floor((coord.y - sy) * render.font.height / 2) - (odd_y ? 1 : 0), render.font.width, Math.floor(render.font.height / 2) + (odd_y ? 1 : -1));
        }
    }
}

function draw_line_preview(x, y, col) {
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.y < y) ? [mouse.start.y, y] : [y, mouse.start.y];
    tool_preview.update(sx * render.font.width, sy * render.font.height, (dx - sx + 1) * render.font.width, (dy - sy + 1) * render.font.height);
    tool_preview.fill_style(render.font, col);
    const coords = line(mouse.start.x, mouse.start.y, x, y);
    for (const coord of coords) tool_preview.fill_rect((coord.x - sx) * render.font.width, (coord.y - sy) * render.font.height, render.font.width, render.font.height);
}

function draw_rectangle_preview(x, y, col) {
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.y < y) ? [mouse.start.y, y] : [y, mouse.start.y];
    tool_preview.update(sx * render.font.width, sy * render.font.height, (dx - sx + 1) * render.font.width, (dy - sy + 1) * render.font.height);
    tool_preview.background_color(render.font, col);
}

function draw_half_block_rectangle_preview(x, y, col) {
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.half_y < y) ? [mouse.start.half_y, y] : [y, mouse.start.half_y];
    tool_preview.update(sx * render.font.width, Math.floor(sy * render.font.height / 2), (dx - sx + 1) * render.font.width, Math.ceil((dy - sy + 1) * render.font.height / 2));
    tool_preview.background_color(render.font, col);
}

function draw_half_block_rectangle(x, y, col) {
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.half_y < y) ? [mouse.start.half_y, y] : [y, mouse.start.half_y];
    undo_history.start_chunk();
    for (let y = sy; y <= dy; y++) {
        const coords = line(sx, y, dx, y);
        for (const coord of coords) draw_half_block(coord.x, coord.y, col);
    }
}

function draw_rectangle(x, y, col) {
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.y < y) ? [mouse.start.y, y] : [y, mouse.start.y];
    undo_history.start_chunk();
    if (toolbar.is_in_full_block_mode()) {
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                change_data(x, y, 219, col, 0);
            }
        }
    } else if (toolbar.is_in_shading_block_mode()) {
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                draw_shading_block(x, y, col);
            }
        }
    } else if (toolbar.is_in_clear_block_mode()) {
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                change_data(x, y, 0, 7, 0);
            }
        }
    } else if (toolbar.is_in_colorize_mode()) {
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                const block = doc.data[doc.columns * y + x];
                change_data(x, y, block.code, toolbar.is_in_colorize_fg_mode() ? fg : block.fg, toolbar.is_in_colorize_bg_mode() ? bg : block.bg);
            }
        }
    }
}

ui.on("start_editing_mode", start_editing_mode);
ui.on("stop_editing_mode", stop_editing_mode);
ui.on("update_frame", canvas.update_frame);

function draw_underneath_cursor() {
    cursor.update_cursor_with_blocks(libtextmode.merge_blocks(stored_blocks, cursor.get_blocks_in_operation(doc.data)));
}

cursor.on("move", () => {
    if (stored_blocks && stored_blocks.underneath) draw_underneath_cursor();
});

cursor.on("end_operation", () => {
    if (stored_blocks) stored_blocks = undefined;
});

ui.on("ice_colors_toggle", () => ice_colors(!doc.ice_colors));

// MenuList - File

async function change_doc(new_doc) {
    doc = new_doc;
    undo_history.reset_undos();
    await start_render();
    start_editing_mode();
    ui.change_mode(ui.modes.SELECT);
}

electron.ipcRenderer.on("new_document", (event, {columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data}) => {
    change_doc(libtextmode.new_document({columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data}));
});

electron.ipcRenderer.on("open_file", async (event, {file: new_file}) => {
    file = new_file;
    change_doc(await libtextmode.read_file(file));
});

electron.ipcRenderer.on("get_sauce_info", (event) => {
    send("get_sauce_info", {title: doc.title, author: doc.author, group: doc.group, comments: doc.comments});
});

electron.ipcRenderer.on("set_sauce_info", (event, {title, author, group, comments}) => {
    doc.title = title;
    doc.author = author;
    doc.group = group;
    doc.comments = comments;
    if (connection) {
        connection.sauce(title, author, group, comments);
        chat.updated_sauce(connection.id);
    }
});

electron.ipcRenderer.on("save", (event, {file: save_file, close_on_save}) => {
    file = save_file;
    libtextmode.write_file(doc, file);
    if (close_on_save) send("destroy");
});

hourly_saver.on("save", () => {
    if (!connection) {
        const parsed_file = path.parse(file);
        const backup_file = hourly_saver.filename(`${parsed_file.base}${parsed_file.ext || ".ans"}`);
        if (backup_file) {
            libtextmode.write_file(doc, backup_file);
            hourly_saver.keep_if_changes(backup_file);
        }
    }
});

electron.ipcRenderer.on("export_as_png", (event) => {
    electron.remote.dialog.showSaveDialog(electron.remote.getCurrentWindow(), {filters: [{name: "Portable Network Graphics ", extensions: ["png"]}], defaultPath: `${path.parse(file).name}.png`}, (file) => {
        if (file) canvas.export_as_png({file, ice_colors: doc.ice_colors});
    });
});

electron.ipcRenderer.on("export_as_utf8", (event, opts) => {
    electron.remote.dialog.showSaveDialog(electron.remote.getCurrentWindow(), {filters: [{name: "ANSI Art ", extensions: ["utf8ans"]}], defaultPath: `${path.parse(file).name}.utf8ans`}, (file) => {
        if (file) libtextmode.write_file(doc, file, {utf8: true});
    });
});

// MenuList - Edit

electron.ipcRenderer.on("undo", (event) => undo_history.undo(doc));
electron.ipcRenderer.on("redo", (event) => undo_history.redo(doc));
electron.ipcRenderer.on("insert_mode", (event, value) => set_insert_mode(value));

function clear_blocks({sx, sy, dx, dy}) {
    undo_history.start_chunk();
    for (let y = sy; y <= dy; y++) {
        for (let x = sx; x <= dx; x++) {
            change_data(x, y, 32, 7, 0);
        }
    }
}

electron.ipcRenderer.on("cut", (event) => {
    if (keyboard.in_chat) return;
    if (cursor.mode == cursor.modes.SELECTION) {
        const selection = cursor.reorientate_selection();
        copy();
        clear_blocks(selection);
    }
});

function copy() {
    if (keyboard.in_chat) return;
    if (cursor.mode == cursor.modes.SELECTION) {
        stored_blocks = cursor.get_blocks_in_selection(doc.data);
        const text = [];
        for (let y = 0, i = 0; y < stored_blocks.rows; y++) {
            text.push("");
            for (let x = 0; x < stored_blocks.columns; x++, i++) {
                text[text.length - 1] += libtextmode.cp437_to_unicode(stored_blocks.data[i].code);
            }
        }
        electron.clipboard.write({text: text.join("\n"), html: JSON.stringify(stored_blocks)});
        start_editing_mode();
    }
}

electron.ipcRenderer.on("copy", (event) => copy());

electron.ipcRenderer.on("paste", (event) => {
    if (keyboard.in_chat) return;
    try {
        const blocks = JSON.parse(electron.clipboard.readHTML().replace("<meta charset='utf-8'>", ""));
        if (blocks.columns && blocks.rows && (blocks.data.length == blocks.columns * blocks.rows)) {
            if (cursor.mode != cursor.modes.EDITING) start_editing_mode();
            undo_history.start_chunk();
            for (let y = 0; y + cursor.y < doc.rows && y < blocks.rows; y++) {
                for (let x = 0; x + cursor.x < doc.columns && x < blocks.columns; x++) {
                    const block = blocks.data[blocks.columns * y + x];
                    change_data(cursor.x + x, cursor.y + y, block.code, block.fg, block.bg);
                }
            }
        } else {
            throw("catch!");
        }
    } catch (err) {
        const text = electron.clipboard.readText();
        if (text.length) {
            if (cursor.mode != cursor.modes.EDITING) start_editing_mode();
            undo_history.start_chunk();
            const lines = text.split("\n");
            if (lines.length) {
                for (let y = cursor.y, line_y = 0; y < doc.rows && line_y < lines.length; y++, line_y++) {
                    for (let x = cursor.x, line_x = 0; x < doc.columns && line_x < lines[line_y].length; x++, line_x++) {
                        change_data(x, y, libtextmode.unicode_to_cp437(lines[line_y].charCodeAt(line_x)), fg, bg);
                    }
                }
            }
        }
    }
});

function count_left(y) {
    for (let x = 0; x < doc.columns; x++) {
        const half_block = get_half_block(x, y * 2);
        if (!half_block.is_blocky || half_block.lower_block_color != 0 || half_block.lower_block_color != 0) return x;
    }
    return 0;
}

function count_right(y) {
    for (let x = 0; x < doc.columns; x++) {
        const half_block = get_half_block(doc.columns - 1 - x, y * 2);
        if (!half_block.is_blocky || half_block.lower_block_color != 0 || half_block.lower_block_color != 0) return x;
    }
    return 0;
}

electron.ipcRenderer.on("left_justify_line", (event) => {
    const count = count_left(cursor.y);
    if (count) {
        undo_history.start_chunk();
        for (let x = 0; x < doc.columns - count; x++) {
            const block = doc.data[cursor.y * doc.columns + x + count];
            change_data(x, cursor.y, block.code, block.fg, block.bg);
        }
        for (let x = doc.columns - count; x < doc.columns; x++) change_data(x, cursor.y, 32, 7, 0);
    }
});

electron.ipcRenderer.on("right_justify_line", (event) => {
    const count = count_right(cursor.y);
    if (count) {
        undo_history.start_chunk();
        for (let x = doc.columns - 1; x > count - 1; x--) {
            const block = doc.data[cursor.y * doc.columns + x - count];
            change_data(x, cursor.y, block.code, block.fg, 0);
        }
        for (let x = count - 1; x >= 0; x--) change_data(x, cursor.y, 32, 7, 0);
    }
});

electron.ipcRenderer.on("center_line", (event) => {
    const left = count_left(cursor.y);
    const right = count_right(cursor.y);
    if (left || right) {
        undo_history.start_chunk();
        const blocks = new Array(doc.columns - right - left);
        for (let i = 0; i < blocks.length; i++) blocks[i] = Object.assign(doc.data[cursor.y * doc.columns + left + i]);
        const new_left = Math.floor((left + right) / 2);
        for (let x = 0; x < new_left; x++) change_data(x, cursor.y, 32, 7, 0);
        for (let x = 0; x < blocks.length; x++) change_data(new_left + x, cursor.y, blocks[x].code, blocks[x].fg, blocks[x].bg);
        for (let x = 0; x < doc.columns - new_left - blocks.length; x++) change_data(new_left + blocks.length + x, cursor.y, 32, 7, 0);
    }
});

electron.ipcRenderer.on("erase_line", (event) => {
    undo_history.start_chunk();
    for (let x = 0; x < doc.columns; x++) change_data(x, cursor.y, 32, 7, 0);
});

function select_all() {
    if (keyboard.in_chat) return;
    if (ui.mode != ui.modes.SELECT) ui.change_mode(ui.modes.SELECT);
    start_editing_mode();
    cursor.move_to(0, 0, true);
    start_selection_mode();
    cursor.move_to(doc.columns - 1, doc.rows - 1);
}

electron.ipcRenderer.on("select_all", (event) => select_all());

keyboard.on("select_all", select_all);

function deselect() {
    if (keyboard.in_chat) return;
    if (cursor.mode != cursor.modes.EDITING) {
        if (cursor.mode == cursor.modes.OPERATION) {
            if (cursor.is_move_operation) undo_history.undo(doc);
        }
        start_editing_mode();
    }
}

electron.ipcRenderer.on("deselect", (event) => deselect());

electron.ipcRenderer.on("move_block", (event) => {
    if (keyboard.in_chat) return;
    if (cursor.mode == cursor.modes.SELECTION) {
        const selection = cursor.reorientate_selection();
        stored_blocks = cursor.start_operation_mode(doc.data, true);
        clear_blocks(selection);
    }
});

electron.ipcRenderer.on("copy_block", (event) => {
    if (keyboard.in_chat) return;
    if (cursor.mode == cursor.modes.SELECTION) stored_blocks = cursor.start_operation_mode(doc.data);
});

electron.ipcRenderer.on("delete_selection", (event, opts) => {
    if (cursor.mode == cursor.modes.SELECTION) {
        clear_blocks(cursor.reorientate_selection());
        start_editing_mode();
    }
});

function stamp(single_undo = false) {
    if (keyboard.in_chat) return;
    if (!single_undo) undo_history.start_chunk();
    const blocks = stored_blocks.underneath ? libtextmode.merge_blocks(stored_blocks, cursor.get_blocks_in_operation(doc.data)) : stored_blocks;
    for (let y = 0; y + cursor.y < doc.rows && y < blocks.rows; y++) {
        for (let x = 0; x + cursor.x < doc.columns && x < blocks.columns; x++) {
            const block = blocks.data[y * blocks.columns + x];
            if (!blocks.transparent || block.code != 32 || block.bg != 0) change_data(cursor.x + x, cursor.y + y, block.code, block.fg, block.bg);
        }
    }
}

electron.ipcRenderer.on("stamp", (event) => stamp());

function place() {
    stamp(cursor.is_move_operation);
    start_editing_mode();
}

keyboard.on("enter", () => {
    switch (cursor.mode) {
        case cursor.modes.EDITING: cursor.new_line(); return;
        case cursor.modes.OPERATION: place(); return;
    }
});

electron.ipcRenderer.on("rotate", (event) => {
    if (keyboard.in_chat) return;
    cursor.update_cursor_with_blocks(libtextmode.rotate(stored_blocks));
});

electron.ipcRenderer.on("flip_x", (event) => {
    if (keyboard.in_chat) return;
    cursor.update_cursor_with_blocks(libtextmode.flip_x(stored_blocks));
});

electron.ipcRenderer.on("flip_y", (event) => {
    if (keyboard.in_chat) return;
    cursor.update_cursor_with_blocks(libtextmode.flip_y(stored_blocks));
});

electron.ipcRenderer.on("center", (event) => {
    if (keyboard.in_chat) return;
    cursor.move_to(Math.max(Math.floor((doc.columns - stored_blocks.columns) / 2), 0), cursor.y);
});

electron.ipcRenderer.on("transparent", (event, value) => {
    if (keyboard.in_chat) return;
    if (value) {
        if (stored_blocks.underneath) {
            stored_blocks.underneath = false;
            send("uncheck_underneath");
        } else {
            send("uncheck_over");
        }
    } else {
        send("uncheck_underneath");
        send("check_over");
    }
    stored_blocks.transparent = value;
    cursor.update_cursor_with_blocks(stored_blocks);
});

electron.ipcRenderer.on("over", (event, value) => {
    if (keyboard.in_chat) return;
    if (value) {
        if (stored_blocks.transparent) {
            stored_blocks.transparent = false;
            send("uncheck_transparent");
        }
        if (stored_blocks.underneath) {
            stored_blocks.underneath = false;
            send("uncheck_underneath");
        }
    } else {
        send("check_underneath");
    }
    stored_blocks.underneath = !value;
    if (value) {
        cursor.update_cursor_with_blocks(stored_blocks);
    } else {
        draw_underneath_cursor();
    }
});

electron.ipcRenderer.on("underneath", (event, value) => {
    if (keyboard.in_chat) return;
    if (value) {
        if (stored_blocks.transparent) {
            stored_blocks.transparent = false;
            send("uncheck_transparent");
        }
        if (!stored_blocks.underneath) {
            stored_blocks.underneath = false;
            send("uncheck_over");
        }
    } else {
        send("check_over");
    }
    stored_blocks.underneath = value;
    if (value) {
        draw_underneath_cursor();
    } else {
        cursor.update_cursor_with_blocks(stored_blocks);
    }
});

function get_canvas_size() {
    send("get_canvas_size", {columns: doc.columns, rows: doc.rows});
}

electron.ipcRenderer.on("get_canvas_size", (event) => get_canvas_size());

ui.on("get_canvas_size", () => get_canvas_size());

function set_canvas_size(columns, rows) {
    if (columns != doc.columns | rows != doc.rows) {
        if (connection) connection.set_canvas_size(columns, rows);
        undo_history.reset_undos();
        libtextmode.resize_canvas(doc, columns, rows);
        start_editing_mode();
        cursor.move_to(Math.min(cursor.x, columns - 1), Math.min(cursor.y, rows - 1), true);
        start_render();
    }
}

electron.ipcRenderer.on("set_canvas_size", (event, {columns, rows}) => set_canvas_size(columns, rows));

electron.ipcRenderer.on("crop", (event) => {
    const blocks = (cursor.mode == cursor.modes.SELECTION) ? cursor.get_blocks_in_selection(doc.data) : stored_blocks;
    send("new_document", {title: doc.title, author: doc.author, group: doc.group, date: doc.date, palette: doc.palette, font_name: doc.font_name, use_9px_font: doc.use_9px_font, ice_colors: doc.ice_colors, ...blocks});
    deselect();
});

electron.ipcRenderer.on("previous_foreground_color", (event) => set_fg(fg == 0 ? 15 : fg - 1));
electron.ipcRenderer.on("next_foreground_color", (event) => set_fg(fg == 15 ? 0 : fg + 1));

electron.ipcRenderer.on("previous_background_color", (event) => set_bg(bg == 0 ? 15 : bg - 1));
electron.ipcRenderer.on("next_background_color", (event) => set_bg(bg == 15 ? 0 : bg + 1));

electron.ipcRenderer.on("use_attribute_under_cursor", (event) => {
    const i = cursor.index();
    set_fg(doc.data[i].fg);
    set_bg(doc.data[i].bg);
});

electron.ipcRenderer.on("default_color", (event) => {
    set_fg(7);
    set_bg(0);
});

electron.ipcRenderer.on("switch_foreground_background", (event) => {
    const tmp = fg;
    set_fg(bg);
    set_bg(tmp);
});

function ice_colors(value) {
    doc.ice_colors = value;
    if (connection) connection.ice_colors(doc.ice_colors);
    if (value) {
        canvas.stop_blinking();
    } else {
        canvas.start_blinking();
    }
    ui.update_status_bar(insert_mode, doc);
    ui.update_menu_checkboxes(insert_mode, doc);
}

electron.ipcRenderer.on("ice_colors", (event, value) => ice_colors(value));

function use_9px_font(value) {
    if (connection) connection.use_9px_font(value);
    doc.use_9px_font = value;
    start_render();
}

electron.ipcRenderer.on("use_9px_font", (event, value) => use_9px_font(value));

ui.on("use_9px_font_toggle", () => use_9px_font(!doc.use_9px_font));

function change_font(font_name) {
    if (connection) connection.change_font(font_name);
    doc.font_name = font_name;
    if (doc.font_bytes) delete doc.font_bytes;
    start_render();
}

electron.ipcRenderer.on("change_font", (event, font_name) => change_font(font_name));

function goto_line(line_no) {
    if (line_no > 0 && line_no < doc.rows + 1) cursor.move_to(cursor.x, line_no - 1, true);
}

function connect_to_server({server, pass = ""} = {}) {
    send_sync("show_connecting_modal");
    network.connect(server, (nick == "") ? "Anonymous" : nick, group, pass, {
        connected: (new_connection, new_doc, chat_history, status) => {
            connection = new_connection;
            cursor.connection = connection;
            doc = new_doc;
            send("close_modal");
            start_render().then(() => {
                start_editing_mode();
                ui.change_mode(ui.modes.SELECT);
                for (const user of connection.users) {
                    users[user.id] = {nick: user.nick, group: user.group};
                    if (user.nick == undefined) {
                        chat.join(user.id, "Guest", "", user.status, false);
                    } else {
                        users[user.id].cursor = new canvas.Cursor(false);
                        users[user.id].cursor.resize_to_font();
                        users[user.id].cursor.appear_ghosted();
                        users[user.id].cursor.show();
                        chat.join(user.id, user.nick, user.group, user.status, false);
                    }
                }
                chat.show();
                send("enable_chat_window_toggle");
                for (const line of chat_history) chat.chat(line.id, line.nick, line.group, line.text, goto_line);
                chat.join(connection.id, nick, group, status);
                network.ready_to_receive_events();
                if (doc.comments) chat.welcome(doc.comments.split("\n")[0].replace(/ +$/, ""), goto_line);
            });
        },
        error: () => {},
        disconnected: () => {
            send("close_modal");
            chat.clear_users();
            for (const id of Object.keys(users)) {
                if (users[id].cursor) users[id].cursor.hide();
                delete users[id];
            }
            chat.disconnected();
            const choice = electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {message: "Connect to Server", detail: "Cannot connect to server.", buttons: ["Retry", "Cancel"], defaultId: 0, cancelId: 1});
            if (choice == 0) {
                connect_to_server({server, pass});
            } else {
                send_sync("destroy");
            }
        },
        refused: () => {
            send("close_modal");
            electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {type: "error", message: "Connect to Server", detail: "Wrong password!"});
            send("destroy");
        },
        join: (id, nick, group, status) => {
            users[id] = {nick, group, status};
            if (nick != undefined) {
                users[id].cursor = new canvas.Cursor(false);
                users[id].cursor.resize_to_font();
                users[id].cursor.appear_ghosted();
                users[id].cursor.show();
                chat.join(id, users[id].nick, users[id].group, users[id].status);
                if (process.platform == "darwin") electron.remote.app.dock.bounce("informational");
            } else {
                chat.join(id, "Guest", "", users[id].status, false);
            }
        },
        leave: (id) => {
            if (users[id]) {
                if (users[id].nick != undefined) users[id].cursor.hide();
                chat.leave(id, users[id].nick != undefined);
                delete users[id];
            }
        },
        cursor: (id, x, y) => {
            if (users[id]) {
                if (users[id].cursor.hidden) users[id].cursor.show();
                if (users[id].cursor.mode != cursor.modes.EDITING) users[id].cursor.stop_using_selection_border();
                users[id].cursor.move_to(x, y, false);
            }
        },
        selection: (id, x, y) => {
            if (users[id]) {
                if (users[id].cursor.mode != cursor.modes.SELECTION) users[id].cursor.start_using_selection_border();
                users[id].cursor.move_to(x, y, false);
            }
        },
        resize_selection: (id, columns, rows) => {
            if (users[id]) users[id].cursor.resize_selection(columns, rows);
        },
        operation: (id, x, y) => {
            if (users[id]) {
                if (users[id].cursor.mode != cursor.modes.OPERATION) users[id].cursor.mode = cursor.modes.OPERATION;
                users[id].cursor.move_to(x, y, false);
            }
        },
        hide_cursor: (id) => {
            if (users[id]) users[id].cursor.hide();
        },
        draw: (id, x, y, block) => {
            if ((x < doc.columns) && (y < doc.rows)) {
                const i = doc.columns * y + x;
                doc.data[i] = Object.assign(block);
                render_at(x, y);
            }
        },
        chat: (id, nick, group, text) => {
            chat.chat(id, nick, group, text, goto_line);
        },
        status: (id, status) => {
            chat.status(id, status);
        },
        sauce: (id, title, author, group, comments) => {
            doc.title = title;
            doc.author = author;
            doc.group = group;
            doc.comments = comments;
            send("update_sauce", {title, author, group, comments});
            chat.updated_sauce(id);
        },
        ice_colors: (id, value) => {
            doc.ice_colors = value;
            if (doc.ice_colors) {
                canvas.stop_blinking();
            } else {
                canvas.start_blinking();
            }
            ui.update_status_bar(insert_mode, doc);
            ui.update_menu_checkboxes(insert_mode, doc);
            chat.changed_ice_colors(id, doc.ice_colors);
        },
        use_9px_font: (id, value) => {
            doc.use_9px_font = value;
            start_render();
            chat.changed_use_9px_font(id, doc.use_9px_font);
        },
        change_font: (id, font_name) => {
            doc.font_name = font_name;
            start_render();
            chat.changed_font(id, doc.font_name);
        },
        set_canvas_size: (id, columns, rows) => {
            undo_history.reset_undos();
            libtextmode.resize_canvas(doc, columns, rows);
            cursor.move_to(Math.min(cursor.x, columns - 1), Math.min(cursor.y, rows - 1), true);
            start_render();
            chat.set_canvas_size(id, columns, rows);
        }
    });
}

electron.ipcRenderer.on("connect_to_server", (event, opts) => connect_to_server(opts));

// Touchbars
electron.ipcRenderer.on("f_key", (event, value) => f_key(value));
electron.ipcRenderer.on("place", (event) => place());

// Prefs
electron.ipcRenderer.on("nick", (event, value) => nick = value);
electron.ipcRenderer.on("group", (event, value) => group = value);
electron.ipcRenderer.on("use_backup", (event, value) => {
    if (value) {
        hourly_saver.start();
    } else {
        hourly_saver.stop();
    }
});
electron.ipcRenderer.on("backup_folder", (event, backup_folder) => hourly_saver.backup_folder = backup_folder);
