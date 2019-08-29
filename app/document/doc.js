const libtextmode = require("../libtextmode/libtextmode");
const {on, send} = require("../senders");
const events = require("events");
const chat = require("./ui/chat");
let doc, render;
const actions =  {CONNECTED: 0, REFUSED: 1, JOIN: 2, LEAVE: 3, CURSOR: 4, SELECTION: 5, RESIZE_SELECTION: 6, OPERATION: 7, HIDE_CURSOR: 8, DRAW: 9, CHAT: 10, STATUS: 11, SAUCE: 12, ICE_COLORS: 13, USE_9PX_FONT: 14, CHANGE_FONT: 15, SET_CANVAS_SIZE: 16, PASTE_AS_SELECTION: 17, ROTATE: 18, FLIP_X: 19, FLIP_Y: 20};
const statuses = {ACTIVE: 0, IDLE: 1, AWAY: 2, WEB: 3};
const modes = {EDITING: 0, SELECTION: 1, OPERATION: 2};
let nick, group;
let connection;
const SIXTEEN_COLORS_API_KEY = "mirebitqv2ualog65ifv2p1a5076soh9";
let retention = "8035200";
const undo_types = {INDIVIDUAL: 0, RESIZE: 1, INSERT_ROW: 2, DELETE_ROW: 3, INSERT_COLUMN: 4, DELETE_COLUMN: 5, SCROLL_CANVAS_UP: 6, SCROLL_CANVAS_DOWN: 7, SCROLL_CANVAS_LEFT: 8, SCROLL_CANVAS_RIGHT: 9};

on("nick", (event, value) => nick = value);
on("group", (event, value) => group = value);
on("retention", (event, value) => retention = value);

class NetworkCursor {
    draw() {
        const {font} = render;
        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.drawImage(render.ice_color_collection[Math.floor(this.y / render.maximum_rows)], this.x * font.width, (this.y % render.maximum_rows) * font.height, font.width, font.height, 0, 0, font.width, font.height);
        this.ctx.globalCompositeOperation = "difference";
        font.draw_cursor(this.ctx, 0, font.height - 2);
        this.ctx.clearRect(0, 0, this.canvas.width, font.height - 2);
    }

    reorientate_selection() {
        const [sx, dx] = (this.selection.dx < this.selection.sx) ? [this.selection.dx, this.selection.sx] : [this.selection.sx, this.selection.dx];
        const [sy, dy] = (this.selection.dy < this.selection.sy) ? [this.selection.dy, this.selection.sy] : [this.selection.sy, this.selection.dy];
        return {sx, sy, dx, dy};
    }

    move_to(x, y) {
        if (this.hidden) this.show();
        this.x = x;
        this.y = y;
        switch (this.mode) {
            case modes.EDITING:
                this.canvas.style.left = `${x * render.font.width}px`;
                this.canvas.style.top = `${y * render.font.height}px`;
                this.draw();
                break;
            case modes.SELECTION:
                this.selection.dx = x;
                this.selection.dy = y;
                const {sx, sy, dx, dy} = this.reorientate_selection();
                this.canvas.style.left = `${sx * render.font.width}px`;
                this.canvas.style.top = `${sy * render.font.height}px`;
                this.canvas.style.width = `${(dx - sx + 1) * render.font.width}px`;
                this.canvas.style.height = `${(dy - sy + 1) * render.font.height}px`;
                break;
            case modes.OPERATION:
                this.canvas.style.left = `${x * render.font.width}px`;
                this.canvas.style.top = `${y * render.font.height}px`;
                break;
        }
    }

    resize_cursor() {
        if (this.mode == modes.OPERATION) {
            this.set_operation_mode(this.operation_blocks);
        } else {
            this.draw();
        }
    }

    constructor() {
        this.mode = modes.EDITING;
        this.canvas = document.createElement("canvas");
        if (render) {
            this.canvas.width = render.font.width;
            this.canvas.height = render.font.height;
        }
        this.canvas.classList.add("ghosted");
        this.ctx = this.canvas.getContext("2d");
        this.x = 0;
        this.y = 0;
        this.selection = {sx: 0, sy: 0, dx: 0, dy: 0};
        this.hidden = true;
    }

    start_editing_mode() {
        this.canvas.classList.remove("selection");
        this.mode = modes.EDITING;
        this.canvas.width = render.font.width;
        this.canvas.height = render.font.height;
        this.canvas.style.width = `${this.canvas.width}px`;
        this.canvas.style.height = `${this.canvas.height}px`;
    }

