const libtextmode = require("../libtextmode/libtextmode");
const electron = require("electron");
let konami_index = 0;
const konami_code = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
const {send} = require("../senders");
const dev = require("electron-is-dev");
const ans_path = dev ? "./build/ans/" : `${process.resourcesPath}/ans/`;

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

function body_key_down(params) {
    if (event.code == konami_code[konami_index]) {
        konami_index += 1;
        if (konami_index == konami_code.length) {
            konami_index = 0;
            send("konami_code");
        }
    } else {
        konami_index = 0;
    }
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
    document.body.addEventListener("keydown", body_key_down, true);
    document.getElementById("server").addEventListener("keydown", key_down, true);
    document.getElementById("pass").addEventListener("keydown", key_down, true);
    libtextmode.animate({file: `${ans_path}MB4K.ans`, ctx: document.getElementById("splash_terminal").getContext("2d")});
    fetch("http://www.andyh.org/moebius/latest.json", {cache: "no-cache"}).then((response) => response.json()).then((json) => {
        if (electron.remote.app.getVersion() != json.version) show_new_version_button();
    });
});
