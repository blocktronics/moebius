const action =  {CONNECTED: 0, REFUSED: 1, JOIN: 2, LEAVE: 3, CURSOR: 4, SELECTION: 5, RESIZE_SELECTION: 6, OPERATION: 7, HIDE_CURSOR: 8, DRAW: 9, CHAT: 10};
let byte_count = 0;

function send(ws, type, data = {}) {
    ws.send(JSON.stringify({type, data}));
}

function message(ws, msg, network_handler) {
    byte_count += JSON.stringify(msg).length;
    // console.log(`${byte_count / 1024}kb received.`, msg.data);
    switch (msg.type) {
    case action.CONNECTED:
        const id = msg.data.id;
        network_handler.connected({
            id,
            draw: (x, y, block) => {
                send(ws, action.DRAW, {id, x, y, block});
            },
            cursor: (x, y) => send(ws, action.CURSOR, {id, x, y}),
            selection: (x, y) => send(ws, action.SELECTION, {id, x, y}),
            resize_selection: (columns, rows) => send(ws, action.RESIZE_SELECTION, {id, columns, rows}),
            operation: (x, y) => send(ws, action.OPERATION, {id, x, y}),
            chat: (nick, text) => {
                send(ws, action.CHAT, {id, nick, text});
                network_handler.chat(nick, text);
            },
            hide_cursor: () => send(ws, action.HIDE_CURSOR, {id}),
            close: () => ws.close(),
            users: msg.data.users
        }, msg.data.doc, msg.data.chat_history);
        break;
    case action.REFUSED:
        network_handler.refused();
        break;
    case action.JOIN:
        network_handler.join(msg.data.id, msg.data.nick);
        break;
    case action.LEAVE:
        network_handler.leave(msg.data.id);
        break;
    case action.CURSOR:
        network_handler.cursor(msg.data.id, msg.data.x, msg.data.y);
        break;
    case action.SELECTION:
        network_handler.selection(msg.data.id, msg.data.x, msg.data.y);
        break;
    case action.RESIZE_SELECTION:
        network_handler.resize_selection(msg.data.id, msg.data.columns, msg.data.rows);
        break;
    case action.OPERATION:
        network_handler.operation(msg.data.id, msg.data.x, msg.data.y);
        break;
    case action.HIDE_CURSOR:
        network_handler.hide_cursor(msg.data.id);
        break;
    case action.DRAW:
        network_handler.draw(msg.data.id, msg.data.x, msg.data.y, msg.data.block);
        break;
    case action.CHAT:
        network_handler.chat(msg.data.nick, msg.data.text);
        break;
    default:
        break;
    }
}

async function connect(ip, nick, pass, network_handler) {
    try {
        const ws = new WebSocket(`ws://${ip}:8000/`);
        ws.addEventListener("open", () => send(ws, action.CONNECTED, {nick, pass}));
        ws.addEventListener("error", network_handler.error);
        ws.addEventListener("close", network_handler.disconnected);
        ws.addEventListener("message", response => message(ws, JSON.parse(response.data), network_handler));
    } catch (err) {
        network_handler.error(err);
    }
}

module.exports = {connect};
