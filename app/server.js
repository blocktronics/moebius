const ws = require("ws");
const libtextmode = require("./libtextmode/libtextmode");
const action =  {CONNECTED: 0, REFUSED: 1, JOIN: 2, LEAVE: 3, CURSOR: 4, SELECTION: 5, RESIZE_SELECTION: 6, OPERATION: 7, HIDE_CURSOR: 8, DRAW: 9, CHAT: 10, STATUS: 11, SAUCE: 12, ICE_COLORS: 13, USE_9PX_FONT: 14, CHANGE_FONT: 15, SET_CANVAS_SIZE: 16};
const status_types = {ACTIVE: 0, IDLE: 1, AWAY: 2, WEB: 3};
const os = require("os");
const url = require("url");
const server = require("http").createServer();
const joints = {};
const path = require("path");
const {HourlySaver} = require("./hourly_saver");
let hourly_saver;

function send(ws, type, data = {}) {
    ws.send(JSON.stringify({type, data}));
}

class Joint {
    log(text) {
        if (!this.quiet) console.log(`${new Date().toISOString()} ${this.hostname}${this.path}: ${text}`);
    }

    send_all(sender, type, opts = {}) {
        for (const data of this.data_store) {
            if (!data.closed && data.user.nick != undefined && data.ws != sender) send(data.ws, type, opts);
        }
    }

    send_all_including_self(type, opts = {}) {
        for (const data of this.data_store) {
            if (!data.closed && data.user.nick != undefined) send(data.ws, type, opts);
        }
    }

    send_all_including_guests(sender, type, opts = {}) {
        for (const data of this.data_store) {
            if (!data.closed && data.ws != sender) send(data.ws, type, opts);
        }
    }

    connected_users() {
        return this.data_store.filter((data) => !data.closed).map((data) => data.user);
    }

    message(ws, msg) {
        switch (msg.type) {
        case action.CONNECTED:
            if (msg.data.nick == undefined || this.pass == "" || msg.data.pass == this.pass) {
                const id = this.data_store.length;
                const users = this.connected_users();
                this.data_store.push({user: {nick: msg.data.nick, group: msg.data.group, id: id, status: (msg.data.nick == undefined) ? status_types.WEB : status_types.ACTIVE}, ws: ws, closed: false});
                if (msg.data.nick == undefined) {
                    send(ws, action.CONNECTED, {id, doc: libtextmode.compress(this.doc)});
                    this.log("web joined");
                } else {
                    send(ws, action.CONNECTED, {id, doc: libtextmode.compress(this.doc), users, chat_history: this.chat_history, status: status_types.ACTIVE});
                    this.log(`${msg.data.nick} has joined`);
                }
                this.send_all(ws, action.JOIN, {id, nick: msg.data.nick, group: msg.data.group, status: (msg.data.nick == undefined) ? status_types.WEB : status_types.ACTIVE});
            } else {
                send(ws, action.REFUSED);
                this.log(`${msg.data.nick} was refused`);
            }
        break;
        case action.DRAW:
            if ((msg.data.x < this.doc.columns) && (msg.data.y < this.doc.rows)) {
                this.doc.data[msg.data.y * this.doc.columns + msg.data.x] = Object.assign(msg.data.block);
                this.send_all_including_guests(ws, msg.type, msg.data);
            }
        break;
        case action.CHAT:
            if (this.data_store[msg.data.id].user.nick != msg.data.nick) this.data_store[msg.data.id].user.nick = msg.data.nick;
            if (this.data_store[msg.data.id].user.group != msg.data.group) this.data_store[msg.data.id].user.group = msg.data.group;
            this.chat_history.push({id: msg.data.id, nick: msg.data.nick, group: msg.data.group, text: msg.data.text, time: Date.now()});
            if (this.chat_history.length > 32) this.chat_history.shift();
            this.send_all(ws, msg.type, msg.data);
        break;
        case action.STATUS:
            this.data_store[msg.data.id].user.status = msg.data.status;
            this.send_all_including_self(msg.type, msg.data);
            break;
        case action.SAUCE:
            this.doc.title = msg.data.title;
            this.doc.author = msg.data.author;
            this.doc.group = msg.data.group;
            this.doc.comments = msg.data.comments;
            this.send_all_including_guests(ws, msg.type, msg.data);
            break;
        case action.ICE_COLORS:
            this.doc.ice_colors = msg.data.value;
            this.send_all_including_guests(ws, msg.type, msg.data);
            break;
        case action.USE_9PX_FONT:
            this.doc.use_9px_font = msg.data.value;
            this.send_all_including_guests(ws, msg.type, msg.data);
            break;
        case action.CHANGE_FONT:
            this.doc.font_name = msg.data.font_name;
            this.send_all_including_guests(ws, msg.type, msg.data);
            break;
        case action.SET_CANVAS_SIZE:
            libtextmode.resize_canvas(this.doc, msg.data.columns, msg.data.rows);
            this.send_all_including_guests(ws, msg.type, msg.data);
            break;
        default:
            this.send_all(ws, msg.type, msg.data);
        }
    }

