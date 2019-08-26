const libtextmode = require("../libtextmode/libtextmode");
const dev = require("electron-is-dev");
const ans_path = dev ? "./build/ans/" : `${process.resourcesPath}/ans/`;

document.addEventListener("DOMContentLoaded", async () => {
    const doc = await libtextmode.read_file(`${ans_path}changelog.ans`);
    const render = await libtextmode.render(doc);
    document.getElementById("canvas_container").appendChild(render.canvas);
});
