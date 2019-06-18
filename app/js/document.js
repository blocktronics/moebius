const electron = require("electron");
const libtextmode = require("../js/libtextmode/libtextmode");
const canvas = require("../js/canvas.js");
const palette = require("../js/palette");
const toolbar = require("../js/toolbar");
const chat = require("../js/chat");
const network = require("../js/network");
const path = require("path");
const hourly_saver = require("../hourly_saver");
let file = "Untitled";
let nick, group, use_numpad, backup_folder;
let doc, render;
let insert_mode = false;
let fg = 7;
let bg = 0;
const cursor = new canvas.Cursor();
let stored_blocks;
let undo_buffer = [];
let redo_buffer = [];
const mouse_button_types = {NONE: 0, LEFT: 1, RIGHT: 2};
let preview_canvas;
const mouse = {x: 0, y: 0, button: mouse_button_types.NONE, start: {x: 0, y: 0}, drawing: false};
const editor_modes = {SELECT: 0, BRUSH: 1, LINE: 2, RECTANGLE: 3, FILL: 4, SAMPLE: 5};
let mode;
let previous_mode;
let connection;
const users = [];
const darwin = (process.platform == "darwin");

function send_sync(channel, opts) {
    return electron.ipcRenderer.sendSync(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function reset_redo_buffer() {
    redo_buffer = [];
    send("disable_redo");
}

function reset_undo_buffer() {
    undo_buffer = [];
    send("disable_undo");
    reset_redo_buffer();
}

function update_menu_checkboxes() {
    send("update_menu_checkboxes", {insert_mode, use_9px_font: doc.use_9px_font, ice_colors: doc.ice_colors, actual_size: electron.remote.getCurrentWebContents().getZoomFactor() == 1, font_name: doc.font_name});
}

function update_status_bar() {
    document.getElementById("use_9px_font").textContent = doc.use_9px_font ? "On" : "Off";
    document.getElementById("ice_colors").textContent = doc.ice_colors ? "On" : "Off";
    document.getElementById("columns").textContent = `${doc.columns}`;
    document.getElementById("rows").textContent = `${doc.rows}`;
    document.getElementById("font_name").textContent = `${doc.font_name}`;
    document.getElementById("insert_mode").textContent = insert_mode ? "Ins" : "";
}

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
    update_menu_checkboxes();
    update_status_bar();
    canvas.add(render);
    toolbar.set_font(render.font);
    set_fg(fg);
    set_bg(bg);
    if (doc.ice_colors) {
        canvas.stop_blinking();
    } else {
        canvas.start_blinking();
    }
    cursor.resize_to_font();
}

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
                cursor.start_editing_mode();
                change_to_select_mode();
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
            const choice = electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {message: "Connect to Server", detail: "Cannot connect to server.", buttons: ["Retry", "Cancel"], defaultId: 0, cancelId: 1});
            if (choice == 0) {
                chat.clear();
                connect_to_server({server, pass});
            } else {
                send("destroy");
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
                if (darwin) electron.remote.app.dock.bounce("informational");
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
                if (users[id].cursor.mode != canvas.cursor_modes.EDITING) users[id].cursor.stop_using_selection_border();
                users[id].cursor.move_to(x, y, false);
            }
        },
        selection: (id, x, y) => {
            if (users[id]) {
                if (users[id].cursor.mode != canvas.cursor_modes.SELECTION) users[id].cursor.start_using_selection_border();
                users[id].cursor.move_to(x, y, false);
            }
        },
        resize_selection: (id, columns, rows) => {
            if (users[id]) users[id].cursor.resize_selection(columns, rows);
        },
        operation: (id, x, y) => {
            if (users[id]) {
                if (users[id].cursor.mode != canvas.cursor_modes.OPERATION) users[id].cursor.mode = canvas.cursor_modes.OPERATION;
                users[id].cursor.move_to(x, y, false);
            }
        },
        hide_cursor: (id) => {
            if (users[id]) users[id].cursor.hide();
        },
        draw: (id, x, y, block) => {
            if ((x < doc.columns - 1) && (y < doc.rows - 1)) {
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
            update_status_bar();
            update_menu_checkboxes();
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
            reset_undo_buffer();
            libtextmode.resize_canvas(doc, columns, rows);
            cursor.move_to(Math.min(cursor.x, columns - 1), Math.min(cursor.y, rows - 1), true);
            start_render();
            chat.set_canvas_size(id, columns, rows);
        }
    });
}

async function open_file({file: file_name}) {
    file = file_name;
    reset_undo_buffer();
    doc = await libtextmode.read_file(file);
    await start_render();
    cursor.start_editing_mode();
    change_to_select_mode();
}

function ice_colors(value) {
    doc.ice_colors = value;
    if (connection) connection.ice_colors(doc.ice_colors);
    if (value) {
        canvas.stop_blinking();
    } else {
        canvas.start_blinking();
    }
    update_status_bar();
    update_menu_checkboxes();
}

function use_9px_font(value) {
    if (connection) connection.use_9px_font(value);
    doc.use_9px_font = value;
    start_render();
}

function set_var(name, value) {
    document.documentElement.style.setProperty(`--${name}`, `${value}px`);
}

function show_preview(visible) {
    set_var("preview-width", visible ? 300 : 1);
}

function show_statusbar(visible) {
    set_var("statusbar-height", visible ? 22 : 0);
}

function show_toolbar(visible) {
    if (!visible) {
        toolbar.hide();
    } else {
        toolbar.show();
    }
}

function change_font(font_name) {
    if (connection) connection.change_font(font_name);
    doc.font_name = font_name;
    if (doc.font_bytes) delete doc.font_bytes;
    start_render();
}

function set_insert_mode(value) {
    insert_mode = value;
    update_status_bar();
}

function export_as_png(file) {
    canvas.export_as_png({file, ice_colors: doc.ice_colors});
}


function export_as_utf8(file) {
    libtextmode.write_file(doc, file, {utf8: true});
}

function previous_foreground_color() {
    set_fg(fg == 0 ? 15 : fg - 1);
}

function next_foreground_color() {
    set_fg(fg == 15 ? 0 : fg + 1);
}

function previous_background_colour() {
    set_bg(bg == 0 ? 15 : bg - 1);
}

function next_background_color() {
    set_bg(bg == 15 ? 0 : bg + 1);
}

function toggle_bg(num) {
    if (bg == num || (bg >= 8 && bg != num + 8)) {
        set_bg(num + 8);
    } else {
        set_bg(num);
    }
}

