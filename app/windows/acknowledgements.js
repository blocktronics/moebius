const libtextmode = require("../libtextmode/libtextmode");

document.addEventListener("DOMContentLoaded", () => {
    libtextmode.animate({file: `${process.resourcesPath}/ans/acknowledgements.ans`, ctx: document.getElementById("acknowledgements_terminal").getContext("2d")});
});
