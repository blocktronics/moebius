const libtextmode = require("../libtextmode/libtextmode");
const dev = require("electron-is-dev");
const ans_path = dev ? "./build/ans/" : `${process.resourcesPath}/ans/`;
const remote = require("@electron/remote");

document.addEventListener("keydown", (event) => {
    if (event.key == "Escape") remote.getCurrentWindow().close();
}, true);

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${ans_path}anst-moebius.ans`, ctx: document.getElementById("acknowledgements_terminal").getContext("2d")});
});
