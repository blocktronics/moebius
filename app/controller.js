const electron = require("electron");
const {on, send, send_sync} = require("./senders");
const doc = require("./document/doc");
const path = require("path");
const {tools} = require("./document/ui/ui");
require("./document/ui/canvas");
require("./document/tools/select");
require("./document/tools/brush");
require("./document/tools/line");
require("./document/tools/rectangle");
require("./document/tools/fill");
require("./document/tools/sample");

doc.on("start_rendering", () => send_sync("show_rendering_modal"));
doc.on("end_rendering", () => send("close_modal"));
doc.on("ready", () => tools.start(tools.modes.SELECT));

function save(destroy_when_done = false) {
    if (doc.file) {
        doc.edited = false;
        doc.save();
        if (destroy_when_done) send("destroy");
    } else {
        save_as(destroy_when_done);
    }
}

function save_as(destroy_when_done = false) {
    electron.remote.dialog.showSaveDialog(electron.remote.getCurrentWindow(), {filters: [{name: "ANSI Art", extensions: ["ans", "asc", "diz", "nfo", "txt"]}, {name: "XBin", extensions: ["xb"]}, {name: "Binary Text", extensions: ["bin"]}], defaultPath: `${doc.file ? path.parse(doc.file).name : "Untitled"}.ans`}, async (file) => {
        if (file) {
            if (!doc.network) {
                doc.file = file;
                doc.edited = false;
            }
            save(destroy_when_done);
        }
    });
}

function check_before_closing() {
    const choice = electron.remote.dialog.showMessageBox(electron.remote.getCurrentWindow(), {message: "Save this document?", detail: "This document contains unsaved changes.", buttons: ["Save", "Cancel", "Don't Save"], defaultId: 0, cancelId: 1});
    if (choice == 0) {
        save(true);
    } else if (choice == 2) {
        send("destroy");
    }
}

function export_as_utf8() {
    electron.remote.dialog.showSaveDialog(electron.remote.getCurrentWindow(), {filters: [{name: "ANSI Art ", extensions: ["utf8ans"]}], defaultPath: `${doc.file ? path.parse(doc.file).name : "Untitled"}.utf8ans`}, (file) => {
        if (file) doc.export_as_utf8(file);
    });
}

function export_as_png() {
    electron.remote.dialog.showSaveDialog(electron.remote.getCurrentWindow(), {filters: [{name: "Portable Network Graphics ", extensions: ["png"]}], defaultPath: `${doc.file ? path.parse(doc.file).name : "Untitled"}.png`}, (file) => {
        if (file) doc.export_as_png(file);
    });
}

// electron.remote.getCurrentWebContents().openDevTools();
on("new_document", (event, opts) => doc.new_document(opts));
on("save", (event, opts) => save());
on("save_as", (event, opts) => save_as());
on("open_file", (event, file) => doc.open(file));
on("check_before_closing", (event) => check_before_closing());
on("export_as_utf8", (event) => export_as_utf8());
on("export_as_png", (event) => export_as_png());
on("connect_to_server", (event, {server, pass}) => doc.connect_to_server(server, pass));