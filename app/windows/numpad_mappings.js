const libtextmode = require("../libtextmode/libtextmode");
const remote = require("@electron/remote");
const ans_path = remote.app.isPackaged ? `${process.resourcesPath}/ans/` : "./build/ans/";

document.addEventListener("keydown", (event) => {
    if (event.key == "Escape") remote.getCurrentWindow().close();
}, true);

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${ans_path}numpad_mappings.ans`, ctx: document.getElementById("numpad_mappings_terminal").getContext("2d")});
});
