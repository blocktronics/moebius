const libtextmode = require("../js/libtextmode/libtextmode");
const electron = require("electron");

function show_new_version_button() {
    const new_version = document.getElementById("new_version");
    new_version.classList.add("slide_down");
    new_version.addEventListener("click", (event) => electron.shell.openExternal("http://www.andyh.org/moebius/"), true);
}

function connect(event) {
    const ip = document.getElementById("ip").value;
    const pass = document.getElementById("pass").value;
    if (ip != "") electron.ipcRenderer.send("connect_to_server", {ip, pass, port: 8000, nick: "andyh"});
}

function key_down(params) {
    if (event.code == "Enter" || event.code == "NumpadEnter") connect();
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("new_document").addEventListener("click", (event) => electron.ipcRenderer.send("new_document"));
    document.getElementById("open").addEventListener("click", (event) => electron.ipcRenderer.send("open"));
    document.getElementById("connect").addEventListener("click", connect, true);
    document.getElementById("ip").addEventListener("keydown", key_down, true);
    document.getElementById("pass").addEventListener("keydown", key_down, true);
    libtextmode.animate({file: `${process.resourcesPath}/ans/MB4K.ans`, ctx: document.getElementById("splash_terminal").getContext("2d")});
    fetch("http://www.andyh.org/moebius/latest.json", {cache: "no-cache"}).then((response) => response.json()).then((json) => {
        if (electron.remote.app.getVersion() != json.version) show_new_version_button();
    });
});
