const libtextmode = require("../libtextmode/libtextmode");
const electron = require("electron");

function show_new_version_button() {
    const new_version = document.getElementById("new_version");
    new_version.classList.add("slide_down");
    new_version.addEventListener("click", (event) => electron.shell.openExternal("http://www.andyh.org/moebius/"), true);
}

function connect(event) {
    const server = document.getElementById("server").value;
    const pass = document.getElementById("pass").value;
    if (server != "") electron.ipcRenderer.send("connect_to_server", {server, pass});
}

function key_down(params) {
    if (event.code == "Enter" || event.code == "NumpadEnter") connect();
}

document.addEventListener("DOMContentLoaded", () => {
    const preferences = document.getElementById("preferences");
    if (process.platform != "darwin") preferences.innerText = "Settings";
    document.getElementById("new_document").addEventListener("click", (event) => electron.ipcRenderer.send("new_document"));
    document.getElementById("open").addEventListener("click", (event) => electron.ipcRenderer.send("open"));
    preferences.addEventListener("click", (event) => electron.ipcRenderer.send("preferences"));
    document.getElementById("connect").addEventListener("click", connect, true);
    document.getElementById("server").addEventListener("keydown", key_down, true);
    document.getElementById("pass").addEventListener("keydown", key_down, true);
    libtextmode.animate({file: `${process.resourcesPath}/ans/MB4K.ans`, ctx: document.getElementById("splash_terminal").getContext("2d")});
    fetch("http://www.andyh.org/moebius/latest.json", {cache: "no-cache"}).then((response) => response.json()).then((json) => {
        if (electron.remote.app.getVersion() != json.version) show_new_version_button();
    });
});
