const libtextmode = require("../libtextmode/libtextmode");

document.addEventListener("DOMContentLoaded", async () => {
    const doc = await libtextmode.read_file(`${process.resourcesPath}/ans/changelog.ans`);
    const render = await libtextmode.render(doc);
    document.getElementById("canvas_container").appendChild(render.canvas);
});
