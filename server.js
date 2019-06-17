const server = require("./app/server");
const argv = require("minimist")(process.argv, {default: {path: "", pass: "", file: "./server.ans", quiet: false, web: false, web_port: 80}});
const express = require("express");
const path = require("path");

if (argv.web) {
    const app = express();
    app.all("*", (req, resp, next) => {
        if (server.has_joint(req.originalUrl)) {
            resp.sendFile(path.join(__dirname, "./server/index.html"));
        } else if (req.originalUrl == "/") {
            resp.sendStatus(404);
        } else {
            next();
        }
    });
    app.use(express.static("./server/"));
    app.use("/fonts/", express.static("./app/fonts/"));
    app.use((req, resp) => resp.sendStatus(404));
    const express_server = app.listen(argv.web_port, () => console.log(`Started webserver on port ${argv.web_port}`));
    process.on("SIGINT", () => express_server.close());
}

server.start_joint(argv).then((path) => {
    if (path) console.log(`${path}: started`);
});

process.on("SIGINT", () => server.close());