function toggle_fg(num) {
    if (fg == num || (fg >= 8 && fg != num + 8)) {
        set_fg(num + 8);
    } else {
        set_fg(num);
    }
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

function change_data({x, y, code, fg, bg, pre_cursor_x, pre_cursor_y}) {
    const i = doc.columns * y + x;
    if (pre_cursor_x != undefined && pre_cursor_y != undefined) {
        undo_buffer[undo_buffer.length - 1].push(Object.assign({x, y, pre_cursor_x, pre_cursor_y, post_cursor_x: cursor.x, post_cursor_y: cursor.y, ...doc.data[i]}));
    } else {
        undo_buffer[undo_buffer.length - 1].push(Object.assign({x, y, ...doc.data[i]}));
    }
    doc.data[i] = {code, fg, bg};
    render_at(x, y);
    if (connection) connection.draw(x, y, doc.data[i]);
}

function start_undo_chunk() {
    reset_redo_buffer();
    undo_buffer.push([]);
    send("enable_undo");
    send("document_changed");
}

function key_typed(code) {
    start_undo_chunk();
    if (insert_mode) {
        for (let x = doc.columns - 1; x > cursor.x; x--) {
            const block = doc.data[doc.columns * cursor.y + x - 1];
            change_data({x, y: cursor.y, code: block.code, fg: block.fg, bg: block.bg});
        }
    }
    const x = cursor.x;
    cursor.right();
    change_data({x, y: cursor.y, code, fg, bg, pre_cursor_x: x, pre_cursor_y: cursor.y});
}

function backspace() {
    if (cursor.x > 0) {
        start_undo_chunk();
        const x = cursor.x;
        cursor.left();
        change_data({x: x - 1, y: cursor.y, code: 32, fg: 7, bg: 0, pre_cursor_x: x, pre_cursor_y: cursor.y});
    }
}

function delete_key() {
    start_undo_chunk();
    for (let x = cursor.x, i = cursor.index() + 1; x < doc.columns - 1; x++, i++) {
        const block = doc.data[i];
        change_data({x, y: cursor.y, code: block.code, fg: block.fg, bg: block.bg, pre_cursor_x: cursor.x, pre_cursor_y: cursor.y});
    }
    change_data({x: doc.columns - 1, y: cursor.y, code: 32, fg: 7, bg: 0});
}

function f_key(value) {
    key_typed(toolbar.get_f_key(value));
}

function stamp(single_undo = false) {
    if (document.activeElement == document.getElementById("chat_input")) return;
    if (!single_undo) start_undo_chunk();
    for (let y = 0; y + cursor.y < doc.rows && y < stored_blocks.rows; y++) {
        for (let x = 0; x + cursor.x < doc.columns && x < stored_blocks.columns; x++) {
            const block = stored_blocks.data[y * stored_blocks.columns + x];
            change_data({x: cursor.x + x, y: cursor.y + y, code: block.code, fg: block.fg, bg: block.bg});
        }
    }
}

function place() {
    stamp(cursor.is_move_operation);
    cursor.start_editing_mode();
}

document.addEventListener("keydown", (event) => {
    const chat_input = document.getElementById("chat_input");
    if (chat_input == document.activeElement) {
        if (event.code == "Enter" || event.code == "NumpadEnter") {
            if (chat_input.value != "" && connection) {
                connection.chat(nick, group, chat_input.value);
                chat_input.value = "";
            }
        }
        return;
    }
    if ((event.key == "a" || event.key == "A") && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
        select_all();
        event.preventDefault();
    }
    switch (mode) {
        case editor_modes.SELECT:
            if (cursor.mode == canvas.cursor_modes.EDITING) {
                if (use_numpad) {
                    switch (event.code) {
                        case "Numpad1": if (!event.altKey) f_key(1); return;
                        case "Numpad2": if (!event.altKey) f_key(5); return;
                        case "Numpad3": if (!event.altKey) f_key(1); return;
                        case "Numpad4": if (!event.altKey) f_key(6); return;
                        case "Numpad5": if (!event.altKey) f_key(3); return;
                        case "Numpad6": if (!event.altKey) f_key(7); return;
                        case "Numpad7": if (!event.altKey) f_key(2); return;
                        case "Numpad8": if (!event.altKey) f_key(4); return;
                        case "Numpad9": if (!event.altKey) f_key(2); return;
                        case "Numpad0": if (!event.altKey) f_key(0); return;
                        case "NumpadAdd": if (!event.altKey) f_key(0); return;
                        case "NumpadDecimal": if (!event.altKey) key_typed(32); return;
                        case "NumpadEnter": if (!event.altKey) cursor.new_line(); return;
                    }
                }
                switch (event.code) {
                    case "F1": if (!event.altKey) f_key(0); break;
                    case "F2": if (!event.altKey) f_key(1); break;
                    case "F3": if (!event.altKey) f_key(2); break;
                    case "F4": if (!event.altKey) f_key(3); break;
                    case "F5": if (!event.altKey) f_key(4); break;
                    case "F6": if (!event.altKey) f_key(5); break;
                    case "F7": if (!event.altKey) f_key(6); break;
                    case "F8": if (!event.altKey) f_key(7); break;
                    case "F9": if (!event.altKey) f_key(8); break;
                    case "F10": if (!event.altKey) f_key(9);  break;
                    case "Backspace": backspace(); break;
                    case "Delete": delete_key(); break;
                    case "Enter":
                        cursor.new_line();
                        break;
                    default:
                        if (event.key.length == 1 && !event.metaKey && !event.altKey && !event.ctrlKey) {
                            if (event.key.length == 1) {
                                const code = event.key.charCodeAt(0);
                                if (code >= 32 && code <= 126) {
                                    key_typed(code);
                                    event.preventDefault();
                                }
                            }
                        } else if ((event.key == "v" || event.key == "V") && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                            paste();
                            event.preventDefault();
                        }
                }
            } else if (cursor.mode == canvas.cursor_modes.SELECTION && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) {
                switch (event.key) {
                    case "x": case "X": cut(); event.preventDefault(); break;
                    case "c": case "C": copy(); event.preventDefault(); break;
                }
            } else if (cursor.mode == canvas.cursor_modes.OPERATION && event.code == "Enter") {
                place();
            }
            switch (event.code) {
                case "Home":
                    cursor.start_of_row();
                    event.preventDefault();
                    break;
                case "End":
                    cursor.end_of_row();
                    event.preventDefault();
                    break;
                case "ArrowLeft":
                    if (!event.altKey) {
                        if (event.shiftKey && cursor.mode != canvas.cursor_modes.SELECTION) cursor.start_selection_mode();
                        if (event.metaKey || event.ctrlKey) {
                            cursor.start_of_row();
                        } else {
                            cursor.left();
                        }
                        event.preventDefault();
                    }
                    break;
                case "ArrowUp":
                    if (!event.altKey) {
                        if (event.shiftKey && cursor.mode != canvas.cursor_modes.SELECTION) cursor.start_selection_mode();
                        if (event.metaKey || event.ctrlKey) {
                            cursor.page_up();
                        } else {
                            cursor.up();
                        }
                        event.preventDefault();
                    }
                    break;
                case "ArrowRight":
                    if (!event.altKey) {
                        if (event.shiftKey && cursor.mode != canvas.cursor_modes.SELECTION) cursor.start_selection_mode();
                        if (event.metaKey || event.ctrlKey) {
                            cursor.end_of_row();
                        } else {
                            cursor.right();
                        }
                        event.preventDefault();
                    }
                    break;
                case "ArrowDown":
                    if (!event.altKey) {
                        if (event.shiftKey && cursor.mode != canvas.cursor_modes.SELECTION) cursor.start_selection_mode();
                        if (event.metaKey || event.ctrlKey) {
                            cursor.page_down();
                        } else {
                            cursor.down();
                        }
                        event.preventDefault();
                    }
                    break;
                case "PageUp":
                    if (event.shiftKey && cursor.mode != canvas.cursor_modes.SELECTION) cursor.start_selection_mode();
                    cursor.page_up();
                    event.preventDefault();
                    break;
                case "PageDown":
                    if (event.shiftKey && cursor.mode != canvas.cursor_modes.SELECTION) cursor.start_selection_mode();
                    cursor.page_down();
                    event.preventDefault();
                    break;
                case "Insert":
                case "NumpadEnter":
                    set_insert_mode(!insert_mode);
                    update_menu_checkboxes();
                    break;
            }
            if (event.altKey && !event.metaKey && !event.ctrlKey) {
                switch (event.code) {
                    case "Digit0": toggle_fg(0); break;
                    case "Digit1": toggle_fg(1); break;
                    case "Digit2": toggle_fg(2); break;
                    case "Digit3": toggle_fg(3); break;
                    case "Digit4": toggle_fg(4); break;
                    case "Digit5": toggle_fg(5); break;
                    case "Digit6": toggle_fg(6); break;
                    case "Digit7": toggle_fg(7); break;
                    case "ArrowLeft": previous_background_color(); event.preventDefault(); break;
                    case "ArrowRight": next_background_color(); event.preventDefault(); break;
                    case "ArrowUp": previous_foreground_color(); event.preventDefault(); break;
                    case "ArrowDown": next_foreground_color(); event.preventDefault(); break;
                }
            } else if (event.ctrlKey && !event.altKey && !event.metaKey) {
                switch (event.code) {
                    case "Digit0": toggle_bg(0); break;
                    case "Digit1": toggle_bg(1); break;
                    case "Digit2": toggle_bg(2); break;
                    case "Digit3": toggle_bg(3); break;
                    case "Digit4": toggle_bg(4); break;
                    case "Digit5": toggle_bg(5); break;
                    case "Digit6": toggle_bg(6); break;
                    case "Digit7": toggle_bg(7); break;
                }
            }
        break;
        default:
            break;
    }
}, true);

function save({file: file_name, close_on_save}) {
    file = file_name;
    libtextmode.write_file(doc, file);
    if (close_on_save) electron.remote.getCurrentWindow().close();
}

function deselect() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    if (cursor.mode != canvas.cursor_modes.EDITING) {
        if (cursor.mode == canvas.cursor_modes.OPERATION) {
            if (cursor.is_move_operation) undo();
        }
        cursor.start_editing_mode();
    }
}

