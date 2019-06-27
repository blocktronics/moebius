const libtextmode = require("../libtextmode/libtextmode");
const events = require("events");
let doc, render;
const actions =  {CONNECTED: 0, REFUSED: 1, JOIN: 2, LEAVE: 3, CURSOR: 4, SELECTION: 5, RESIZE_SELECTION: 6, OPERATION: 7, HIDE_CURSOR: 8, DRAW: 9, CHAT: 10, STATUS: 11, SAUCE: 12, ICE_COLORS: 13, USE_9PX_FONT: 14, CHANGE_FONT: 15, SET_CANVAS_SIZE: 16, PASTE_AS_SELECTION: 17, ROTATE: 18, FLIP_X: 19, FLIP_Y: 20};
let connection;

class Connection extends events.EventEmitter {
    open() {
        this.ws.send(JSON.stringify({type: actions.CONNECTED, data: {nick: undefined, group: undefined, pass: ""}}));
    }

    disconnected()  {
        this.connected = false;
        this.emit("disconnected");
    }

    message(message) {
        const {type, data} = message;
        if (!this.ready) {
            if (type == actions.CONNECTED) {
                this.connected = true;
                this.id = data.id;
                this.status = data.status;
                this.ready = true;
                this.emit("connected", libtextmode.uncompress(data.doc));
                for (const message of this.queued_messages) this.message(message);
                this.ws.addEventListener("close", () => this.disconnected());
            } else if (type == actions.REFUSED) {
                this.emit("refused");
            } else {
                this.queued_messages.push(message);
            }
        } else {
            switch (type) {
                case actions.DRAW:
                    doc.data[data.y * doc.columns + data.x] = Object.assign(data.block);
                    libtextmode.render_at(render, data.x, data.y, data.block);
                    break;
                case actions.SAUCE:
                    this.emit("sauce", data.title, data.author, data.group, data.comments);
                    break;
                case actions.ICE_COLORS:
                    this.emit("ice_colors", data.value);
                    break;
                case actions.USE_9PX_FONT:
                    this.emit("use_9px_font", data.value);
                    break;
                case actions.CHANGE_FONT:
                    this.emit("change_font", data.font_name);
                    break;
                case actions.SET_CANVAS_SIZE:
                    this.emit("set_canvas_size", data.columns, data.rows);
                    break;
            }
        }
    }

    constructor(server, pass, web = false) {
        super();
        this.connected = false;
        this.server = server;
        this.pass = pass;
        try {
            const {groups} = (/(?<host>[^\/]+)\/?(?<path>[^\/]*)\/?/).exec(server);
            this.host = groups.host;
            this.path = groups.path;
            this.web = web;
            this.queued_messages = [];
            this.ready = false;
            this.ws = new WebSocket(`ws://${encodeURI(groups.host)}:8000/${encodeURI(groups.path)}`);
            this.ws.addEventListener("open", () => this.open(pass));
            this.ws.addEventListener("error", () => this.emit("unable_to_connect"));
            this.ws.addEventListener("message", (resp) => this.message(JSON.parse(resp.data)));
        } catch (err) {
            this.emit("unable_to_connect");
        }
    }
}

class TextModeDoc extends events.EventEmitter {
    async start_rendering() {
        render = await libtextmode.render_split(doc);
        this.emit("render");
    }

    ready() {
        if (!this.init) {
            this.emit("ready");
            this.init = true;
        }
    }

    connect_to_server(server, pass) {
        this.emit("connecting");
        connection = new Connection(server, pass);
        connection.on("connected", async (remote_doc) => {
            this.emit("connected");
            doc = remote_doc;
            await this.start_rendering();
            this.emit("new_document");
            this.ready();
        });
        connection.on("refused", () => this.emit("refused"));
        connection.on("disconnected", () => this.emit("disconnected"));
        connection.on("unable_to_connect", () => this.emit("unable_to_connect"));
        connection.on("ice_colors", (value) => {
            doc.ice_colors = value;
            this.emit("ice_colors", doc.ice_colors);
        });
        connection.on("use_9px_font", (value) => {
            doc.use_9px_font = value;
            this.start_rendering().then(() => this.emit("use_9px_font", doc.use_9px_font));
        });
        connection.on("change_font", (font_name) => {
            doc.font_name = font_name;
            this.start_rendering().then(() => this.emit("change_font", doc.font_name));
        });
        connection.on("sauce", (title, author, group, comments) => {
            doc.title = title;
            doc.author = author;
            doc.group = group;
            doc.comments = comments;
            this.emit("sauce", title, author, group, comments);
        });
        connection.on("set_canvas_size", (columns, rows) => {
            this.undo_history.reset_undos();
            libtextmode.resize_canvas(doc, columns, rows);
            this.start_rendering();
        });
    }

    get connection() {return connection;}
    get render() {return render;}
    get font() {return render.font;}
    get columns() {return doc.columns;}
    get rows() {return doc.rows;}
    get title() {return doc.title;}
    get author() {return doc.author;}
    get group() {return doc.group;}
    get comments() {return doc.comments;}
    get palette() {return doc.palette;}
    get font_name() {return doc.font_name;}
    get ice_colors() {return doc.ice_colors;}
    get use_9px_font() {return doc.use_9px_font;}
    get data() {return doc.data;}

    constructor() {
        super();
        this.init = false;
    }
}

module.exports = new TextModeDoc();
