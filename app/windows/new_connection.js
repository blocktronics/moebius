const electron = require("electron");
let saved_servers = [];

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function ok() {
    const server = document.getElementById("server").value;
    const pass = document.getElementById("pass").value;
    if (server) {
        update("server", server);
        update("pass", pass);
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

function update(key, value) {
    electron.ipcRenderer.send("update_prefs", {key, value});
}

function save(event) {
    const server = document.getElementById("server").value;
    const pass = document.getElementById("pass").value;
    if (server != "") {
        saved_servers.push({server, pass});
    }
    update("saved_servers", saved_servers);
    list_servers();
    event.preventDefault();
}

function remove(event) {
    const bookmarks = document.getElementById("bookmarks");
    if (bookmarks.selectedIndex != -1) {
        saved_servers.splice(bookmarks.selectedIndex, 1);
        update("saved_servers", saved_servers);
        list_servers();
    }
    event.preventDefault();
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("server").addEventListener("keydown", override_submit, true);
    document.getElementById("pass").addEventListener("keydown", override_submit, true);
    document.getElementById("connect").addEventListener("click", click, true);
    document.getElementById("save").addEventListener("click", save, true);
    document.getElementById("remove").addEventListener("click", remove, true);
}, true);

function list_servers() {
    const bookmarks = document.getElementById("bookmarks");
    while (bookmarks.firstChild) {
        bookmarks.removeChild(bookmarks.lastChild);
    }
    for (const saved_server of saved_servers) {
        const option = document.createElement("option");
        option.innerText = saved_server.server
        option.addEventListener("mousedown", (event) => {
            document.getElementById("server").value = saved_server.server;
            document.getElementById("pass").value = saved_server.pass;
        }, true);
        bookmarks.appendChild(option);
    }
}

electron.ipcRenderer.on("ok", (event) => ok());
electron.ipcRenderer.on("cancel", (event) => cancel());
electron.ipcRenderer.on("saved_servers", (event, {server, pass, saved_servers: incoming_saved_servers}) => {
    document.getElementById("server").value = server;
    document.getElementById("pass").value = pass;
    saved_servers = incoming_saved_servers;
    list_servers();
});