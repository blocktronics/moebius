const electron = require("electron");
const path = require("path");
const win = electron.remote.getCurrentWindow();

function on(channel, msg) {
    return electron.ipcRenderer.on(channel, msg);
}

function send_sync(channel, opts) {
    return electron.ipcRenderer.sendSync(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function msg_box(message, detail, opts = {}) {
    send("close_modal");
    return electron.remote.dialog.showMessageBoxSync(win, {message, detail, ...opts});
}

function open_box(opts, callback) {
    return electron.remote.dialog.showOpenDialog(win, opts, callback);
}

function save_box(file, ext, opts, callback) {
    return electron.remote.dialog.showSaveDialog(win, {defaultPath: `${file ? path.parse(file).name : "Untitled"}.${ext}`, ...opts}, callback);
}

module.exports = {on, send_sync, send, msg_box, open_box, save_box};
