const actions =  {CONNECTED: 0, REFUSED: 1, JOIN: 2, LEAVE: 3, CURSOR: 4, SELECTION: 5, RESIZE_SELECTION: 6, OPERATION: 7, HIDE_CURSOR: 8, DRAW: 9, CHAT: 10, STATUS: 11, SAUCE: 12, ICE_COLORS: 13, USE_9PX_FONT: 14, CHANGE_FONT: 15, SET_CANVAS_SIZE: 16};
const statuses = {ACTIVE: 0, IDLE: 1, AWAY: 2};
const {uncompress} = require("../libtextmode/libtextmode");
const queued_events = [];
const {on} = require("../senders");
let nick, group, web, host, path, pass, ws, idle_timer, away_timer, status;
let ready = false;

// function send(ws, type, is_viewing, data = {}) {
//     ws.send(JSON.stringify({type, data}));
//     if (!is_viewing && type != action.CONNECTED) set_status(ws, data.id, status_types.ACTIVE);
//     if (idle_timer) clearTimeout(idle_timer);
//     if (away_timer) clearTimeout(away_timer);
//     if (!is_viewing) {
//         idle_timer = setTimeout(() => {
//             set_status(ws, data.id, status_types.IDLE);
//             away_timer = setTimeout(() => set_status(ws, data.id, status_types.AWAY), 4 * 60 * 1000);
//         }, 1 * 60 * 1000);
//     }
// }

function queue(name, opts, network_handler) {
    if (ready) {
        network_handler[name](...opts);
    } else {
        queued_events.push({name, opts, network_handler});
    }
}

function message(is_viewing, server, pass, ws, msg, network_handler) {
    byte_count += JSON.stringify(msg).length;
    // console.log(`${byte_count / 1024}kb received.`, msg.data);
    switch (msg.type) {
    case action.CONNECTED:
        const id = msg.data.id;
        status = msg.data.status;
        network_handler.connected({
            server, pass, id,
            draw: (x, y, block) => {
                send(ws, action.DRAW, is_viewing, {id, x, y, block});
            },
            cursor: (x, y) => send(ws, action.CURSOR, is_viewing, {id, x, y}),
            selection: (x, y) => send(ws, action.SELECTION, is_viewing, {id, x, y}),
            resize_selection: (columns, rows) => send(ws, action.RESIZE_SELECTION, is_viewing, {id, columns, rows}),
            operation: (x, y) => send(ws, action.OPERATION, is_viewing, {id, x, y}),
            chat: (nick, group, text) => {
                send(ws, action.CHAT, is_viewing, {id, nick, group, text});
                network_handler.chat(id, nick, group, text);
            },
            status: (status) => send(ws, action.STATUS, is_viewing, {id, status}),
            sauce: (title, author, group, comments) => send(ws, action.SAUCE, is_viewing, {id, title, author, group, comments}),
            ice_colors: (value) => send(ws, action.ICE_COLORS, is_viewing, {id, value}),
            use_9px_font: (value) => send(ws, action.USE_9PX_FONT, is_viewing, {id, value}),
            change_font: (font_name) => send(ws, action.CHANGE_FONT, is_viewing, {id, font_name}),
            set_canvas_size: (columns, rows) => send(ws, action.SET_CANVAS_SIZE, is_viewing, {id, columns, rows}),
            hide_cursor: () => send(ws, action.HIDE_CURSOR, is_viewing, {id}),
            close: () => ws.close(),
            users: msg.data.users
        }, uncompress(msg.data.doc), msg.data.chat_history, msg.data.status);
        break;
    case action.REFUSED:
        network_handler.refused();
        break;
    case action.JOIN:
        queue("join", [msg.data.id, msg.data.nick, msg.data.group, msg.data.status], network_handler);
        break;
    case action.LEAVE:
        queue("leave", [msg.data.id], network_handler);
        break;
    case action.CURSOR:
        queue("cursor", [msg.data.id, msg.data.x, msg.data.y], network_handler);
        break;
    case action.SELECTION:
        queue("selection", [msg.data.id, msg.data.x, msg.data.y], network_handler);
        break;
    case action.RESIZE_SELECTION:
        queue("resize_selection", [msg.data.id, msg.data.columns, msg.data.rows], network_handler);
        break;
    case action.OPERATION:
        queue("operation", [msg.data.id, msg.data.x, msg.data.y], network_handler);
        break;
    case action.HIDE_CURSOR:
        queue("hide_cursor", [msg.data.id], network_handler);
        break;
    case action.DRAW:
        queue("draw", [msg.data.id, msg.data.x, msg.data.y, msg.data.block], network_handler);
        break;
    case action.CHAT:
        queue("chat", [msg.data.id, msg.data.nick, msg.data.group, msg.data.text], network_handler);
        break;
    case action.STATUS:
        queue("status", [msg.data.id, msg.data.status], network_handler);
        break;
    case action.SAUCE:
        queue("sauce", [msg.data.id, msg.data.title, msg.data.author, msg.data.group, msg.data.comments], network_handler);
        break;
    case action.ICE_COLORS:
        queue("ice_colors", [msg.data.id, msg.data.value], network_handler);
        break;
    case action.USE_9PX_FONT:
        queue("use_9px_font", [msg.data.id, msg.data.value], network_handler);
        break;
    case action.CHANGE_FONT:
        queue("change_font", [msg.data.id, msg.data.font_name], network_handler);
        break;
    case action.SET_CANVAS_SIZE:
        queue("set_canvas_size", [msg.data.id, msg.data.columns, msg.data.rows], network_handler);
        break;
    default:
        break;
    }
}

