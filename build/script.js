const libtextmode = require("../app/js/libtextmode/libtextmode");
const network = require("../app/js/network");
const canvas = require("../app/js/canvas");
const linkify = require("linkifyjs/string");

let connection, doc, render;
function update_sauce() {
    document.title = `Mœbius - ${connection.server}`;
    document.getElementById("title").innerText = doc.title;
    document.getElementById("author").innerText = doc.author;
    document.getElementById("group").innerText = doc.group;
    document.getElementById("comments").innerHTML = linkify(doc.comments, {className: ""});
}
function connected(new_connection, new_doc) {
    connection = new_connection;
    doc = new_doc;
    libtextmode.render_split(doc).then((new_render) => {
        render = new_render;
        canvas.add(render);
        if (doc.ice_colors) {
            canvas.stop_blinking();
        } else {
            canvas.start_blinking();
        }
        update_sauce();
        network.ready_to_receive_events();
    });
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
    canvas.render_at(x, y, block);
}
function sauce(id, title, author, group, comments) {
    doc.title = title;
    doc.author = author;
    doc.group = group;
    doc.comments = comments;
    update_sauce();
}
function connect_to_server({server, pass = ""} = {}) {
    network.connect(server, undefined, undefined, pass, {connected, error, disconnected, refused, draw, sauce});
}

document.addEventListener("DOMContentLoaded", (event) => connect_to_server({server: `${window.location.hostname}${window.location.pathname}`}), true);
