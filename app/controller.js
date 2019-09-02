const electron = require("electron");
const {on, send, send_sync, msg_box, save_box} = require("./senders");
const doc = require("./document/doc");
const {tools} = require("./document/ui/ui");
const {HourlySaver} = require("./hourly_saver");
let hourly_saver, backup_folder;
require("./document/ui/canvas");
require("./document/tools/select");
require("./document/tools/brush");
require("./document/tools/shifter");
require("./document/tools/line");
require("./document/tools/rectangle");
require("./document/tools/ellipse");
require("./document/tools/fill");
require("./document/tools/sample");

doc.on("start_rendering", () => send_sync("show_rendering_modal"));
doc.on("end_rendering", () => send("close_modal"));
doc.on("connecting", () => send_sync("show_connecting_modal"));
doc.on("connected", () => send("close_modal"));
doc.on("unable_to_connect", () => {
    const choice = msg_box("Connect to Server", "Cannot connect to Server", {buttons: ["Retry", "Cancel"], defaultId: 0, cancelId: 1});
    if (choice == 1) send("destroy");
    doc.connect_to_server(doc.connection.server, doc.connection.pass);
});
doc.on("refused", () => {
    msg_box("Connect to Server", "Incorrect password!");
    send("destroy");
});
doc.on("disconnected", () => {
    const choice = msg_box("Disconnected", "You were disconnected from the server.", {buttons: ["Retry", "Cancel"], defaultId: 0, cancelId: 1});
    if (choice == 1) send("destroy");
    doc.connect_to_server(doc.connection.server, doc.connection.pass);
});
doc.on("ready", () => {
    send("ready");
    tools.start(tools.modes.SELECT);
});

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
    const file = save_box(doc.file, "ans", {filters: [{name: "ANSI Art", extensions: ["ans", "asc", "diz", "nfo", "txt"]}, {name: "XBin", extensions: ["xb"]}, {name: "Binary Text", extensions: ["bin"]}]});
    if (file) {
        doc.file = file;
        doc.edited = false;
        save(destroy_when_done);
    }
}

async function share_online() {
    const url = await doc.share_online();
    if (url) electron.shell.openExternal(url);
}

function check_before_closing() {
    const choice = msg_box("Save this document?", "This document contains unsaved changes.", {buttons: ["Save", "Cancel", "Don't Save"], defaultId: 0, cancelId: 1});
    if (choice == 0) {
        save(true);
    } else if (choice == 2) {
        send("destroy");
    }
}

function export_as_utf8() {
    const file = save_box(doc.file, "utf8ans", {filters: [{name: "ANSI Art ", extensions: ["utf8ans"]}]});
    if (file) doc.export_as_utf8(file);
}

function export_as_png() {
    const file = save_box(doc.file, "png", {filters: [{name: "Portable Network Graphics ", extensions: ["png"]}]});
    if (file) doc.export_as_png(file);
}

function export_as_apng() {
    const file = save_box(doc.file, "png", {filters: [{name: "Animated Portable Network Graphics ", extensions: ["png"]}]});
    if (file) doc.export_as_apng(file);
}

function hourly_save() {
    if (doc.connection && !doc.connection.connected) return;
    const file = (doc.connection) ? `${doc.connection.server}.ans` : (doc.file ? doc.file : "Untitled.ans");
    const timestamped_file = hourly_saver.filename(backup_folder, file);
    doc.save_backup(timestamped_file);
    hourly_saver.keep_if_changes(timestamped_file);
}

function use_backup(value) {
    if (value) {
        hourly_saver = new HourlySaver();
        hourly_saver.start();
        hourly_saver.on("save", hourly_save);
    } else if (hourly_saver) {
        hourly_saver.stop();
    }
}

// electron.remote.getCurrentWebContents().openDevTools();
on("new_document", (event, opts) => doc.new_document(opts));
on("revert_to_last_save", (event, opts) => doc.open(doc.file));
on("show_file_in_folder", (event, opts) => electron.shell.showItemInFolder(doc.file));
on("duplicate", (event, opts) => send("new_document", {columns: doc.columns, rows: doc.rows, data: doc.data, palette: doc.palette, font_name: doc.font_name, use_9px_font: doc.use_9px_font, ice_colors: doc.ice_colors}));
on("save", (event, opts) => {
    if (doc.connection) {
        save_as();
    } else {
        save();
    }
});
on("save_as", (event, opts) => save_as());
on("share_online", (event, opts) => share_online());
on("open_file", (event, file) => doc.open(file));
on("check_before_closing", (event) => check_before_closing());
on("export_as_utf8", (event) => export_as_utf8());
on("export_as_png", (event) => export_as_png());
on("export_as_apng", (event) => export_as_apng());
on("connect_to_server", (event, {server, pass}) => doc.connect_to_server(server, pass));
on("backup_folder", (event, folder) => backup_folder = folder);
on("use_backup", (event, value) => use_backup(value));
