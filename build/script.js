const libtextmode = require("../app/js/libtextmode/libtextmode");
const network = require("../app/js/network");
const canvas = require("../app/js/canvas");
const linkify = require("linkifyjs/string");
const mobile = (navigator.userAgent.match(/Android/i) || navigator.userAgent.match(/webOS/i) || navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPod/i) || navigator.userAgent.match(/BlackBerry/i) || navigator.userAgent.match(/Windows Phone/i));

let connection, doc, render;
function update_sauce() {
    document.title = `Mœbius - ${connection.server}`;
    document.getElementById("title").innerText = doc.title;
    document.getElementById("author").innerText = doc.author;
    document.getElementById("group").innerText = doc.group;
    document.getElementById("comments").innerHTML = linkify(doc.comments, {className: "", nl2br: true});
}
async function connected(new_connection, new_doc) {
    connection = new_connection;
    doc = new_doc;
    if (mobile) {
        render = await libtextmode.render(doc);
        document.getElementById("canvas_container").appendChild(render.canvas);
    } else {
        render = await libtextmode.render_split(doc);
        canvas.add(render);
        if (doc.ice_colors) {
            canvas.stop_blinking();
        } else {
            canvas.start_blinking();
        }
        update_sauce();
    }
    network.ready_to_receive_events();
}
function error() {
    // todo
}
function disconnected() {
    // todo
}
function refused() {
    // todo
}
function draw(id, x, y, block) {
    doc.data[doc.columns * y + x] = Object.assign(block);
    if (mobile) {
        render.font.draw(render.canvas.getContext("2d"), block, x * render.font.width, y * render.font.height);
    } else {
        canvas.render_at(x, y, block);
    }
}
function sauce(id, title, author, group, comments) {
    doc.title = title;
    doc.author = author;
    doc.group = group;
    doc.comments = comments;
    update_sauce();
}
function ice_colors(id, value) {
    doc.ice_colors = value;
    if (!mobile) {
        if (doc.ice_colors) {
            canvas.stop_blinking();
        } else {
            canvas.start_blinking();
        }
    }
}
async function update_renders() {
    if (mobile) {
        const canvas_container = document.getElementById("canvas_container");
        canvas_container.removeChild(render.canvas);
        render = await libtextmode.render(doc);
        canvas_container.appendChild(render.canvas);
    } else {
        render = await libtextmode.render_split(doc);
        canvas.add(render);
    }
}
async function use_9px_font(id, value) {
    doc.use_9px_font = value;
    update_renders();
}
async function change_font(id, font_name) {
    doc.font_name = font_name;
    update_renders();
}
function set_canvas_size(id, columns, rows) {
    libtextmode.resize_canvas(doc, columns, rows);
    update_renders();
}
function connect_to_server({server, pass = ""} = {}) {
    network.connect(server, undefined, undefined, pass, {connected, error, disconnected, refused, draw, sauce, ice_colors, use_9px_font, change_font, set_canvas_size});
}

document.addEventListener("DOMContentLoaded", (event) => {
    connect_to_server({server: `${window.location.hostname}${window.location.pathname}`});
    if (mobile) document.body.classList.add("mobile");
}, true);
