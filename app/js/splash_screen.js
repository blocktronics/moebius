const libtextmode = require("../js/libtextmode/libtextmode");
const electron = require("electron");

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("new_document").addEventListener("click", (event) => electron.ipcRenderer.send("new_document"));
    document.getElementById("open").addEventListener("click", (event) => electron.ipcRenderer.send("open"));
    document.getElementById("connect_to_server").addEventListener("click", (event) => electron.ipcRenderer.send("connect_to_test_server"));
    libtextmode.animate({file: `${process.resourcesPath}/ans/MB4K.ans`, ctx: document.getElementById("splash_terminal").getContext("2d")});
});