async function connect(server, nick, group, pass, network_handler) {
    try {
        // const re = (/(?<server>[^\/]+)\/?(?<path>[^\/]*)\/?/);
        const {host, path} =  /(?<server>[^\/]+)\/?(?<path>[^\/]*)\/?/.exec(server);
        const match = server.match(/(?<server>[^\/]+)\/?(?<path>[^\/]*)\/?/);
        const ws = new WebSocket(`ws://${encodeURI(match[1])}:8000/${encodeURI(match[2])}`);
        const is_viewing = (nick == undefined);
        ws.addEventListener("open", () => send(ws, action.CONNECTED, is_viewing, {nick, group, pass}));
        ws.addEventListener("error", network_handler.error);
        ws.addEventListener("close", network_handler.disconnected);
        ws.addEventListener("message", response => message(is_viewing, server, pass, ws, JSON.parse(response.data), network_handler));
    } catch (err) {
        network_handler.error(err);
    }
}

function ready_to_receive_events() {
    for (const event of queued_events) event.network_handler[event.name](...event.opts);
    ready = true;
}

// send_sync("show_connecting_modal");
// network.connect(server, (nick == "") ? "Anonymous" : nick, group, pass, {
//     connected: (new_connection, new_doc, chat_history, status) => {
//         connection = new_connection;
//         cursor.connection = connection;
//         doc = new_doc;
//         send("close_modal");
//         start_render().then(() => {
//             start_editing_mode();
//             ui.change_mode(ui.modes.SELECT);
//             for (const user of connection.users) {
//                 users[user.id] = {nick: user.nick, group: user.group};
//                 if (user.nick == undefined) {
//                     chat.join(user.id, "Guest", "", user.status, false);
//                 } else {
//                     users[user.id].cursor = new canvas.Cursor(false);
//                     users[user.id].cursor.resize_to_font();
//                     users[user.id].cursor.appear_ghosted();
//                     users[user.id].cursor.show();
//                     chat.join(user.id, user.nick, user.group, user.status, false);
//                 }
//             }
//             chat.show();
//             send("enable_chat_window_toggle");
//             for (const line of chat_history) chat.chat(line.id, line.nick, line.group, line.text, goto_line);
//             chat.join(connection.id, nick, group, status);
//             network.ready_to_receive_events();
//             if (doc.comments) chat.welcome(doc.comments.split("\n")[0].replace(/ +$/, ""), goto_line);
//         });
//     },
//     error: () => {},
//     disconnected: () => {
//         send("close_modal");
//         chat.clear_users();
//         for (const id of Object.keys(users)) {
//             if (users[id].cursor) users[id].cursor.hide();
//             delete users[id];
//         }
//         chat.disconnected();
//         const choice = electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {message: "Connect to Server", detail: "Cannot connect to server.", buttons: ["Retry", "Cancel"], defaultId: 0, cancelId: 1});
//         if (choice == 0) {
//             connect_to_server({server, pass});
//         } else {
//             send_sync("destroy");
//         }
//     },
//     refused: () => {
//         send("close_modal");
//         electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {type: "error", message: "Connect to Server", detail: "Wrong password!"});
//         send("destroy");
//     },
//     join: (id, nick, group, status) => {
//         users[id] = {nick, group, status};
//         if (nick != undefined) {
//             users[id].cursor = new canvas.Cursor(false);
//             users[id].cursor.resize_to_font();
//             users[id].cursor.appear_ghosted();
//             users[id].cursor.show();
//             chat.join(id, users[id].nick, users[id].group, users[id].status);
//             if (process.platform == "darwin") electron.remote.app.dock.bounce("informational");
//         } else {
//             chat.join(id, "Guest", "", users[id].status, false);
//         }
//     },
//     leave: (id) => {
//         if (users[id]) {
//             if (users[id].nick != undefined) users[id].cursor.hide();
//             chat.leave(id, users[id].nick != undefined);
//             delete users[id];
//         }
//     },
//     cursor: (id, x, y) => {
//         if (users[id]) {
//             if (users[id].cursor.hidden) users[id].cursor.show();
//             if (users[id].cursor.mode != cursor.modes.EDITING) users[id].cursor.stop_using_selection_border();
//             users[id].cursor.move_to(x, y, false);
//         }
//     },
//     selection: (id, x, y) => {
//         if (users[id]) {
//             if (users[id].cursor.mode != cursor.modes.SELECTION) users[id].cursor.start_using_selection_border();
//             users[id].cursor.move_to(x, y, false);
//         }
//     },
//     resize_selection: (id, columns, rows) => {
//         if (users[id]) users[id].cursor.resize_selection(columns, rows);
//     },
//     operation: (id, x, y) => {
//         if (users[id]) {
//             if (users[id].cursor.mode != cursor.modes.OPERATION) users[id].cursor.mode = cursor.modes.OPERATION;
//             users[id].cursor.move_to(x, y, false);
//         }
//     },
//     hide_cursor: (id) => {
//         if (users[id]) users[id].cursor.hide();
//     },
//     draw: (id, x, y, block) => {
//         if ((x < doc.columns) && (y < doc.rows)) {
//             const i = doc.columns * y + x;
//             doc.data[i] = Object.assign(block);
//             render_at(x, y);
//         }
//     },
//     chat: (id, nick, group, text) => {
//         chat.chat(id, nick, group, text, goto_line);
//     },
//     status: (id, status) => {
//         chat.status(id, status);
//     },
//     sauce: (id, title, author, group, comments) => {
//         doc.title = title;
//         doc.author = author;
//         doc.group = group;
//         doc.comments = comments;
//         send("update_sauce", {title, author, group, comments});
//         chat.updated_sauce(id);
//     },
//     ice_colors: (id, value) => {
//         doc.ice_colors = value;
//         if (doc.ice_colors) {
//             canvas.stop_blinking();
//         } else {
//             canvas.start_blinking();
//         }
//         ui.update_status_bar(insert_mode, doc);
//         ui.update_menu_checkboxes(insert_mode, doc);
//         chat.changed_ice_colors(id, doc.ice_colors);
//     },
//     use_9px_font: (id, value) => {
//         doc.use_9px_font = value;
//         start_render();
//         chat.changed_use_9px_font(id, doc.use_9px_font);
//     },
//     change_font: (id, font_name) => {
//         doc.font_name = font_name;
//         start_render();
//         chat.changed_font(id, doc.font_name);
//     },
//     set_canvas_size: (id, columns, rows) => {
//         undo_history.reset_undos();
//         libtextmode.resize_canvas(doc, columns, rows);
//         cursor.move_to(Math.min(cursor.x, columns - 1), Math.min(cursor.y, rows - 1), true);
//         start_render();
//         chat.set_canvas_size(id, columns, rows);
//     }
// });

