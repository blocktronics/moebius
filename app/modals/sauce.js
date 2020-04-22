const electron = require("electron");

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().getParentWindow().id, ...opts});
}

function send_parent(channel, opts) {
    electron.remote.getCurrentWindow().getParentWindow().send(channel, opts);
    send("close_modal");
}

function fill_string(text, length) {
    const text_bytes = Buffer.from(text, "utf-8");
    if (text_bytes.length > length) return undefined;
    const bytes = Buffer.alloc(length);
    bytes.fill(32, text_bytes.length);
    bytes.set(text_bytes, 0);
    return bytes.toString("utf-8");
}

function ok() {
    const title = fill_string(document.getElementById("title").value, 35);
    const author = fill_string(document.getElementById("author").value, 20);
    const group = fill_string(document.getElementById("group").value, 20);
    const comments_value = document.getElementById("comments").value;
    const comments_value_length = Buffer.from(comments_value, "utf-8").length;
    const comments = fill_string(comments_value, Math.min(Math.ceil(comments_value_length / 64) * 64, 64 * 255));
    if (title != undefined && author != undefined && group != undefined && comments != undefined) send_parent("set_sauce_info", {title, author, group, comments});
}

function cancel() {
    send("close_modal");
}

function title_input(event) {
    const title = document.getElementById("title");
    if (fill_string(title.value, 35)) {
        if (title.classList.contains("illegal")) title.classList.remove("illegal");
    } else {
        if (!title.classList.contains("illegal")) title.classList.add("illegal");
    }
}

function author_input(event) {
    const author = document.getElementById("author");
    if (fill_string(author.value, 20)) {
        if (author.classList.contains("illegal")) author.classList.remove("illegal");
    } else {
        if (!author.classList.contains("illegal")) author.classList.add("illegal");
    }
}

function group_input(event) {
    const group = document.getElementById("group");
    if (fill_string(group.value, 20)) {
        if (group.classList.contains("illegal")) group.classList.remove("illegal");
    } else {
        if (!group.classList.contains("illegal")) group.classList.add("illegal");
    }
}

function comments_input(event) {
    const comments = document.getElementById("comments");
    if (fill_string(comments.value, 64 * 255)) {
        if (comments.classList.contains("illegal")) comments.classList.remove("illegal");
    } else {
        if (!comments.classList.contains("illegal")) comments.classList.add("illegal");
    }
    document.getElementById("number_of_bytes").innerText = Buffer.from(comments.value, "utf-8").length;
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.getElementById("ok").addEventListener("click", event => ok(), true);
    document.getElementById("cancel").addEventListener("click", event => cancel(), true);
    document.getElementById("title").addEventListener("input", event => title_input(event), true);
    document.getElementById("author").addEventListener("input", event => author_input(event), true);
    document.getElementById("group").addEventListener("input", event => group_input(event), true);
    document.getElementById("comments").addEventListener("input", event => comments_input(event), true);
}, true);

document.addEventListener("keydown", (event) => {
    const comments = document.getElementById("comments");
    if ((event.code == "Enter" && event.metaKey) || (event.code == "Enter" && document.activeElement != comments)) {
        ok();
    } else if (event.code == "Escape") {
        cancel();
    }
}, true);

function strip_trailing_spaces(text) {
    return text.replace(/[ \u0000]+$/, "");
}

electron.ipcRenderer.on("set_sauce_info", (event, {title, author, group, comments}) => {
    document.getElementById("title").value = strip_trailing_spaces(title);
    document.getElementById("author").value = strip_trailing_spaces(author);
    document.getElementById("group").value = strip_trailing_spaces(group);
    document.getElementById("comments").value = strip_trailing_spaces(comments);
    comments_input();
});

electron.ipcRenderer.on("ok", (event) => ok());
electron.ipcRenderer.on("cancel", (event) => cancel());
