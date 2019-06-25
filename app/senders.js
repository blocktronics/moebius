const electron = require("electron");

function send_sync(channel, opts) {
    return electron.ipcRenderer.sendSync(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

module.exports = {on: (channel, msg) => electron.ipcRenderer.on(channel, msg), send_sync, send};