    start_selection_mode() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.selection = {sx: this.x, sy: this.y, dx: 0, dy: 0};
        this.canvas.classList.add("selection");
        this.mode = modes.SELECTION;
    }

    set_operation_mode(blocks) {
        if (this.mode != modes.SELECTION) this.canvas.classList.add("selection");
        this.canvas.width = blocks.columns * render.font.width;
        this.canvas.height = blocks.rows * render.font.height;
        this.canvas.style.width = `${this.canvas.width}px`;
        this.canvas.style.height = `${this.canvas.height}px`;
        this.ctx.drawImage(libtextmode.render_blocks(blocks, render.font), 0, 0);
        this.operation_blocks = blocks;
        this.mode = modes.OPERATION;
    }

    start_operation_mode() {
        const {sx, sy, dx, dy} = this.reorientate_selection();
        this.set_operation_mode(libtextmode.get_blocks(doc, sx, sy, dx, dy));
    }

    paste_as_selection(blocks) {
        this.set_operation_mode(blocks);
    }

    show() {
        document.getElementById("editing_layer").appendChild(this.canvas);
        this.hidden = false;
        this.draw();
    }

    hide() {
        if (!this.hidden) {
            document.getElementById("editing_layer").removeChild(this.canvas);
            this.hidden = true;
        }
    }

    flip_x() {
        libtextmode.flip_x(this.operation_blocks);
        this.set_operation_mode(this.operation_blocks);
    }

    flip_y() {
        libtextmode.flip_y(this.operation_blocks);
        this.set_operation_mode(this.operation_blocks);
    }

    rotate() {
        libtextmode.rotate(this.operation_blocks);
        this.set_operation_mode(this.operation_blocks);
    }
}

class Connection extends events.EventEmitter {
    set_status(status) {
        if (this.status != status) {
            this.status = status;
            this.ws.send(JSON.stringify({type: actions.STATUS, data: {id: this.id, status}}));
        }
    }

    stop_away_timers() {
        if (this.idle_timer) clearTimeout(this.idle_timer);
        if (this.away_timer) clearTimeout(this.away_timer);
    }

    start_away_timers() {
        this.stop_away_timers();
        this.idle_timer = setTimeout(() => {
            this.set_status(statuses.IDLE);
            this.away_timer = setTimeout(() => this.set_status(statuses.AWAY), 4 * 60 * 1000);
        }, 1 * 60 * 1000);
    }

    send(type, data ={}) {
        data.id = this.id;
        this.ws.send(JSON.stringify({type, data}));
        if (!this.web && type != actions.CONNECTED) {
            this.set_status(statuses.ACTIVE);
            this.start_away_timers();
        }
    }

    open(pass) {
        this.ws.send(JSON.stringify({type: actions.CONNECTED, data: {nick, group, pass}}));
    }

    disconnected()  {
        this.stop_away_timers();
        this.connected = false;
        for (const id of Object.keys(this.users)) this.leave(id, false);
        this.emit("disconnected");
    }

    join(id, nick, group, status, show_join = true) {
        if (id == this.id || nick == undefined) {
            this.users[id] = {nick, group, status};
        } else {
            this.users[id] = {nick, group, status, cursor: new NetworkCursor()};
        }
        chat.join(id, nick, group, status, show_join);
    }

    leave(id, show_leave = true) {
        const user = this.users[id];
        if (user) {
            if (user.cursor) user.cursor.hide();
            chat.leave(id, show_leave);
            delete this.users[id];
        }
    }

    message(message) {
        const {type, data} = message;
        if (!this.ready) {
            if (type == actions.CONNECTED) {
                this.connected = true;
                this.id = data.id;
                this.status = data.status;
                this.users = {};
                chat.welcome(data.doc.comments, data.chat_history);
                for (const user of data.users) this.join(user.id, user.nick, user.group, user.status, false);
                this.join(data.id, nick, group, data.status);
                this.ready = true;
                this.emit("connected", libtextmode.uncompress(data.doc));
                for (const message of this.queued_messages) this.message(message);
                chat.show();
                this.ws.addEventListener("close", () => this.disconnected());
            } else if (type == actions.REFUSED) {
                this.emit("refused");
            } else {
                this.queued_messages.push(message);
            }
        } else {
            const user = this.users[data.id];
            switch (type) {
                case actions.JOIN:
                    this.join(data.id, data.nick, data.group, data.status);
                    break;
                case actions.LEAVE:
                    this.leave(data.id);
                    break;
                case actions.CURSOR:
                    if (user && user.cursor) {
                        if (user.cursor.mode != modes.EDITING) user.cursor.start_editing_mode();
                        user.cursor.move_to(data.x, data.y);
                    }
                    break;
                case actions.SELECTION:
                    if (user && user.cursor) {
                        if (user.cursor.mode != modes.SELECTION) user.cursor.start_selection_mode();
                        user.cursor.move_to(data.x, data.y);
                    }
                    break;
                case actions.OPERATION:
                    if (user && user.cursor) {
                        if (user.cursor.mode != modes.OPERATION) user.cursor.start_operation_mode();
                        user.cursor.move_to(data.x, data.y);
                    }
                    break;
                case actions.HIDE_CURSOR:
                    if (user && user.cursor) user.cursor.hide();
                    break;
                case actions.DRAW:
                    doc.data[data.y * doc.columns + data.x] = Object.assign(data.block);
                    libtextmode.render_at(render, data.x, data.y, data.block);
                    if (user) this.users[data.id].last_row = data.y;
                    break;
                case actions.CHAT:
                    if (user) chat.chat(data.id, data.nick, data.group, data.text, data.time);
                    break;
                case actions.STATUS:
                    if (user) chat.status(data.id, data.status);
                    break;
                case actions.SAUCE:
                    this.emit("sauce", data.title, data.group, data.author, data.comments);
                    chat.sauce(data.id);
                    break;
                case actions.ICE_COLORS:
                    this.emit("ice_colors", data.value);
                    chat.ice_colors(data.id, data.value);
                    break;
                case actions.USE_9PX_FONT:
                    this.emit("use_9px_font", data.value);
                    chat.use_9px_font(data.id, data.value);
                    break;
                case actions.CHANGE_FONT:
                    this.emit("change_font", data.font_name);
                    chat.change_font(data.id, data.font_name);
                    break;
                case actions.SET_CANVAS_SIZE:
                    this.emit("set_canvas_size", data.columns, data.rows);
                    chat.set_canvas_size(data.id, data.columns, data.rows);
                    break;
                case actions.PASTE_AS_SELECTION:
                    if (user && user.cursor) user.cursor.paste_as_selection(data.blocks);
                    break;
                case actions.ROTATE:
                    if (user && user.cursor) user.cursor.rotate();
                    break;
                case actions.FLIP_X:
                    if (user && user.cursor) user.cursor.flip_x();
                    break;
                case actions.FLIP_Y:
                    if (user && user.cursor) user.cursor.flip_y();
                    break;
            }
        }
    }

