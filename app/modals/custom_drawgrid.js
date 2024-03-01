const electron = require("electron");
const remote = require("@electron/remote");

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: remote.getCurrentWindow().getParentWindow().id, ...opts});
}

function send_parent(channel, ...opts) {
    remote.getCurrentWindow().getParentWindow().send(channel, ...opts);
    send("close_modal");
}

function ok() {
    const columns = parseInt(document.getElementById("columns").value, 10);
    const rows = parseInt(document.getElementById("rows").value, 10);
    if (columns && columns > 0 && columns <= 3000 && rows && rows > 0 && rows <= 10000) send_parent("toggle_drawinggrid", true, columns, rows);
}

function cancel() {
    send("close_modal");
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("ok").addEventListener("click", event => ok(), true);
    document.getElementById("cancel").addEventListener("click", event => cancel(), true);
}, true);

document.addEventListener("keydown", (event) => {
    if (event.code == "Enter") {
        ok();
    } else if (event.code == "Escape") {
        cancel();
    }
}, true);

electron.ipcRenderer.on("set_drawgrid_size", (event, {columns, rows}) => {
    document.getElementById("columns").value = `${columns}`;
    document.getElementById("rows").value = `${rows}`;
});

electron.ipcRenderer.on("ok", (event) => ok());
electron.ipcRenderer.on("cancel", (event) => cancel());
