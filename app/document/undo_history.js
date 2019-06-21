const events = require("events");

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
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

    start_chunk() {
        this.reset_redos();
        this.undo_buffer.push([]);
        send("enable_undo");
        send("document_changed");
    }

    undo(doc) {
        if (this.undo_buffer.length) {
            const redos = [];
            const undos = this.undo_buffer.pop();
            for (let undo_i = undos.length - 1; undo_i >= 0; undo_i--) {
                const undo = undos[undo_i];
                const i = doc.columns * undo.y + undo.x;
                if (undo.cursor) {
                    redos.push({...Object.assign(doc.data[i]), x: undo.x, y: undo.y, cursor: Object.assign(undo.cursor)});
                } else {
                    redos.push({...Object.assign(doc.data[i]), x: undo.x, y: undo.y});
                }
                doc.data[i].code = undo.code;
                doc.data[i].fg = undo.fg;
                doc.data[i].bg = undo.bg;
                change_undo(undo.x, undo.y);
                if (undo.cursor) this.emit("move_to", undo.cursor.prev_x, undo.cursor.prev_y);
            }
            this.redo_buffer.push(redos);
            send("enable_redo");
            if (!this.undo_buffer.length) send("disable_undo");
        }
    }

    redo(doc) {
        if (this.redo_buffer.length) {
            const undos = [];
            const redos = this.redo_buffer.pop();
            for (let redo_i = redos.length - 1; redo_i >= 0; redo_i--) {
                const redo = redos[redo_i];
                const i = doc.columns * redo.y + redo.x;
                if (redo.cursor) {
                    undos.push({...Object.assign(doc.data[i]), x: redo.x, y: redo.y, cursor: Object.assign(redo.cursor)});
                } else {
                    undos.push({...Object.assign(doc.data[i]), x: redo.x, y: redo.y});
                }
                doc.data[i].code = redo.code;
                doc.data[i].fg = redo.fg;
                doc.data[i].bg = redo.bg;
                change_undo(redo.x, redo.y);
                if (redo.cursor) this.emit("move_to", redo.cursor.post_x, redo.cursor.post_y);
            }
            this.undo_buffer.push(undos);
            send("enable_undo");
            if (!this.redo_buffer.length) send("disable_redo");
        }
    }

    push(x, y, block, cursor) {
        if (cursor) {
            this.undo_buffer[this.undo_buffer.length - 1].push({x, y, ...Object.assign(block), cursor: Object.assign(cursor)});
        } else {
            this.undo_buffer[this.undo_buffer.length - 1].push({x, y, ...Object.assign(block)});
        }
    }

    constructor(change_undo) {
        super();
        this.change_undo = change_undo;
        this.undo_buffer = [];
        this.redo_buffer = [];
    }
}

module.exports = (undo_history) => new UndoHistory(change_undo);
