const libtextmode = require("../libtextmode/libtextmode");
const remote = require("@electron/remote");
const ans_path = remote.app.isPackaged ? `${process.resourcesPath}/ans/` : "./build/ans/";

document.addEventListener("keydown", (event) => {
    if (event.key == "Escape") remote.getCurrentWindow().close();
}, true);

document.addEventListener("DOMContentLoaded", async () => {
    const doc = await libtextmode.read_file(`${ans_path}changelog.ans`);
    const render = await libtextmode.render(doc);
    document.getElementById("canvas_container").appendChild(render.canvas);
});
