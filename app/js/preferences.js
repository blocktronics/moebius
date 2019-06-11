const electron = require("electron");

function prefs({nick, use_numpad, use_backup, backup_folder}) {
    document.getElementById("nick").value = nick;
    document.getElementById("use_numpad").checked = use_numpad;
    document.getElementById("use_backup").checked = use_backup;
    document.getElementById("backup_folder").innerText = (backup_folder == "") ? "None set" : backup_folder;
}

function nick() {
    electron.ipcRenderer.send("nick", {value: document.getElementById("nick").value});
}

function use_numpad() {
    electron.ipcRenderer.send("use_numpad", {value: document.getElementById("use_numpad").checked});
}

function use_backup() {
    electron.ipcRenderer.send("use_backup", {value: document.getElementById("use_backup").checked});
}

function choose_folder() {
    electron.remote.dialog.showOpenDialog(electron.remote.getCurrentWindow(), {properties: ["openDirectory", "createDirectory"]}, (files) => {
        if (files) {
            const folder = files[0];
            document.getElementById("backup_folder").innerText = folder;
            electron.ipcRenderer.send("backup_folder", {value: folder});
        }
    });
}

function override_submit(event) {
    if (event.key == "Enter" || event.key == "NumpadEnter") event.preventDefault();
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("nick").addEventListener("keydown", override_submit, true);
    document.getElementById("nick").addEventListener("keyup", (event) => nick(), true);
    document.getElementById("use_numpad").addEventListener("change", (event) => use_numpad(), true);
    document.getElementById("backup_choose").addEventListener("click", (event) => {
        choose_folder();
        event.preventDefault();
    }, true);
    document.getElementById("use_backup").addEventListener("change", (event) => use_backup(), true);

}, true);

electron.ipcRenderer.on("prefs", (event, opts) => prefs(opts));