function clear_blocks({sx, sy, dx, dy}) {
    start_undo_chunk();
    for (let y = sy; y <= dy; y++) {
        for (let x = sx; x <= dx; x++) {
            change_data({x, y, code: 32, fg: 7, bg: 0});
        }
    }
}

function delete_selection() {
    if (cursor.mode == canvas.cursor_modes.SELECTION) {
        clear_blocks(cursor.reorientate_selection());
        cursor.start_editing_mode();
    }
}

function select_all() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    if (mode != editor_modes.SELECT) {
        change_to_select_mode();
    }
    cursor.start_editing_mode();
    cursor.move_to(0, 0, true);
    cursor.start_selection_mode();
    cursor.move_to(doc.columns - 1, doc.rows - 1);
}

function copy_block() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    if (cursor.mode == canvas.cursor_modes.SELECTION) {
        stored_blocks = cursor.start_operation_mode(doc.data);
    }
}

function move_block() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    if (cursor.mode == canvas.cursor_modes.SELECTION) {
        const selection = cursor.reorientate_selection();
        stored_blocks = cursor.start_operation_mode(doc.data, true);
        clear_blocks(selection);
    }
}

function copy() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    if (cursor.mode == canvas.cursor_modes.SELECTION) {
        stored_blocks = cursor.get_blocks_in_selection(doc.data);
        const text = [];
        for (let y = 0, i = 0; y < stored_blocks.rows; y++) {
            text.push("");
            for (let x = 0; x < stored_blocks.columns; x++, i++) {
                text[text.length - 1] += libtextmode.cp437_to_unicode(stored_blocks.data[i].code);
            }
        }
        electron.clipboard.write({text: text.join("\n"), html: JSON.stringify(stored_blocks)});
        cursor.start_editing_mode();
    }
}

function cut() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    if (cursor.mode == canvas.cursor_modes.SELECTION) {
        const selection = cursor.reorientate_selection();
        copy();
        clear_blocks(selection);
    }
}

function paste() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    try {
        const blocks = JSON.parse(electron.clipboard.readHTML().replace("<meta charset='utf-8'>", ""));
        if (blocks.columns && blocks.rows && (blocks.data.length == blocks.columns * blocks.rows)) {
            if (cursor.mode != canvas.cursor_modes.EDITING) cursor.start_editing_mode();
            start_undo_chunk();
            for (let y = 0; y + cursor.y < doc.rows && y < blocks.rows; y++) {
                for (let x = 0; x + cursor.x < doc.columns && x < blocks.columns; x++) {
                    const block = blocks.data[blocks.columns * y + x];
                    change_data({x: cursor.x + x, y: cursor.y + y, code: block.code, fg: block.fg, bg: block.bg});
                }
            }
        } else {
            throw("catch!");
        }
    } catch (err) {
        const text = electron.clipboard.readText();
        if (text.length) {
            if (cursor.mode != canvas.cursor_modes.EDITING) cursor.start_editing_mode();
            start_undo_chunk();
            const lines = text.split("\n");
            if (lines.length) {
                for (let y = cursor.y, line_y = 0; y < doc.rows && line_y < lines.length; y++, line_y++) {
                    for (let x = cursor.x, line_x = 0; x < doc.columns && line_x < lines[line_y].length; x++, line_x++) {
                        change_data({x, y, code: libtextmode.unicode_to_cp437(lines[line_y].charCodeAt(line_x)), fg, bg});
                    }
                }
            }
        }
    }
}

function undo() {
    if (undo_buffer.length) {
        if (cursor.mode != canvas.cursor_modes.EDITING) cursor.start_editing_mode();
        const redos = [];
        const undos = undo_buffer.pop();
        for (let undo_i = undos.length - 1; undo_i >= 0; undo_i--) {
            const undo = undos[undo_i];
            const i = doc.columns * undo.y + undo.x;
            redos.push(Object.assign({...doc.data[i], x: undo.x, y: undo.y, pre_cursor_x: undo.pre_cursor_x, pre_cursor_y: undo.pre_cursor_y, post_cursor_x: undo.post_cursor_x, post_cursor_y: undo.post_cursor_y}));
            doc.data[i] = Object.assign(undo);
            render_at(undo.x, undo.y);
            if (connection) connection.draw(undo.x, undo.y, doc.data[i]);
            if (undo.pre_cursor_x != undefined && undo.pre_cursor_y != undefined) {
                cursor.move_to(undo.pre_cursor_x, undo.pre_cursor_y, true);
            }
        }
        redo_buffer.push(redos);
        send("enable_redo");
        if (!undo_buffer.length) send("disable_undo");
    }
}