    cursor(x, y) {this.send(actions.CURSOR, {x, y});}
    selection(x, y) {this.send(actions.SELECTION, {x, y});}
    operation(x, y) {this.send(actions.OPERATION, {x, y});}
    hide_cursor() {this.send(actions.HIDE_CURSOR);}
    draw(x, y, block) {this.send(actions.DRAW, {x, y, block});}
    sauce(title, author, group, comments) {this.send(actions.SAUCE, {title, author, group, comments});}
    ice_colors(value) {this.send(actions.ICE_COLORS, {value});}
    use_9px_font(value) {this.send(actions.USE_9PX_FONT, {value});}
    change_font(font_name) {this.send(actions.CHANGE_FONT, {font_name});}
    set_canvas_size(columns, rows) {this.send(actions.SET_CANVAS_SIZE, {columns, rows});}
    paste_as_selection(blocks) {this.send(actions.PASTE_AS_SELECTION, {blocks});}
    rotate() {this.send(actions.ROTATE);}
    flip_x() {this.send(actions.FLIP_X);}
    flip_y() {this.send(actions.FLIP_Y);}
    chat(text) {
        this.send(actions.CHAT, {nick, group, text});
        chat.chat(this.id, nick, group, text, Date.now());
    }
    resize_cursors() {
        for (const id of Object.keys(this.users)) {
            if (this.users[id].cursor) this.users[id].cursor.resize_cursor();
        }
    }

