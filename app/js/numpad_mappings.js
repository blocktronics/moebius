const libtextmode = require("../js/libtextmode/libtextmode");

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${process.resourcesPath}/ans/numpad_mappings.ans`, ctx: document.getElementById("numpad_mappings_terminal").getContext("2d")});
});
