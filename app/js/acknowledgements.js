const libtextmode = require("../js/libtextmode/libtextmode");
const electron = require("electron");

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${process.resourcesPath}/ans/acknowledgements.ans`, ctx: document.getElementById("acknowledgements_terminal").getContext("2d")});
});
