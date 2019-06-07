const electron = require("electron");
const moebius = require("./app/moebius");
const darwin = (process.platform == "darwin");
let prevent_splash_screen_at_startup = false;

electron.app.on("will-finish-launching", (event) => {
    electron.app.on("open-file", (event, file) => {
        if (electron.app.isReady()) {
            moebius.open_file(file);
        } else {
            prevent_splash_screen_at_startup = true;
            electron.app.whenReady().then(() => moebius.open_file(file));
        }
    });
});

electron.app.on("ready", (event) => {
    if (!prevent_splash_screen_at_startup) moebius.show_splash_screen();
    // moebius.open_file("/Users/andyh/Downloads/MB4K.ans");
    // moebius.connect_to_server({ip: "localhost", port: 8000, nick: "andyh", pass: "secret"});
    // moebius.connect_to_server({ip: "localhost", port: 8000, nick: "andyh", pass: "secret"});
    // moebius.connect_to_server({ip: "localhost", port: 8000, nick: "andyh", pass: "secret"});
    // moebius.connect_to_server({ip: "localhost", port: 8000, nick: "andyh", pass: "secret"});
});

electron.app.on("activate", (event) => {
    if (!moebius.has_document_windows()) moebius.show_splash_screen();
});

if (darwin) electron.app.on("window-all-closed", (event) => moebius.set_application_menu());