function redo() {
    if (redo_buffer.length) {
        if (cursor.mode != canvas.cursor_modes.EDITING) cursor.start_editing_mode();
        const undos = [];
        const redos = redo_buffer.pop();
        for (let redo_i = redos.length - 1; redo_i >= 0; redo_i--) {
            const redo = redos[redo_i];
            const i = doc.columns * redo.y + redo.x;
            undos.push(Object.assign({...doc.data[i], x: redo.x, y: redo.y, pre_cursor_x: redo.pre_cursor_x, pre_cursor_y: redo.pre_cursor_y, post_cursor_x: redo.post_cursor_x, post_cursor_y: redo.post_cursor_y}));
            doc.data[i] = Object.assign(redo);
            render_at(redo.x, redo.y);
            if (connection) connection.draw(redo.x, redo.y, doc.data[i]);
            if (redo.post_cursor_x != undefined && redo.post_cursor_y != undefined) {
                cursor.move_to(redo.post_cursor_x, redo.post_cursor_y, true);
            }
        }
        undo_buffer.push(undos);
        send("enable_undo");
        if (!redo_buffer.length) send("disable_redo");
    }
}

function use_attribute_under_cursor() {
    const i = cursor.index();
    set_fg(doc.data[i].fg);
    set_bg(doc.data[i].bg);
}

function default_color() {
    set_fg(7);
    set_bg(0);
}

function switch_foreground_background() {
    const tmp = fg;
    set_fg(bg);
    set_bg(tmp);
}

function has_latest_undo_got_this_block(x, y) {
    for (const undo of undo_buffer[undo_buffer.length - 1]) {
        if (undo.x == x && undo.y == y) return true;
    }
    return false;
}

function optimize_block(x, y) {
    const i = y * doc.columns + x;
    const block = doc.data[i];
    if (block.bg >= 8 && block.fg < 8) {
        switch (block.code) {
        case 0: case 32: case 255: change_data({x, t, code: 219, fg: block.bg, bg: 0}); break;
        case 219: change_data({x, y, code: 0, fg: block.bg, bg: block.fg}); break;
        case 220: change_data({x, y, code: 223, fg: block.bg, bg: block.fg}); break;
        case 223: change_data({x, y, code: 220, fg: block.bg, bg: block.fg}); break;
        }
    }
    if (block.fg == 0) {
        if (block.bg == 0 || block.code == 219) {
            change_data({x, y, code: 32, fg: 7, bg: 0});
        } else {
            switch (block.code) {
                case 220: change_data({x, y, code: 223, fg: block.bg, bg: block.fg}); break;
                case 223: change_data({x, y, code: 220, fg: block.bg, bg: block.fg}); break;
            }
        }
    }
}

function line(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const sx = (x0 < x1) ? 1 : -1;
    const dy = Math.abs(y1 - y0);
    const sy = (y0 < y1) ? 1 : -1;
    let err = ((dx > dy) ? dx : -dy) / 2;
    let e2;
    const coords = [];

    while (true) {
        coords.push({x: x0, y: y0});
        if (x0 === x1 && y0 === y1) {
            break;
        }
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
    return coords;
}

function draw_half_block(x, y, col) {
    const block_y = Math.floor(y / 2);
    const block = doc.data[block_y * doc.columns + x];
    const is_top = (y % 2 == 0);
    if (block.code == 219) {
        if (block.fg != col) {
            if (is_top) {
                change_data({x: x, y: block_y, code: 223, fg: col, bg: block.fg});
            } else {
                change_data({x: x, y: block_y, code: 220, fg: col, bg: block.fg});
            }
        }
    } else if (block.code != 220 && block.code != 223) {
        if (is_top) {
            change_data({x: x, y: block_y, code: 223, fg: col, bg: block.bg});
        } else {
            change_data({x: x, y: block_y, code: 220, fg: col, bg: block.bg});
        }
    } else {
        if (is_top) {
            if (block.code == 223) {
                if (block.bg == col) {
                    change_data({x: x, y: block_y, code: 219, fg: col, bg: 0});
                } else {
                    change_data({x: x, y: block_y, code: 223, fg: col, bg: block.bg});
                }
            } else if (block.fg == col) {
                change_data({x: x, y: block_y, code: 219, fg: col, bg: 0});
            } else {
                change_data({x: x, y: block_y, code: 223, fg: col, bg: block.fg});
            }
        } else {
            if (block.code == 220) {
                if (block.bg == col) {
                    change_data({x: x, y: block_y, code: 219, fg: col, bg: 0});
                } else {
                    change_data({x: x, y: block_y, code: 220, fg: col, bg: block.bg});
                }
            } else if (block.fg == col) {
                change_data({x: x, y: block_y, code: 219, fg: col, bg: 0});
            } else {
                change_data({x: x, y: block_y, code: 220, fg: col, bg: block.fg});
            }
        }
    }
    optimize_block(x, block_y);
}

function draw_half_block_line(sx, sy, dx, dy, col) {
    const coords = line(sx, sy, dx, dy);
    for (const coord of coords) draw_half_block(coord.x, coord.y, col);
}

function half_block_brush(x, y, col) {
    draw_half_block_line(mouse.x, mouse.y, x, y, col);
    mouse.x = x;
    mouse.y = y;
}

function colorize_brush(x, y) {
    const coords = line(mouse.x, mouse.y, x, y);
    for (const coord of coords) {
        const block = doc.data[coord.y * doc.columns + coord.x];
        change_data({x: coord.x, y: coord.y, code: block.code, fg: toolbar.is_in_colorize_fg_mode() ? fg : block.fg, bg: toolbar.is_in_colorize_bg_mode() ? bg : block.bg});
    }
    mouse.x = x;
    mouse.y = y;
}

function clear_block_brush(x, y) {
    const coords = line(mouse.x, mouse.y, x, y);
    for (const coord of coords) change_data({x: coord.x, y: coord.y, code: 32, fg: 7, bg: 0});
    mouse.x = x;
    mouse.y = y;
}

function full_block_brush(x, y, col) {
    const coords = line(mouse.x, mouse.y, x, y);
    for (const coord of coords) change_data({x: coord.x, y: coord.y, code: 219, fg: col, bg: 0});
    mouse.x = x;
    mouse.y = y;
}

function get_canvas_xy(event) {
    const canvas_container = document.getElementById("canvas_container");
    const canvas_container_rect = canvas_container.getBoundingClientRect();
    const x = Math.min(Math.max(Math.floor((event.clientX - canvas_container_rect.left) / render.font.width), 0), doc.columns - 1);
    const y = Math.min(Math.max(Math.floor((event.clientY - canvas_container_rect.top) / render.font.height), 0), doc.rows - 1);
    const half_y = Math.min(Math.max(Math.floor((event.clientY - canvas_container_rect.top) / (render.font.height / 2)), 0), doc.rows * 2 - 1);
    return {x, y, half_y};
}

function create_tool_preview() {
    preview_canvas = document.createElement("canvas");
    document.getElementById("editing_layer").appendChild(preview_canvas);
    preview_canvas.style.opacity = 0.6;
}

function destroy_tool_preview() {
    if (preview_canvas) {
        document.getElementById("editing_layer").removeChild(preview_canvas);
        preview_canvas = undefined;
    }
}

function update_tool_preview(x, y, width, height) {
    preview_canvas.width = width;
    preview_canvas.style.width = `${width}px`;
    preview_canvas.height = height;
    preview_canvas.style.height = `${height}px`;
    preview_canvas.style.left = `${x}px`;
    preview_canvas.style.top = `${y}px`;
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
        start_undo_chunk();
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
                    change_data({x: coord.to.x, y: block.text_y, code: 221, fg: col, bg: block.right_block_color});
                } else if (coord.from.y == coord.to.y - 1 && block.right_block_color == target_color) {
                    change_data({x: coord.to.x, y: block.text_y, code: 222, fg: col, bg: block.left_block_color});
                } else if (coord.from.y == coord.to.y + 1 && block.right_block_color == target_color) {
                    change_data({x: coord.to.x, y: block.text_y, code: 222, fg: col, bg: block.left_block_color});
                } else if (coord.from.y == coord.to.y + 1 && block.left_block_color == target_color) {
                    change_data({x: coord.to.x, y: block.text_y, code: 221, fg: col, bg: block.right_block_color});
                } else if (coord.from.x == coord.to.x - 1 && block.left_block_color == target_color) {
                    change_data({x: coord.to.x, y: block.text_y, code: 221, fg: col, bg: block.right_block_color});
                } else if (coord.from.x == coord.to.x + 1 && block.right_block_color == target_color) {
                    change_data({x: coord.to.x, y: block.text_y, code: 222, fg: col, bg: block.left_block_color});
                }
            }
        }
    }
}

