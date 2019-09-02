const electron = require("electron");

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function ok() {
    const server = document.getElementById("server").value;
    const pass = document.getElementById("pass").value;
    if (server) {
        send("connect_to_server", {server, pass});
        electron.remote.getCurrentWindow().close();
    }
}

function cancel() {
    electron.remote.getCurrentWindow().close();
}

function override_submit(event) {
    if (event.code == "Enter" || event.code == "NumpadEnter") {
        event.preventDefault();
        ok();
    } else if (event.code == "Escape") {
        cancel();
    }
}

function click(event) {
    ok();
    event.preventDefault();
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("server").addEventListener("keydown", override_submit, true);
    document.getElementById("pass").addEventListener("keydown", override_submit, true);
    document.getElementById("connect").addEventListener("click", click, true);
}, true);

electron.ipcRenderer.on("ok", (event) => ok());
electron.ipcRenderer.on("cancel", (event) => cancel());
