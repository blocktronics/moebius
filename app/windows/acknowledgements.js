const libtextmode = require("../libtextmode/libtextmode");
const dev = require("electron-is-dev");
const ans_path = dev ? "./build/ans/" : `${process.resourcesPath}/ans/`;

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${ans_path}acknowledgements.ans`, ctx: document.getElementById("acknowledgements_terminal").getContext("2d")});
});
