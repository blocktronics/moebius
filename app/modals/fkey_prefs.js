const electron = require("electron");
const libtextmode = require("../libtextmode/libtextmode");
const {on} = require("../senders");
let font;

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().getParentWindow().id, ...opts});
}

function send_parent(channel, opts) {
    electron.remote.getCurrentWindow().getParentWindow().send(channel, opts);
}


function key_down(event) {
    switch (event.code) {
        case "Escape":
        case "Enter":
        case "NumpadEnter":
            send("close_modal");
            break;
    }
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.addEventListener("keydown", key_down, true);
}, true);

function update_selector(num) {
    const selector = document.getElementById("fkey_prefs_selector");
    selector.style.top = `${Math.floor(num / 16) * font.height * 2}px`;
    selector.style.left = `${(num % 16) * 8 * 2}px`;
    selector.style.height = `${font.height * 2}px`;
}

electron.ipcRenderer.on("fkey_prefs", async (event, {num, fkey_index, current, bitmask, font_height}) => {
    font = new libtextmode.Font();
    await font.load({bytes: bitmask});
    const canvas = document.createElement("canvas");
    canvas.width = 8 * 16;
    canvas.height = font_height * 16;
    canvas.style.width = `${canvas.width * 2}px`;
    canvas.style.height = `${canvas.height * 2}px`;
    document.getElementById("fkey_prefs_container").appendChild(canvas);
    canvas.addEventListener("mousedown", (event) => {
        const code = Math.floor(event.clientY / font.height / 2) * 16 + Math.floor(event.clientX / 8 / 2);
        send("set_fkey", {num, fkey_index, code});
        update_selector(code);
        setTimeout(() => send("close_modal"), 200);
    }, true);
    const ctx = canvas.getContext("2d");
    for (let y = 0, code = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++, code++) {
            font.draw(ctx, {code, fg: 7, bg: 0}, x * 8, y * font.height);
        }
    }
    update_selector(current);
});

on("cancel", (event) => send("close_modal"));
