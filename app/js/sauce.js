const electron = require("electron");
let is_illegal = false;

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().getParentWindow().id, ...opts});
}

function ok() {
    if (!is_illegal) {
        const title = document.getElementById("title").value;
        const author = document.getElementById("author").value;
        const group = document.getElementById("group").value;
        const comments = document.getElementById("comments").value.split("\n").splice(0, 256).map(text => text.substring(0, 64));
        send("set_sauce_info", {title, author, group, comments});
    }
}

function cancel() {
    send("close_modal");
}

function illegal_text_area() {
    const comments = document.getElementById("comments");
    const text = comments.value.split("\n");
    if (text.length > 256) return true;
    for (const line of text) {
        if (line.length > 64) return true;
    }
    return false;
}

function key_up(event) {
    if (illegal_text_area()) {
        if (!is_illegal) {
            document.getElementById("comments").classList.add("illegal");
            is_illegal = true;
        }
    } else {
        if (is_illegal) {
            document.getElementById("comments").classList.remove("illegal");
            is_illegal = false;
        }
    }
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("ok").addEventListener("click", event => ok(), true);
    document.getElementById("cancel").addEventListener("click", event => cancel(), true);
    document.getElementById("comments").addEventListener("keyup", event => key_up(event), true);
}, true);

document.addEventListener("keydown", (event) => {
    const comments = document.getElementById("comments");
    if ((event.code == "Enter" && event.metaKey) || (event.code == "Enter" && document.activeElement != comments)) {
        ok();
    } else if (event.code == "Escape") {
        cancel();
    }
}, true);

electron.ipcRenderer.on("set_sauce_info", (event, {title, author, group, comments}) => {
    document.getElementById("title").value = title;
    document.getElementById("author").value = author;
    document.getElementById("group").value = group;
    document.getElementById("comments").value = comments.join("\n");
});

electron.ipcRenderer.on("ok", (event) => ok());
electron.ipcRenderer.on("cancel", (event) => cancel());