    save(file = this.file) {
        libtextmode.write_file(this.doc, file);
    }

    constructor({path, file, pass, quiet = false}) {
        this.path = path;
        this.file = file;
        this.pass = pass;
        this.quiet = quiet;
        this.data_store = [];
        this.chat_history = [];
        hourly_saver = new HourlySaver();
        hourly_saver.start();
        hourly_saver.on("save", () => {
            const file = hourly_saver.filename("./", this.file);
            this.save(file);
            if (hourly_saver.keep_if_changes(file)) this.log(`saved backup as ${file}`);
        });
    }

    connection(ws) {
        ws.on("message", msg => this.message(ws, JSON.parse(msg)));
        ws.on("close", () => {
            for (let id = 0; id < this.data_store.length; id++) {
                if (this.data_store[id].ws == ws) {
                    this.data_store[id].closed = true;
                    const user = this.data_store[id].user;
                    if (user.nick == undefined) {
                        this.log("web left");
                    } else {
                        this.log(`${user.nick} has left`);
                    }
                    this.send_all(ws, action.LEAVE, {id: user.id});
                }
            }
        });
    }

    async start() {
        this.hostname = os.hostname();
        this.doc = await libtextmode.read_file(this.file);
        this.wss = new ws.Server({noServer: true});
        this.log(`started`);
        hourly_saver.start();
    }

    close() {
        for (const data of this.data_store) {
            if (!data.closed) data.ws.close();
        }
        this.wss.close();
        hourly_saver.stop();
        this.save();
    }
}

async function start_joint({path: server_path, file, pass = "", quiet = false} = {}) {
    server_path = (server_path != undefined) ? server_path : path.parse(file).base;
    server_path = `/${server_path.toLowerCase()}`;
    if (!server.address()) server.listen(8000);
    if (joints[server_path]) throw "Path already in use.";
    server_path = server_path.toLowerCase();
    joints[server_path] = new Joint({path: server_path, file, pass, quiet});
    await joints[server_path].start();
    return server_path;
}

function end_joint(path) {
    if (joints[path]) {
        joints[path].close();
        delete joints[path];
    }
}

server.on("upgrade", (req, socket, head) => {
    const path = decodeURI(url.parse(req.url).pathname).toLowerCase();
    if (joints[path]) {
        joints[path].wss.handleUpgrade(req, socket, head, (ws) => joints[path].connection(ws));
    } else {
        socket.destroy();
    }
});

function has_joint(path) {
    return joints[path] != undefined;
}

function close() {
    for (const path of Object.keys(joints)) end_joint(path);
    if (server.address()) server.close();
}

module.exports = {close, start_joint, end_joint, has_joint};
