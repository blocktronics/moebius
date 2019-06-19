const electron = require("electron");
const moebius = require("./app/moebius");
const darwin = (process.platform == "darwin");
let prevent_splash_screen_at_startup = false;
const path = require("path");

if (darwin) {
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
    electron.app.on("activate", (event) => {
        if (!moebius.has_document_windows()) moebius.show_splash_screen();
    });
}

electron.app.on("ready", (event) => {
    if (!darwin && process.argv.length > 1 && path.parse(process.argv[0]).name != "electron") {
        for (let i = 1; i < process.argv.length; i++) moebius.open_file(process.argv[i]);
    } else {
        if (!prevent_splash_screen_at_startup) moebius.show_splash_screen();
    }
});

electron.app.on("open-url", (event, url) => {
    if (electron.app.isReady()) {
        moebius.open_url(url);
    } else {
        prevent_splash_screen_at_startup = true;
        electron.app.whenReady().then(() => moebius.open_url(url));
    }
});

electron.app.on("window-all-closed", (event) => {
    if (darwin) {
        moebius.set_application_menu();
    } else {
        electron.app.quit();
    }
});