function sample_half_block(x, y, set_fg_or_bg) {
    const block = get_half_block(x, y);
    if (mouse.button == mouse_button_types.LEFT) {
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

function register_mouse(event, x, y, record_start, drawing) {
    if (event.button == 0) {
        mouse.button = mouse_button_types.LEFT;
    } else if (event.button == 2) {
        mouse.button = mouse_button_types.RIGHT;
    }
    mouse.x = x;
    mouse.y = y;
    if (record_start) {
        mouse.start.x = x;
        mouse.start.y = y;
    }
    mouse.drawing = drawing;
}

function unregester_mouse() {
    mouse.button = mouse_button_types.NONE;
    mouse.drawing = false;
}

function mouse_down(event) {
    const {x, y, half_y} = get_canvas_xy(event);
    if (event.altKey) {
        register_mouse(event, x, half_y, false, false);
        sample_half_block(x, half_y, event.button == 0 ? set_fg : set_bg);
    } else {
        switch (mode) {
            case editor_modes.SELECT:
                switch (cursor.mode) {
                    case canvas.cursor_modes.EDITING:
                        register_mouse(event, x, y, false, true);
                        cursor.move_to(x, y);
                        break;
                    case canvas.cursor_modes.SELECTION:
                        cursor.start_editing_mode();
                        register_mouse(event, x, y, false, true);
                        cursor.move_to(x, y);
                        break;
                    case canvas.cursor_modes.OPERATION:
                        cursor.move_to(x, y);
                        stamp(cursor.is_move_operation);
                        cursor.start_editing_mode();
                        break;
                }
            break;
            case editor_modes.BRUSH:
                start_undo_chunk();
                if (toolbar.is_in_half_block_mode()) {
                    register_mouse(event, x, half_y, false, true);
                    if (event.shiftKey) {
                        half_block_brush(x, half_y, 0);
                    } else {
                        half_block_brush(x, half_y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                    }
                } else if (event.shiftKey || toolbar.is_in_clear_block_mode()) {
                    register_mouse(event, x, y, false, true);
                    clear_block_brush(x, y);
                } else if (toolbar.is_in_full_block_mode()) {
                    register_mouse(event, x, y, false, true);
                    full_block_brush(x, y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                } else if (toolbar.is_in_colorize_mode()) {
                    register_mouse(event, x, y, false, true);
                    colorize_brush(x, y);
                }
            break;
            case editor_modes.LINE:
            case editor_modes.RECTANGLE:
                register_mouse(event, x, toolbar.is_in_half_block_mode() ? half_y : y, true, true);
                create_tool_preview();
                break;
            case editor_modes.FILL:
                if (connection) {
                    const choice = electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {type: "question", message: "Fill", detail: "Using fill whilst connected to a server is a potentially destructive operation. Are you sure?", buttons: ["Perform Fill", "Cancel"], defaultId: 1, cancelId: 1});
                    if (choice == 0) fill(x, half_y, (event.button == 0) ? fg : bg);
                } else {
                    fill(x, half_y, (event.button == 0) ? fg : bg);
                }
                break;
            case editor_modes.SAMPLE:
                const block = doc.data[doc.columns * y + x];
                set_fg(block.fg);
                set_bg(block.bg);
                unregester_mouse();
                switch (previous_mode) {
                    case editor_modes.SELECT: change_to_select_mode(); break;
                    case editor_modes.BRUSH: change_to_brush_mode(); break;
                    case editor_modes.LINE: change_to_line_mode(); break;
                    case editor_modes.FILL: change_to_fill_mode(); break;
                    case editor_modes.RECTANGLE: change_to_rectangle_mode(); break;
                }
            break;
        }
    }
}

function draw_line_preview(x, y, col) {
    if (x != mouse.x || y != mouse.y) {
        const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
        const [sy, dy] = (mouse.start.y < y) ? [mouse.start.y, y] : [y, mouse.start.y];
        if (toolbar.is_in_half_block_mode()) {
            update_tool_preview(sx * render.font.width, Math.floor(sy * render.font.height / 2), (dx - sx + 1) * render.font.width, Math.ceil((dy - sy + 1) * render.font.height / 2));
        } else {
            update_tool_preview(sx * render.font.width, sy * render.font.height, (dx - sx + 1) * render.font.width, (dy - sy + 1) * render.font.height);
        }
        const ctx = preview_canvas.getContext("2d");
        ctx.fillStyle = libtextmode.convert_ega_to_style(render.font.palette[col]);
        const coords = line(mouse.start.x, mouse.start.y, x, y);
        if (toolbar.is_in_half_block_mode()) {
            for (const coord of coords) {
                const odd_y = (coord.y % 2);
                ctx.fillRect((coord.x - sx) * render.font.width, Math.floor((coord.y - sy) * render.font.height / 2) - (odd_y ? 1 : 0), render.font.width, Math.floor(render.font.height / 2) + (odd_y ? 1 : -1));
            }
        } else {
            for (const coord of coords) ctx.fillRect((coord.x - sx) * render.font.width, (coord.y - sy) * render.font.height, render.font.width, render.font.height);
        }
    }
}

function draw_line(x, y, col) {
    start_undo_chunk();
    if (toolbar.is_in_half_block_mode()) {
        draw_half_block_line(mouse.x, mouse.y, x, y, col);
    } else if (toolbar.is_in_full_block_mode()) {
        full_block_brush(x, y, col);
    } else if (toolbar.is_in_clear_block_mode()) {
        clear_block_brush(x, y);
    } else if (toolbar.is_in_colorize_mode()) {
        colorize_brush(x, y);
    }
}

function draw_rectangle_preview(x, y, col) {
    if (x != mouse.x || y != mouse.y) {
        const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
        const [sy, dy] = (mouse.start.y < y) ? [mouse.start.y, y] : [y, mouse.start.y];
        if (toolbar.is_in_half_block_mode()) {
            update_tool_preview(sx * render.font.width, Math.floor(sy * render.font.height / 2), (dx - sx + 1) * render.font.width, Math.ceil((dy - sy + 1) * render.font.height / 2));
        } else {
            update_tool_preview(sx * render.font.width, sy * render.font.height, (dx - sx + 1) * render.font.width, (dy - sy + 1) * render.font.height);
        }
        preview_canvas.style.backgroundColor = libtextmode.convert_ega_to_style(render.font.palette[col]);
    }
}

function draw_rectangle(x, y, col) {
    const [sx, dx] = (mouse.start.x < x) ? [mouse.start.x, x] : [x, mouse.start.x];
    const [sy, dy] = (mouse.start.y < y) ? [mouse.start.y, y] : [y, mouse.start.y];
    start_undo_chunk();
    if (toolbar.is_in_half_block_mode()) {
        for (let y = sy; y <= dy; y++) {
            draw_half_block_line(sx, y, dx, y, col);
        }
    } else if (toolbar.is_in_full_block_mode()) {
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                change_data({x, y, code: 219, fg: col, bg: 0});
            }
        }
    } else if (toolbar.is_in_clear_block_mode()) {
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                change_data({x, y, code: 0, fg: 7, bg: 0});
            }
        }
    } else if (toolbar.is_in_colorize_mode()) {
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                const block = doc.data[doc.columns * y + x];
                change_data({x, y, code: block.code, fg: toolbar.is_in_colorize_fg_mode() ? fg : block.fg, bg: toolbar.is_in_colorize_bg_mode() ? bg : block.bg});
            }
        }
    }
}