function set_status(id, new_status) {
    if (status != new_status) {
        status = new_status;
        ws.send(JSON.stringify({type: action.STATUS, data: {id, status}}));
    }
}

function send(type, data = {}) {
    ws.send(JSON.stringify({type, data}));
    if (!web && type != action.CONNECTED) set_status(data.id, status_types.ACTIVE);
    if (idle_timer) clearTimeout(idle_timer);
    if (away_timer) clearTimeout(away_timer);
    if (!is_viewing) {
        idle_timer = setTimeout(() => {
            set_status(ws, data.id, status_types.IDLE);
            away_timer = setTimeout(() => set_status(data.id, status_types.AWAY), 4 * 60 * 1000);
        }, 1 * 60 * 1000);
    }
}

async function connect(server, pass, from_web = false) {
    try {
        const {groups} = (/(?<host>[^\/]+)\/?(?<path>[^\/]*)\/?/).exec(server);
        host = groups.host;
        path = groups.path;
        web = from_web;
        ws = new WebSocket(`ws://${encodeURI(groups.host)}:8000/${encodeURI(groups.path)}`);
        ws.addEventListener("open", () => send(actions.CONNECTED, {nick, group, pass}));
        ws.addEventListener("error", error);
        ws.addEventListener("close", disconnected);
        ws.addEventListener("message", message);
    } catch (err) {
        error(err);
    }
}

module.exports = {connect, ready_to_receive_events};

on("nick", (event, value) => nick = value);
on("group", (event, value) => group = value);