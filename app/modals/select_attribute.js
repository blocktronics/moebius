const electron = require("electron");
const libtextmode = require("../libtextmode/libtextmode");
const {on} = require("../senders");
let fg = 0;
let bg = 0;
let palette = [];

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().getParentWindow().id, ...opts});
}

function send_parent(channel, opts) {
    electron.remote.getCurrentWindow().getParentWindow().send(channel, opts);
}

function update_canvas() {
    const canvas = document.getElementById("select_attribute_canvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0, py = 0; y < 16; y++, py += 20) {
        if (y == fg) {
            py += 20;
        } else {
            ctx.fillStyle = libtextmode.convert_ega_to_style(palette[y]);
            ctx.fillRect(bg * 20 + 10, py, 20, 20);
        }
    }
    for (let x = 0, px = 0; x < 16; x++, px += 20) {
        if (x == bg) {
            px += 20;
        } else {
            ctx.fillStyle = libtextmode.convert_ega_to_style(palette[x]);
            ctx.fillRect(px, fg * 20 + 10, 20, 20);
        }
    }
    ctx.fillStyle = libtextmode.convert_ega_to_style(palette[bg]);
    ctx.fillRect(bg * 20, fg * 20, 40, 40);
    ctx.strokeStyle = "black";
    ctx.strokeRect(bg * 20, fg * 20, 40, 40);
    ctx.fillStyle = libtextmode.convert_ega_to_style(palette[fg]);
    ctx.fillRect(bg * 20 + 8, fg * 20 + 8, 24, 24);
}

function previous_foreground_color() {
    fg = (fg == 0) ? 15 : fg - 1;
    send_parent("set_fg", fg);
    update_canvas();
}

function next_foreground_color() {
    fg = (fg == 15) ? 0 : fg + 1;
    send_parent("set_fg", fg);
    update_canvas();
}

function previous_background_color() {
    bg = (bg == 0) ? 15 : bg - 1;
    send_parent("set_bg", bg);
    update_canvas();
}

function next_background_color() {
    bg = (bg == 15) ? 0 : bg + 1;
    send_parent("set_bg", bg);
    update_canvas();
}

function key_down(event) {
    switch (event.code) {
        case "ArrowUp": previous_foreground_color(); break;
        case "ArrowDown": next_foreground_color(); break;
        case "ArrowLeft": previous_background_color(); break;
        case "ArrowRight": next_background_color(); break;
        case "Escape":
        case "Enter":
        case "NumpadEnter":
            send("close_modal");
            break;
    }
}

function mouse_down(event) {
    if (Math.floor((event.clientX - 10) / 20) == bg) {
        let y = Math.floor(event.clientY / 20);
        if (y > fg) {
            y = Math.floor((event.clientY - 20) / 20);
        }
        fg = y;
        send_parent("set_fg", fg);
        update_canvas();
        setTimeout(() => send("close_modal"), 50);
    }
    if (Math.floor((event.clientY - 10) / 20) == fg) {
        let x = Math.floor(event.clientX / 20);
        if (x > bg) {
            x = Math.floor((event.clientX - 20) / 20);
        }
        bg = x;
        send_parent("set_bg", bg);
        update_canvas();
        setTimeout(() => send("close_modal"), 50);
    }
}

document.addEventListener("DOMContentLoaded", (event) => {
    document.addEventListener("keydown", key_down, true);
    document.addEventListener("mousedown", mouse_down, true);
}, true);

electron.ipcRenderer.on("select_attribute", (event, opts) => {
    ({fg, bg, palette} = opts);
    update_canvas();
});

on("previous_foreground_color", (event) => previous_foreground_color());
on("next_foreground_color", (event) => next_foreground_color());
on("previous_background_color", (event) => previous_background_color());
on("next_background_color", (event) => next_background_color());
on("cancel", (event) => send("close_modal"));