    constructor(server, pass, web = false) {
        super();
        chat.removeAllListeners("goto_user");
        this.connected = false;
        this.server = server;
        this.pass = pass;
        chat.on("goto_user", (id) => {
            if (id == this.id) {
                this.emit("goto_self");
            } else if (this.users[id] && this.users[id].last_row) {
                this.emit("goto_row", this.users[id].last_row);
            }
        });
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

class UndoHistory extends events.EventEmitter {
    has_latest_undo_got_this_block(x, y) {
        for (const undo of this.undo_buffer[undo_buffer.length - 1]) {
            if (undo.x == x && undo.y == y) return true;
        }
        return false;
    }

    reset_redos() {
        this.redo_buffer = [];
        send("disable_redo");
    }

    reset_undos() {
        this.undo_buffer = [];
        send("disable_undo");
        this.reset_redos();
    }

    start_chunk(type = undo_types.INDIVIDUAL, data = []) {
        this.reset_redos();
        this.undo_buffer.push({type, data});
        send("enable_undo");
        if (!connection) send("document_changed");
    }

    push_resize() {
        this.start_chunk(undo_types.RESIZE, libtextmode.get_all_blocks(doc));
    }

    undo_individual(undos) {
        const redos = [];
        for (let undo_i = undos.length - 1; undo_i >= 0; undo_i--) {
            const undo = undos[undo_i];
            const block = doc.data[doc.columns * undo.y + undo.x];
            if (undo.cursor) {
                redos.push({...Object.assign(block), x: undo.x, y: undo.y, cursor: Object.assign(undo.cursor)});
            } else {
                redos.push({...Object.assign(block), x: undo.x, y: undo.y});
            }
            block.code = undo.code;
            block.fg = undo.fg;
            block.bg = undo.bg;
            libtextmode.render_at(render, undo.x, undo.y, block);
            if (connection) connection.draw(undo.x, undo.y, block);
            if (undo.cursor) this.emit("move_to", undo.cursor.prev_x, undo.cursor.prev_y);
        }
        this.redo_buffer.push({type: undo_types.INDIVIDUAL, data: redos});
    }

    redo_individual(redos) {
        const undos = [];
        for (let redo_i = redos.length - 1; redo_i >= 0; redo_i--) {
            const redo = redos[redo_i];
            const block = doc.data[doc.columns * redo.y + redo.x];
            if (redo.cursor) {
                undos.push({...Object.assign(block), x: redo.x, y: redo.y, cursor: Object.assign(redo.cursor)});
            } else {
                undos.push({...Object.assign(block), x: redo.x, y: redo.y});
            }
            block.code = redo.code;
            block.fg = redo.fg;
            block.bg = redo.bg;
            libtextmode.render_at(render, redo.x, redo.y, block);
            if (connection) connection.draw(redo.x, redo.y, block);
            if (redo.cursor) this.emit("move_to", redo.cursor.post_x, redo.cursor.post_y);
        }
        this.undo_buffer.push({type: undo_types.INDIVIDUAL, data: undos});
    }

    copy_blocks(blocks) {
        doc.columns = blocks.columns;
        doc.rows = blocks.rows;
        doc.data = new Array(doc.columns * doc.rows);
        for (let i = 0; i < doc.data.length; i++) doc.data[i] = Object.assign(blocks.data[i]);
    }

    undo_resize(blocks) {
        this.redo_buffer.push({type: undo_types.RESIZE, data: libtextmode.get_all_blocks(doc)});
        this.copy_blocks(blocks);
        this.emit("resize");
    }

    redo_resize(blocks) {
        this.undo_buffer.push({type: undo_types.RESIZE, data: libtextmode.get_all_blocks(doc)});
        this.copy_blocks(blocks);
        this.emit("resize");
    }

    push_insert_row(y, blocks) {
        this.start_chunk(undo_types.INSERT_ROW, {y, blocks});
    }

    push_delete_row(y, blocks) {
        this.start_chunk(undo_types.DELETE_ROW, {y, blocks});
    }

    push_insert_column(x, blocks) {
        this.start_chunk(undo_types.INSERT_COLUMN, {x, blocks});
    }

    push_delete_column(x, blocks) {
        this.start_chunk(undo_types.DELETE_COLUMN, {x, blocks});
    }

    push_scroll_canvas_up() {
        this.start_chunk(undo_types.SCROLL_CANVAS_UP);
    }

    push_scroll_canvas_down() {
        this.start_chunk(undo_types.SCROLL_CANVAS_DOWN);
    }

    push_scroll_canvas_left() {
        this.start_chunk(undo_types.SCROLL_CANVAS_LEFT);
    }

    push_scroll_canvas_right() {
        this.start_chunk(undo_types.SCROLL_CANVAS_RIGHT);
    }

    undo_insert_row(data) {
        this.redo_buffer.push({type: undo_types.DELETE_ROW, data: {y: data.y, blocks: libtextmode.delete_row(doc, data.y, data.blocks)}});
        libtextmode.render_delete_row(doc, data.y, render);
    }

    undo_delete_row(data) {
        this.redo_buffer.push({type: undo_types.INSERT_ROW, data: {y: data.y, blocks: libtextmode.insert_row(doc, data.y, data.blocks)}});
        libtextmode.render_insert_row(doc, data.y, render);
    }

    undo_insert_column(data) {
        this.redo_buffer.push({type: undo_types.DELETE_COLUMN, data: {x: data.x, blocks: libtextmode.delete_column(doc, data.x, data.blocks)}});
        libtextmode.render_delete_column(doc, data.x, render);
    }

    undo_delete_column(data) {
        this.redo_buffer.push({type: undo_types.INSERT_COLUMN, data: {x: data.x, blocks: libtextmode.insert_column(doc, data.x, data.blocks)}});
        libtextmode.render_insert_column(doc, data.x, render);
    }

    undo_scroll_canvas_up() {
        libtextmode.scroll_canvas_down(doc);
        this.redo_buffer.push({type: undo_types.SCROLL_CANVAS_DOWN, data: []});
        libtextmode.render_scroll_canvas_down(doc, render);
    }

    undo_scroll_canvas_down() {
        libtextmode.scroll_canvas_up(doc);
        this.redo_buffer.push({type: undo_types.SCROLL_CANVAS_UP, data: []});
        libtextmode.render_scroll_canvas_up(doc, render);
    }

    undo_scroll_canvas_left() {
        libtextmode.scroll_canvas_right(doc);
        this.redo_buffer.push({type: undo_types.SCROLL_CANVAS_RIGHT, data: []});
        libtextmode.render_scroll_canvas_right(doc, render);
    }

    undo_scroll_canvas_right() {
        libtextmode.scroll_canvas_left(doc);
        this.redo_buffer.push({type: undo_types.SCROLL_CANVAS_LEFT, data: []});
        libtextmode.render_scroll_canvas_left(doc, render);
    }

    redo_scroll_canvas_up() {
        libtextmode.scroll_canvas_down(doc);
        this.undo_buffer.push({type: undo_types.SCROLL_CANVAS_DOWN, data: []});
        libtextmode.render_scroll_canvas_down(doc, render);
    }

    redo_scroll_canvas_down() {
        libtextmode.scroll_canvas_up(doc);
        this.undo_buffer.push({type: undo_types.SCROLL_CANVAS_UP, data: []});
        libtextmode.render_scroll_canvas_up(doc, render);
    }

    redo_scroll_canvas_left() {
        libtextmode.scroll_canvas_right(doc);
        this.undo_buffer.push({type: undo_types.SCROLL_CANVAS_RIGHT, data: []});
        libtextmode.render_scroll_canvas_right(doc, render);
    }

    redo_scroll_canvas_right() {
        libtextmode.scroll_canvas_left(doc);
        this.undo_buffer.push({type: undo_types.SCROLL_CANVAS_LEFT, data: []});
        libtextmode.render_scroll_canvas_left(doc, render);
    }

    redo_insert_row(data) {
        this.undo_buffer.push({type: undo_types.DELETE_ROW, data: {y: data.y, blocks: libtextmode.delete_row(doc, data.y, data.blocks)}});
        libtextmode.render_delete_row(doc, data.y, render);
    }

    redo_delete_row(data) {
        this.undo_buffer.push({type: undo_types.INSERT_ROW, data: {y: data.y, blocks: libtextmode.insert_row(doc, data.y, data.blocks)}});
        libtextmode.render_insert_row(doc, data.y, render);
    }

    redo_insert_column(data) {
        this.undo_buffer.push({type: undo_types.DELETE_COLUMN, data: {x: data.x, blocks: libtextmode.delete_column(doc, data.x, data.blocks)}});
        libtextmode.render_delete_column(doc, data.x, render);
    }

    redo_delete_column(data) {
        this.undo_buffer.push({type: undo_types.INSERT_COLUMN, data: {x: data.x, blocks: libtextmode.insert_column(doc, data.x, data.blocks)}});
        libtextmode.render_insert_column(doc, data.x, render);
    }

    undo() {
        if (this.undo_buffer.length) {
            const undo = this.undo_buffer.pop();
            switch(undo.type) {
                case undo_types.INDIVIDUAL: this.undo_individual(undo.data); break;
                case undo_types.RESIZE: this.undo_resize(undo.data); break;
                case undo_types.INSERT_ROW: this.undo_insert_row(undo.data); break;
                case undo_types.DELETE_ROW: this.undo_delete_row(undo.data); break;
                case undo_types.INSERT_COLUMN: this.undo_insert_column(undo.data); break;
                case undo_types.DELETE_COLUMN: this.undo_delete_column(undo.data); break;
                case undo_types.SCROLL_CANVAS_UP: this.undo_scroll_canvas_up(); break;
                case undo_types.SCROLL_CANVAS_DOWN: this.undo_scroll_canvas_down(); break;
                case undo_types.SCROLL_CANVAS_LEFT: this.undo_scroll_canvas_left(); break;
                case undo_types.SCROLL_CANVAS_RIGHT: this.undo_scroll_canvas_right(); break;
            }
            send("enable_redo");
            if (this.undo_buffer.length == 0) send("disable_undo");
        }
    }

    redo() {
        if (this.redo_buffer.length) {
            const redo = this.redo_buffer.pop();
            switch(redo.type) {
                case undo_types.INDIVIDUAL: this.redo_individual(redo.data); break;
                case undo_types.RESIZE: this.redo_resize(redo.data); break;
                case undo_types.INSERT_ROW: this.redo_insert_row(redo.data); break;
                case undo_types.DELETE_ROW: this.redo_delete_row(redo.data); break;
                case undo_types.INSERT_COLUMN: this.redo_insert_column(redo.data); break;
                case undo_types.DELETE_COLUMN: this.redo_delete_column(redo.data); break;
                case undo_types.SCROLL_CANVAS_UP: this.redo_scroll_canvas_up(); break;
                case undo_types.SCROLL_CANVAS_DOWN: this.redo_scroll_canvas_down(); break;
                case undo_types.SCROLL_CANVAS_LEFT: this.redo_scroll_canvas_left(); break;
                case undo_types.SCROLL_CANVAS_RIGHT: this.redo_scroll_canvas_right(); break;
            }
            send("enable_undo");
            if (this.redo_buffer.length == 0) send("disable_redo");
        }
    }

    push(x, y, block, cursor) {
        if (cursor) {
            this.undo_buffer[this.undo_buffer.length - 1].data.push({x, y, ...Object.assign(block), cursor: Object.assign(cursor)});
        } else {
            this.undo_buffer[this.undo_buffer.length - 1].data.push({x, y, ...Object.assign(block)});
        }
    }

    constructor(undo_move_to) {
        super();
        this.undo_move_to = undo_move_to;
        on("undo", (event) => this.undo());
        on("redo", (event) => this.redo());
        this.undo_buffer = [];
        this.redo_buffer = [];
    }
}

class TextModeDoc extends events.EventEmitter {
    async start_rendering() {
        const big_data = (doc.data.length > 80 * 1000);
        if (big_data) this.emit("start_rendering");
        render = await libtextmode.render_split(doc);
        if (big_data) this.emit("end_rendering");
        if (connection) connection.resize_cursors();
        this.emit("render");
    }

    ready() {
        if (!this.init) {
            this.emit("ready");
            this.init = true;
        }
    }

    async new_document({columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data}) {
        doc = libtextmode.new_document({columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data});
        await this.start_rendering();
        this.emit("new_document");
        this.ready();
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
            send("update_sauce", {title, author, group, comments});
        });
        connection.on("set_canvas_size", (columns, rows) => {
            this.undo_history.reset_undos();
            libtextmode.resize_canvas(doc, columns, rows);
            this.start_rendering();
        });
        connection.on("goto_row", (line_no) => this.emit("goto_row", line_no));
        connection.on("goto_self", (line_no) => this.emit("goto_self"));
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

    set_sauce(title, author, group, comments) {
        doc.title = title;
        doc.author = author;
        doc.group = group;
        doc.comments = comments;
        send("update_sauce", {title, author, group, comments});
        if (connection) connection.sauce(doc.title, doc.author, doc.group, doc.comments);
    }

    set font_name(font_name) {
        doc.font_name = font_name;
        this.start_rendering().then(() => this.emit("change_font", doc.font_name));
        if (connection) connection.change_font(doc.font_name);
    }

    set use_9px_font(value) {
        doc.use_9px_font = value;
        this.start_rendering().then(() => this.emit("use_9px_font", doc.use_9px_font));
        if (connection) connection.use_9px_font(doc.use_9px_font);
    }

    set ice_colors(value) {
        doc.ice_colors = value;
        this.emit("ice_colors", doc.ice_colors);
        if (connection) connection.ice_colors(doc.ice_colors);
    }

    at(x, y) {
        if (x < 0 || x >= doc.columns || y < 0 || y >= doc.rows) return;
        return doc.data[y * doc.columns + x];
    }

    get_blocks(sx, sy, dx, dy, opts) {
        return libtextmode.get_blocks(doc, sx, sy, dx, dy, opts);
    }

    change_data(x, y, code, fg, bg, prev_cursor, cursor, mirrored = true) {
        if (x < 0 || x >= doc.columns || y < 0 || y >= doc.rows) return;
        const i = doc.columns * y + x;
        if (prev_cursor) {
            this.undo_history.push(x, y, doc.data[i], {prev_x: prev_cursor.prev_x, prev_y: prev_cursor.prev_y, post_x: cursor.x, post_y: cursor.y});
        } else {
            this.undo_history.push(x, y, doc.data[i]);
        }
        doc.data[i] = {code, fg, bg};
        libtextmode.render_at(render, x, y, doc.data[i]);
        if (connection) connection.draw(x, y, doc.data[i]);
        if (this.mirror_mode && mirrored) {
            const opposing_x = Math.floor(doc.columns / 2) - (x - Math.ceil(doc.columns / 2)) - 1;
            this.change_data(opposing_x, y, libtextmode.flip_code_x(code), fg, bg, undefined, undefined, false);
        }
    }

    clear_at(x, y, prev_cursor, cursor) {
        this.change_data(x, y, 32, 7, 0, prev_cursor, cursor);
    }

    start_undo() {
        this.undo_history.start_chunk();
    }

    get_half_block(x, y) {
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

    optimize_block(x, y) {
        const block = this.at(x, y);
        if (block.fg == 0) {
            if (block.bg == 0 || block.code == 219) {
                this.change_data(x, y, 32, 7, 0);
            } else {
                switch (block.code) {
                    case 220: this.change_data(x, y, 223, block.bg, block.fg); break;
                    case 223: this.change_data(x, y, 220, block.bg, block.fg); break;
                }
            }
        } else if (block.fg < 8 && block.bg >= 8) {
            const half_block = this.get_half_block(x, y);
            if (half_block.is_blocky) {
                switch (block.code) {
                    case 220: this.change_data(x, y, 223, block.bg, block.fg); break;
                    case 223: this.change_data(x, y, 220, block.bg, block.fg); break;
                }
            } else if (half_block.is_vertically_blocky) {
                switch (block.code) {
                    case 221: this.change_data(x, y, 222, block.bg, block.fg); break;
                    case 222: this.change_data(x, y, 221, block.bg, block.fg); break;
                }
            }
        }
    }

    set_half_block(x, y, col) {
        if (x < 0 || x >= doc.columns || y < 0 || y >= doc.rows * 2) return;
        const block = this.get_half_block(x, y);
        if (block.is_blocky) {
            if ((block.is_top && block.lower_block_color == col) || (!block.is_top && block.upper_block_color == col)) {
                this.change_data(x, block.text_y, 219, col, 0);
            } else if (block.is_top) {
                this.change_data(x, block.text_y, 223, col, block.lower_block_color);
            } else {
                this.change_data(x, block.text_y, 220, col, block.upper_block_color);
            }
        } else {
            if (block.is_top) {
                this.change_data(x, block.text_y, 223, col, block.bg);
            } else {
                this.change_data(x, block.text_y, 220, col, block.bg);
            }
        }
        this.optimize_block(block.x, block.text_y);
    }

    resize(columns, rows) {
        if (!connection) {
            this.undo_history.push_resize();
        } else {
            this.undo_history.reset_undos();
        }
        libtextmode.resize_canvas(doc, columns, rows);
        this.start_rendering();
        if (connection) connection.set_canvas_size(columns, rows);
    }

    count_left(y) {
        for (let x = 0; x < doc.columns; x++) {
            const half_block = this.get_half_block(x, y * 2);
            if (!half_block.is_blocky || half_block.lower_block_color != 0 || half_block.lower_block_color != 0) return x;
        }
        return 0;
    }

    count_right(y) {
        for (let x = 0; x < doc.columns; x++) {
            const half_block = this.get_half_block(doc.columns - 1 - x, y * 2);
            if (!half_block.is_blocky || half_block.lower_block_color != 0 || half_block.lower_block_color != 0) return x;
        }
        return 0;
    }

    left_justify_line(y) {
        const count = this.count_left(y);
        if (count) {
            this.undo_history.start_chunk();
            for (let x = 0; x < doc.columns - count; x++) {
                const block = doc.data[y * doc.columns + x + count];
                this.change_data(x, y, block.code, block.fg, block.bg);
            }
            for (let x = doc.columns - count; x < doc.columns; x++) this.change_data(x, y, 32, 7, 0);
        }
    }

    right_justify_line(y) {
        const count = this.count_right(y);
        if (count) {
            this.undo_history.start_chunk();
            for (let x = doc.columns - 1; x > count - 1; x--) {
                const block = doc.data[y * doc.columns + x - count];
                this.change_data(x, y, block.code, block.fg, 0);
            }
            for (let x = count - 1; x >= 0; x--) this.change_data(x, y, 32, 7, 0);
        }
    }

    center_line(y) {
        const left = this.count_left(y);
        const right = this.count_right(y);
        if (left || right) {
            this.undo_history.start_chunk();
            const blocks = new Array(doc.columns - right - left);
            for (let i = 0; i < blocks.length; i++) blocks[i] = Object.assign(doc.data[y * doc.columns + left + i]);
            const new_left = Math.floor((left + right) / 2);
            for (let x = 0; x < new_left; x++) this.change_data(x, y, 32, 7, 0);
            for (let x = 0; x < blocks.length; x++) this.change_data(new_left + x, y, blocks[x].code, blocks[x].fg, blocks[x].bg);
            for (let x = 0; x < doc.columns - new_left - blocks.length; x++) this.change_data(new_left + blocks.length + x, y, 32, 7, 0);
        }
    }

    erase_line(y) {
        this.undo_history.start_chunk();
        for (let x = 0; x < doc.columns; x++) this.change_data(x, y, 32, 7, 0);
    }

    erase_to_start_of_line(x, y) {
        this.undo_history.start_chunk();
        for (let dx = 0; dx <= x; dx++) this.change_data(dx, y, 32, 7, 0);
    }

    erase_to_end_of_line(x, y) {
        this.undo_history.start_chunk();
        for (let dx = x; dx < doc.columns; dx++) this.change_data(dx, y, 32, 7, 0);
    }

    erase_column(x) {
        this.undo_history.start_chunk();
        for (let y = 0; y < doc.rows; y++) this.change_data(x, y, 32, 7, 0);
    }

    erase_to_start_of_column(x, y) {
        this.undo_history.start_chunk();
        for (let dy = 0; dy <= y; dy++) this.change_data(x, dy, 32, 7, 0);
    }

    erase_to_end_of_column(x, y) {
        this.undo_history.start_chunk();
        for (let dy = y; dy < doc.rows; dy++) this.change_data(x, dy, 32, 7, 0);
    }

    place(blocks, dx, dy, single_undo) {
        const mid_point = Math.floor(doc.columns / 2);
        const dont_mirror = dx < mid_point && dx + blocks.columns > mid_point;
        if (!single_undo) this.undo_history.start_chunk();
        for (let y = 0; y + dy < doc.rows && y < blocks.rows; y++) {
            for (let x = 0; x + dx < doc.columns && x < blocks.columns; x++) {
                const block = blocks.data[y * blocks.columns + x];
                if (!blocks.transparent || block.code != 32 || block.bg != 0) this.change_data(dx + x, dy + y, block.code, block.fg, block.bg, undefined, undefined, !dont_mirror);
            }
        }
    }

    fill_with_code(sx, sy, dx, dy, code, fg, bg) {
        this.undo_history.start_chunk();
        for (let y = sy; y <= dy; y++) {
            for (let x = sx; x <= dx; x++) {
                this.change_data(x, y, code, fg, bg);
            }
        }
    }

    erase(sx, sy, dx, dy) {
        this.fill_with_code(sx, sy, dx, dy, 32, 7, 0);
    }

    fill(sx, sy, dx, dy, col) {
        if (col == 0) {
            this.erase(sx, sy, dx, dy);
        } else {
            this.fill_with_code(sx, sy, dx, dy, 219, col, 0);
        }
    }

    undo() {
        this.undo_history.undo();
    }

    redo() {
        this.undo_history.redo();
    }

    insert_row(y) {
        if (connection) return;
        this.undo_history.push_insert_row(y, libtextmode.insert_row(doc, y));
        libtextmode.render_insert_row(doc, y, render);
    }

    delete_row(y) {
        if (connection) return;
        this.undo_history.push_delete_row(y, libtextmode.delete_row(doc, y));
        libtextmode.render_delete_row(doc, y, render);
    }

    insert_column(x) {
        if (connection) return;
        this.undo_history.push_insert_column(x, libtextmode.insert_column(doc, x));
        libtextmode.render_insert_column(doc, x, render);
    }

    delete_column(x) {
        if (connection) return;
        this.undo_history.push_delete_column(x, libtextmode.delete_column(doc, x));
        libtextmode.render_delete_column(doc, x, render);
    }

    scroll_canvas_up() {
        if (connection) return;
        libtextmode.scroll_canvas_up(doc);
        libtextmode.render_scroll_canvas_up(doc, render);
        this.undo_history.push_scroll_canvas_up();
    }

    scroll_canvas_down() {
        if (connection) return;
        libtextmode.scroll_canvas_down(doc);
        libtextmode.render_scroll_canvas_down(doc, render);
        this.undo_history.push_scroll_canvas_down();
    }

    scroll_canvas_left() {
        if (connection) return;
        libtextmode.scroll_canvas_left(doc);
        libtextmode.render_scroll_canvas_left(doc, render);
        this.undo_history.push_scroll_canvas_left();
    }

    scroll_canvas_right() {
        if (connection) return;
        libtextmode.scroll_canvas_right(doc);
        libtextmode.render_scroll_canvas_right(doc, render);
        this.undo_history.push_scroll_canvas_right();
    }

    async open(file) {
        doc = await libtextmode.read_file(file);
        this.undo_history.reset_undos();
        this.file = file;
        await this.start_rendering();
        this.emit("new_document");
        this.ready();
        send("set_file", {file: this.file});
    }

    async save() {
        if (!this.file) return;
        await libtextmode.write_file(this, this.file);
        if (!connection) send("set_file", {file: this.file});
    }

    async share_online() {
        const default_palette = libtextmode.has_default_palette(doc.palette);
        const bytes = default_palette ? libtextmode.encode_as_ansi(doc) : libtextmode.encode_as_xbin(doc);
        const req = await fetch(`https://api.16colo.rs/v1/paste?key=${SIXTEEN_COLORS_API_KEY}&extension=${default_palette ? "ans" : "xb"}&retention=${retention}`, {
            body: `file=${Buffer.from(bytes).toString("base64")}`,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method: "POST"
        });
        const resp = await req.json();
        if (resp.results) return resp.results.gallery;
    }

    async save_backup(file) {
        await libtextmode.write_file(this, file);
    }

    async export_as_utf8(file) {
        await libtextmode.write_file(this, file, {utf8: true});
    }

    export_as_png(file) {
        libtextmode.export_as_png(this, render, file);
    }

    export_as_apng(file) {
        libtextmode.export_as_apng(render, file);
    }

    constructor() {
        super();
        this.init = false;
        this.mirror_mode = false;
        this.undo_history = new UndoHistory();
        this.undo_history.on("resize", () => this.start_rendering());
        on("ice_colors", (event, value) => this.ice_colors = value);
        on("use_9px_font", (event, value) => this.use_9px_font = value);
        on("change_font", (event, font_name) => this.font_name = font_name);
        on("get_sauce_info", (event) => send("get_sauce_info", {title: doc.title, author: doc.author, group: doc.group, comments: doc.comments}));
        on("get_canvas_size", (event) => send("get_canvas_size", {columns: doc.columns, rows: doc.rows}));
        on("set_canvas_size", (event, {columns, rows}) => this.resize(columns, rows));
        on("set_sauce_info", (event, {title, author, group, comments}) => this.set_sauce(title, author, group, comments));
        on("mirror_mode", (event, value) => this.mirror_mode = value);
        chat.on("goto_row", (line_no) => this.emit("goto_row", line_no));
    }
}

module.exports = new TextModeDoc();
