const CONNECTED = 0;
const REFUSED = 1;
const JOIN = 2;
const LEAVE = 3;
const CURSOR = 4;
const DRAW = 5;
const CHAT = 6;
let byte_count = 0;

function send(ws, type, data = {}) {
    ws.send(JSON.stringify({type, data}));
}

function message(ws, msg, network_handler) {
    byte_count += JSON.stringify(msg).length;
    // console.log(`${byte_count / 1024}kb received.`);
    switch (msg.type) {
    case CONNECTED:
        const id = msg.data.id;
        network_handler.connected({
            id,
            draw: (x, y, block) => send(ws, DRAW, {id, x, y, block}),
            cursor: (x, y) => send(ws, CURSOR, {id, x, y}),
            close: () => ws.close(),
            users: msg.data.users
        }, msg.data.doc);
        break;
    case REFUSED:
        network_handler.refused();
        break;
    case JOIN:
        console.log(msg.data);
        network_handler.join(msg.data.id, msg.data.nick);
        break;
    case LEAVE:
        network_handler.leave(msg.data.id);
        break;
    case CURSOR:
        network_handler.cursor(msg.data.id, msg.data.x, msg.data.y);
        break;
    case DRAW:
        network_handler.draw(msg.data.id, msg.data.x, msg.data.y, msg.data.block);
        break;
    case CHAT:
        network_handler.chat(msg.data.id, msg.data.text);
        break;
    default:
        break;
    }
}

async function connect(ip, port, nick, pass, network_handler) {
    const ws = new WebSocket(`ws://${ip}:${port}`);
    ws.addEventListener("open", () => send(ws, CONNECTED, {nick, pass}));
    ws.addEventListener("error", network_handler.error);
    ws.addEventListener("close", network_handler.disconnected);
    ws.addEventListener("message", response => message(ws, JSON.parse(response.data), network_handler));
}

module.exports = {connect};
