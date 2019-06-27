const doc = require("./web_doc");
require("./web_canvas");
const linkify = require("linkifyjs/string");
const mobile = (navigator.userAgent.match(/Android/i) || navigator.userAgent.match(/webOS/i) || navigator.userAgent.match(/iPhone/i) || navigator.userAgent.match(/iPad/i) || navigator.userAgent.match(/iPod/i) || navigator.userAgent.match(/BlackBerry/i) || navigator.userAgent.match(/Windows Phone/i));

function sauce(title, author, group, comments) {
    document.getElementById("title").innerText = title;
    document.getElementById("author").innerText = author;
    document.getElementById("group").innerText = group;
    document.getElementById("comments").innerHTML = linkify(comments, {className: "", nl2br: true});
}

doc.on("new_document", () => sauce(doc.title, doc.author, doc.group, doc.comments));
doc.on("sauce", sauce);

document.addEventListener("DOMContentLoaded", (event) => {
    doc.connect_to_server(`${window.location.hostname}${window.location.pathname}`, "");
    if (mobile) document.body.classList.add("mobile");
}, true);