function mouse_move(event) {
    const {x, y, half_y} = get_canvas_xy(event);
    if (event.altKey && !mouse.drawing) {
        if (mouse.button) sample_half_block(x, half_y, mouse.button == mouse_button_types.LEFT ? set_fg : set_bg);
    } else {
        switch (mode) {
            case editor_modes.SELECT:
                switch (cursor.mode) {
                    case canvas.cursor_modes.EDITING:
                        if (mouse.drawing && (mouse.x != x || mouse.y != y)) cursor.start_selection_mode();
                        break;
                    case canvas.cursor_modes.SELECTION:
                        if (mouse.drawing) cursor.move_to(x, y);
                        break;
                    case canvas.cursor_modes.OPERATION:
                        cursor.move_to(x, y);
                        break;
                }
            break;
            case editor_modes.BRUSH:
                if (mouse.drawing) {
                    if (toolbar.is_in_half_block_mode()) {
                        if (event.shiftKey) {
                            half_block_brush(x, half_y, 0);
                        } else {
                            half_block_brush(x, half_y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                        }
                    } else if (event.shiftKey || toolbar.is_in_clear_block_mode()) {
                        clear_block_brush(x, y);
                    } else if (toolbar.is_in_full_block_mode()) {
                        full_block_brush(x, y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                    } else if (toolbar.is_in_colorize_mode()) {
                        colorize_brush(x, y);
                    }
                }
            break;
            case editor_modes.LINE:
                if (mouse.drawing) {
                    if (toolbar.is_in_half_block_mode()) {
                        draw_line_preview(x, half_y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                    } else if (toolbar.is_in_clear_block_mode()) {
                        draw_line_preview(x, y, 0);
                    } else {
                        draw_line_preview(x, y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                    }
                }
                break;
            case editor_modes.RECTANGLE:
                if (mouse.drawing) {
                    if (toolbar.is_in_half_block_mode()) {
                        draw_rectangle_preview(x, half_y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                    } else if (toolbar.is_in_clear_block_mode()) {
                        draw_rectangle_preview(x, y, 0);
                    } else {
                        draw_rectangle_preview(x, y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                    }
                }
                break;
        }
        toolbar.set_sample(doc.data[doc.columns * y + x]);
    }
}

function mouse_up(event) {
    const {x, y, half_y} = get_canvas_xy(event);
    switch (mode) {
        case editor_modes.LINE:
            if (mouse.drawing) {
                draw_line(x, toolbar.is_in_half_block_mode() ? half_y : y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                destroy_tool_preview();
            }
            break;
        case editor_modes.RECTANGLE:
            if (mouse.drawing) {
                draw_rectangle(x, toolbar.is_in_half_block_mode() ? half_y : y, (mouse.button == mouse_button_types.LEFT) ? fg : bg);
                destroy_tool_preview();
            }
            break;
    }
    unregester_mouse();
}

function mouse_out(event) {
    switch (mode) {
        case editor_modes.LINE:
        case editor_modes.RECTANGLE:
            destroy_tool_preview();
            break;
    }
    unregester_mouse();
}

function open_reference_image({image}) {
    document.getElementById("reference_image").style.backgroundImage = `url(${image})`;
    document.getElementById("reference_image").style.opacity = 0.4;
}

function toggle_reference_image({is_visible}) {
    document.getElementById("reference_image").style.opacity = is_visible ? 0.4 : 0.0;
}

function clear_reference_image() {
    document.getElementById("reference_image").style.removeProperty("background-image");
    send("disable_clear_reference_image");
}

function rotate() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    cursor.update_cursor_with_blocks(libtextmode.rotate(stored_blocks));
}

function flip_x() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    cursor.update_cursor_with_blocks(libtextmode.flip_x(stored_blocks));
}

function flip_y() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    cursor.update_cursor_with_blocks(libtextmode.flip_y(stored_blocks));
}

function center() {
    if (document.activeElement == document.getElementById("chat_input")) return;
    cursor.move_to(Math.max(Math.floor((doc.columns - stored_blocks.columns) / 2), 0), cursor.y);
}

function set_zoom(factor) {
    const zoom_element = document.getElementById("zoom");
    electron.remote.getCurrentWebContents().setZoomFactor(factor);
    zoom_element.textContent = `${Math.ceil(factor * 10) * 10}%`;
    zoom_element.classList.remove("fade");
    document.body.removeChild(zoom_element);
    document.body.appendChild(zoom_element);
    zoom_element.classList.add("fade");
    update_menu_checkboxes();
}

function current_zoom_factor() {
    return parseFloat(electron.remote.getCurrentWebContents().getZoomFactor().toFixed(1));
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

function get_canvas_size() {
    send("get_canvas_size", {columns: doc.columns, rows: doc.rows});
}

function set_canvas_size({columns, rows}) {
    if (columns != doc.columns | rows != doc.rows) {
        if (connection) connection.set_canvas_size(columns, rows);
        reset_undo_buffer();
        libtextmode.resize_canvas(doc, columns, rows);
        cursor.move_to(Math.min(cursor.x, columns - 1), Math.min(cursor.y, rows - 1), true);
        start_render();
    }
}

function get_sauce_info() {
    send("get_sauce_info", {title: doc.title, author: doc.author, group: doc.group, comments: doc.comments});
}

function set_sauce_info({title, author, group, comments}) {
    doc.title = title;
    doc.author = author;
    doc.group = group;
    doc.comments = comments;
    if (connection) {
        connection.sauce(title, author, group, comments);
        chat.updated_sauce(connection.id);
    }
}

async function new_document({columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data}) {
    reset_undo_buffer();
    doc = libtextmode.new_document({columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data});
    await start_render();
    cursor.start_editing_mode();
    change_to_select_mode();
}

function change_to_select_mode() {
    switch (mode) {
        case editor_modes.BRUSH: document.getElementById("brush_mode").classList.remove("selected"); break;
        case editor_modes.LINE: document.getElementById("line_mode").classList.remove("selected"); break;
        case editor_modes.RECTANGLE: document.getElementById("rectangle_mode").classList.remove("selected"); break;
        case editor_modes.FILL: document.getElementById("fill_mode").classList.remove("selected"); break;
        case editor_modes.SAMPLE: document.getElementById("sample_mode").classList.remove("selected"); break;
    }
    if (mode != editor_modes.SELECT) {
        toolbar.show_select();
        document.getElementById("select_mode").classList.add("selected");
        cursor.show();
        cursor.start_editing_mode();
        send("enable_editing_shortcuts");
        send("change_to_select_mode");
        mode = editor_modes.SELECT;
    }
}

function change_to_brush_mode() {
    switch (mode) {
        case editor_modes.SELECT:
            document.getElementById("select_mode").classList.remove("selected");
            cursor.hide();
            send("disable_editing_shortcuts");
            break;
        case editor_modes.LINE: document.getElementById("line_mode").classList.remove("selected"); break;
        case editor_modes.RECTANGLE: document.getElementById("rectangle_mode").classList.remove("selected"); break;
        case editor_modes.FILL: document.getElementById("fill_mode").classList.remove("selected"); break;
        case editor_modes.SAMPLE: document.getElementById("sample_mode").classList.remove("selected"); break;
    }
    if (mode != editor_modes.BRUSH) {
        toolbar.show_brush();
        document.getElementById("brush_mode").classList.add("selected");
        mode = editor_modes.BRUSH;
        send("show_brush_touchbar");
        send("change_to_brush_mode");
    }
}

function change_to_line_mode() {
    switch (mode) {
        case editor_modes.SELECT:
            document.getElementById("select_mode").classList.remove("selected");
            cursor.hide();
            send("disable_editing_shortcuts");
            break;
        case editor_modes.BRUSH: document.getElementById("brush_mode").classList.remove("selected"); break;
        case editor_modes.RECTANGLE: document.getElementById("rectangle_mode").classList.remove("selected"); break;
        case editor_modes.FILL: document.getElementById("fill_mode").classList.remove("selected"); break;
        case editor_modes.SAMPLE: document.getElementById("sample_mode").classList.remove("selected"); break;
        }
    if (mode != editor_modes.LINE) {
        toolbar.show_brush();
        document.getElementById("line_mode").classList.add("selected");
        mode = editor_modes.LINE;
        send("show_brush_touchbar");
        send("change_to_line_mode");
    }
}

function change_to_rectangle_mode() {
    switch (mode) {
        case editor_modes.SELECT:
            document.getElementById("select_mode").classList.remove("selected");
            cursor.hide();
            send("disable_editing_shortcuts");
            break;
        case editor_modes.BRUSH: document.getElementById("brush_mode").classList.remove("selected"); break;
        case editor_modes.LINE: document.getElementById("line_mode").classList.remove("selected"); break;
        case editor_modes.FILL: document.getElementById("fill_mode").classList.remove("selected"); break;
        case editor_modes.SAMPLE: document.getElementById("sample_mode").classList.remove("selected"); break;
        }
    if (mode != editor_modes.RECTANGLE) {
        toolbar.show_brush();
        document.getElementById("rectangle_mode").classList.add("selected");
        mode = editor_modes.RECTANGLE;
        send("show_brush_touchbar");
        send("change_to_rectangle_mode");
    }
}

function change_to_fill_mode() {
    switch (mode) {
        case editor_modes.SELECT:
            document.getElementById("select_mode").classList.remove("selected");
            cursor.hide();
            send("disable_editing_shortcuts");
            break;
        case editor_modes.BRUSH: document.getElementById("brush_mode").classList.remove("selected"); break;
        case editor_modes.LINE: document.getElementById("line_mode").classList.remove("selected"); break;
        case editor_modes.RECTANGLE: document.getElementById("rectangle_mode").classList.remove("selected"); break;
        case editor_modes.SAMPLE: document.getElementById("sample_mode").classList.remove("selected"); break;
        }
    if (mode != editor_modes.FILL) {
        toolbar.show_sample();
        document.getElementById("fill_mode").classList.add("selected");
        mode = editor_modes.FILL;
        send("show_brush_touchbar");
        send("change_to_fill_mode");
    }
}

function change_to_sample_mode() {
    switch (mode) {
        case editor_modes.SELECT:
            document.getElementById("select_mode").classList.remove("selected");
            cursor.hide();
            send("disable_editing_shortcuts");
        break;
        case editor_modes.LINE: document.getElementById("line_mode").classList.remove("selected"); break;
        case editor_modes.RECTANGLE: document.getElementById("rectangle_mode").classList.remove("selected"); break;
        case editor_modes.FILL: document.getElementById("fill_mode").classList.remove("selected"); break;
        case editor_modes.BRUSH: document.getElementById("brush_mode").classList.remove("selected");break;
    }
    if (mode != editor_modes.SAMPLE) {
        toolbar.show_sample();
        previous_mode = mode;
        document.getElementById("sample_mode").classList.add("selected");
        mode = editor_modes.SAMPLE;
        send("show_brush_touchbar");
        send("change_to_sample_mode");
    }
}

hourly_saver.on("save", () => {
    if (!connection && backup_folder != "") {
        const parsed_file = path.parse(file);
        const backup_file = hourly_saver.filename(path.join(backup_folder, `${parsed_file.base}${parsed_file.ext || ".ans"}`));
        libtextmode.write_file(doc, backup_file);
        hourly_saver.keep_if_changes(backup_file);
    }
});

function use_backup(value) {
    if (value) {
        hourly_saver.start();
    } else {
        hourly_saver.stop();
    }
}

function chat_window_toggle() {
    chat.toggle();
}

function crop() {
    const blocks = (cursor.mode == canvas.cursor_modes.SELECTION) ? cursor.get_blocks_in_selection(doc.data) : stored_blocks;
    send("new_document", {title: doc.title, author: doc.author, group: doc.group, date: doc.date, palette: doc.palette, font_name: doc.font_name, use_9px_font: doc.use_9px_font, ice_colors: doc.ice_colors, ...blocks});
    deselect();
}

electron.ipcRenderer.on("open_file", (event, opts) => open_file(opts));
electron.ipcRenderer.on("save", (event, opts) => save(opts));
electron.ipcRenderer.on("show_statusbar", (event, opts) => show_statusbar(opts));
electron.ipcRenderer.on("show_preview", (event, opts) => show_preview(opts));
electron.ipcRenderer.on("show_toolbar", (event, opts) => show_toolbar(opts));
electron.ipcRenderer.on("ice_colors", (event, opts) => ice_colors(opts));
electron.ipcRenderer.on("use_9px_font", (event, opts) => use_9px_font(opts));
electron.ipcRenderer.on("change_font", (event, opts) => change_font(opts));
electron.ipcRenderer.on("insert_mode", (event, opts) => set_insert_mode(opts));
electron.ipcRenderer.on("export_as_png", (event, opts) => export_as_png(opts));
electron.ipcRenderer.on("export_as_utf8", (event, opts) => export_as_utf8(opts));
electron.ipcRenderer.on("previous_foreground_color", (event, opts) => previous_foreground_color(opts));
electron.ipcRenderer.on("next_foreground_color", (event, opts) => next_foreground_color(opts));
electron.ipcRenderer.on("previous_background_colour", (event, opts) => previous_background_colour(opts));
electron.ipcRenderer.on("next_background_color", (event, opts) => next_background_color(opts));
electron.ipcRenderer.on("deselect", (event, opts) => deselect(opts));
electron.ipcRenderer.on("select_all", (event, opts) => select_all(opts));
electron.ipcRenderer.on("copy_block", (event, opts) => copy_block(opts));
electron.ipcRenderer.on("move_block", (event, opts) => move_block(opts));
electron.ipcRenderer.on("stamp", (event, opts) => stamp(opts));
electron.ipcRenderer.on("rotate", (event, opts) => rotate(opts));
electron.ipcRenderer.on("flip_x", (event, opts) => flip_x(opts));
electron.ipcRenderer.on("flip_y", (event, opts) => flip_y(opts));
electron.ipcRenderer.on("center", (event, opts) => center(opts));
electron.ipcRenderer.on("cut", (event, opts) => cut(opts));
electron.ipcRenderer.on("copy", (event, opts) => copy(opts));
electron.ipcRenderer.on("paste", (event, opts) => paste(opts));
electron.ipcRenderer.on("delete_selection", (event, opts) => delete_selection(opts));
electron.ipcRenderer.on("undo", (event, opts) => undo(opts));
electron.ipcRenderer.on("redo", (event, opts) => redo(opts));
electron.ipcRenderer.on("use_attribute_under_cursor", (event, opts) => use_attribute_under_cursor(opts));
electron.ipcRenderer.on("default_color", (event, opts) => default_color(opts));
electron.ipcRenderer.on("switch_foreground_background", (event, opts) => switch_foreground_background(opts));
electron.ipcRenderer.on("open_reference_image", (event, opts) => open_reference_image(opts));
electron.ipcRenderer.on("toggle_reference_image", (event, opts) => toggle_reference_image(opts));
electron.ipcRenderer.on("clear_reference_image", (event, opts) => clear_reference_image(opts));
electron.ipcRenderer.on("zoom_in", (event, opts) => zoom_in(opts));
electron.ipcRenderer.on("zoom_out", (event, opts) => zoom_out(opts));
electron.ipcRenderer.on("actual_size", (event, opts) => actual_size(opts));
electron.ipcRenderer.on("f_key", (event, opts) => f_key(opts));
electron.ipcRenderer.on("place", (event, opts) => place(opts));
electron.ipcRenderer.on("get_canvas_size", (event, opts) => get_canvas_size(opts));
electron.ipcRenderer.on("set_canvas_size", (event, opts) => set_canvas_size(opts));
electron.ipcRenderer.on("get_sauce_info", (event, opts) => get_sauce_info(opts));
electron.ipcRenderer.on("set_sauce_info", (event, opts) => set_sauce_info(opts));
electron.ipcRenderer.on("new_document", (event, opts) => new_document(opts));
electron.ipcRenderer.on("change_to_select_mode", (event, opts) => change_to_select_mode(opts));
electron.ipcRenderer.on("change_to_brush_mode", (event, opts) => change_to_brush_mode(opts));
electron.ipcRenderer.on("change_to_line_mode", (event, opts) => change_to_line_mode(opts));
electron.ipcRenderer.on("change_to_rectangle_mode", (event, opts) => change_to_rectangle_mode(opts));
electron.ipcRenderer.on("change_to_fill_mode", (event, opts) => change_to_fill_mode(opts));
electron.ipcRenderer.on("change_to_sample_mode", (event, opts) => change_to_sample_mode(opts));
electron.ipcRenderer.on("connect_to_server", (event, opts) => connect_to_server(opts));
electron.ipcRenderer.on("nick", (event, {value}) => nick = value);
electron.ipcRenderer.on("group", (event, {value}) => group = value);
electron.ipcRenderer.on("use_flashing_cursor", (event, {value}) => cursor.set_flashing(value));
electron.ipcRenderer.on("use_numpad", (event, {value}) => use_numpad = value);
electron.ipcRenderer.on("use_backup", (event, {value}) => use_backup(value));
electron.ipcRenderer.on("backup_folder", (event, {value}) => backup_folder = value);
electron.ipcRenderer.on("chat_window_toggle", (event, opts) => chat_window_toggle(opts));
electron.ipcRenderer.on("crop", (event, opts) => crop(opts));

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("ice_colors_toggle").addEventListener("mousedown", (event) => ice_colors(!doc.ice_colors), true);
    document.getElementById("use_9px_font_toggle").addEventListener("mousedown", (event) => use_9px_font(!doc.use_9px_font), true);
    document.getElementById("dimensions").addEventListener("mousedown", (event) => get_canvas_size(), true);
    const canvas_container = document.getElementById("canvas_container");
    canvas_container.addEventListener("mousedown", mouse_down, true);
    canvas_container.addEventListener("mousemove", mouse_move, true);
    canvas_container.addEventListener("mouseup", mouse_up, true);
    canvas_container.addEventListener("mouseout", mouse_out, true);
    document.getElementById("select_mode").addEventListener("mousedown", (event) => change_to_select_mode(), true);
    document.getElementById("brush_mode").addEventListener("mousedown", (event) => change_to_brush_mode(), true);
    document.getElementById("line_mode").addEventListener("mousedown", (event) => change_to_line_mode(), true);
    document.getElementById("rectangle_mode").addEventListener("mousedown", (event) => change_to_rectangle_mode(), true);
    document.getElementById("fill_mode").addEventListener("mousedown", (event) => change_to_fill_mode(), true);
    document.getElementById("sample_mode").addEventListener("mousedown", (event) => change_to_sample_mode(), true);
    const chat_input = document.getElementById("chat_input");
    chat_input.addEventListener("focus", (event) => send("chat_input_focus"), true);
    chat_input.addEventListener("blur", (event) => send("chat_input_blur"), true);
}, true);
