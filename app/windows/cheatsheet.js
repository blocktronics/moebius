const libtextmode = require("../libtextmode/libtextmode");
const dev = require("electron-is-dev");
const ans_path = dev ? "./build/ans/" : `${process.resourcesPath}/ans/`;

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${ans_path}cheatsheet.ans`, ctx: document.getElementById("cheatsheet_terminal").getContext("2d")});
});
