const libtextmode = require("../libtextmode/libtextmode");
let divs, old_fg, old_bg;

function set_fg(fg) {
    if (old_fg != undefined) divs[old_fg].classList.remove("selected_fg");
    divs[fg].classList.add("selected_fg");
    document.getElementById("fg").style.backgroundColor = divs[fg].style.backgroundColor;
    old_fg = fg;
}

function set_bg(bg) {
    if (old_bg != undefined) divs[old_bg].classList.remove("selected_bg");
    divs[bg].classList.add("selected_bg");
    document.getElementById("bg").style.backgroundColor = divs[bg].style.backgroundColor;
    old_bg = bg;
}

function add({palette, set_fg, set_bg}) {
    const swatches = document.getElementById("swatches");
    if (divs) for (const div of divs) swatches.removeChild(div);
    divs = palette.map((rgb, i) => {
        const div = document.createElement("div");
        div.style.backgroundColor = libtextmode.convert_ega_to_style(rgb);
        div.addEventListener("mousedown", (event) => {
            if (event.button == 0) {
                set_fg(i);
            } else if (event.button == 2) {
                set_bg(i);
            }
        });
        return div;
    });
    for (const div of divs) swatches.appendChild(div);
}

module.exports = {add, set_fg, set_bg};
