const action =  {CONNECTED: 0, REFUSED: 1, JOIN: 2, LEAVE: 3, CURSOR: 4, SELECTION: 5, RESIZE_SELECTION: 6, OPERATION: 7, HIDE_CURSOR: 8, DRAW: 9, CHAT: 10, STATUS: 11, SAUCE: 12, ICE_COLORS: 13, USE_9PX_FONT: 14, CHANGE_FONT: 15, SET_CANVAS_SIZE: 16};
const status_types = {ACTIVE: 0, IDLE: 1, AWAY: 2};
const libtextmode = require("../js/libtextmode/libtextmode");
let byte_count = 0;
let idle_timer, away_timer, status;
let ready = false;
const queued_events = [];

function set_status(ws, id, new_status) {
    if (status != new_status) {
        status = new_status;
        ws.send(JSON.stringify({type: action.STATUS, data: {id, status}}));
    }
}

function send(ws, type, is_viewing, data = {}) {
    ws.send(JSON.stringify({type, data}));
    if (!is_viewing && type != action.CONNECTED) set_status(ws, data.id, status_types.ACTIVE);
    if (idle_timer) clearTimeout(idle_timer);
    if (away_timer) clearTimeout(away_timer);
    if (!is_viewing) {
        idle_timer = setTimeout(() => {
            set_status(ws, data.id, status_types.IDLE);
            away_timer = setTimeout(() => set_status(ws, data.id, status_types.AWAY), 4 * 60 * 1000);
        }, 1 * 60 * 1000);
    }
}

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
        }, libtextmode.uncompress(msg.data.doc), msg.data.chat_history, msg.data.status);
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
        const match = server.match(/([^\/]+)\/?([^\/]*)\/?/);
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

module.exports = {connect, ready_to_receive_events};
