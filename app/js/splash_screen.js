const libtextmode = require("../js/libtextmode/libtextmode");
const electron = require("electron");

function show_new_version_button() {
    const new_version = document.getElementById("new_version");
    new_version.classList.add("slide_down");
    new_version.addEventListener("click", (event) => electron.shell.openExternal("http://www.andyh.org/moebius/"), true);
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("new_document").addEventListener("click", (event) => electron.ipcRenderer.send("new_document"));
    document.getElementById("open").addEventListener("click", (event) => electron.ipcRenderer.send("open"));
    document.getElementById("connect_to_server").addEventListener("click", (event) => electron.ipcRenderer.send("connect_to_test_server"));
    libtextmode.animate({file: `${process.resourcesPath}/ans/MB4K.ans`, ctx: document.getElementById("splash_terminal").getContext("2d")});
    fetch("http://www.andyh.org/moebius/latest.json").then((response) => response.json()).then((json) => {
        if (electron.remote.app.getVersion() != json.version) show_new_version_button();
    });
});
