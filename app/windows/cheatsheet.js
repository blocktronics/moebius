const libtextmode = require("../libtextmode/libtextmode");
const electron = require("electron");

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${process.resourcesPath}/ans/cheatsheet.ans`, ctx: document.getElementById("cheatsheet_terminal").getContext("2d")});
});
