const prefs = require("./prefs");
const electron = require("electron");
const window = require("./window");
const menu = require("./menu");
const touchbar = require("./touchbar");
const path = require("path");
const docs = {};
let last_win_pos;
const darwin = (process.platform == "darwin");
const frameless = darwin ? {frame: false, titleBarStyle: "hiddenInset"} : {frame: true};
let prevent_splash_screen_at_startup = false;

function cleanup(id) {
    menu.cleanup(id);
    delete docs[id];
    if (docs.length == 0) menu.set_application_menu();
}

async function new_document_window() {
    const win = await window.new_doc();
    if (darwin) window.close_static("app/html/splash_screen.html");
    if (last_win_pos) {
        const display = electron.screen.getPrimaryDisplay();
        const [max_x, max_y] = [display.workArea.width + display.workArea.x - 1280, display.workArea.height + display.workArea.y - 800];
        const [new_x, new_y] = [last_win_pos[0] + 30, last_win_pos[1] + 30];
        if (new_x < max_x && new_y < max_y) win.setPosition(new_x, new_y);
    }
    const win_pos = win.getPosition();
    last_win_pos = win_pos;
    docs[win.id] = {win, menu: menu.document_menu(win), chat_input_menu: menu.chat_input_menu(win), edited: false};
    touchbar.create_touch_bars(win);
    prefs.send(win);
    win.on("focus", (event) => {
        if (darwin) {
            if (docs[win.id] && docs[win.id].modal && !docs[win.id].modal.isDestroyed()) {
                electron.Menu.setApplicationMenu(menu.modal_menu);
            } else {
                electron.Menu.setApplicationMenu(docs[win.id].menu);
            }
        } else {
            docs[win.id].win.setMenu(docs[win.id].menu);
        }
    });
    win.on("close", (event) => {
        if (!docs[win.id].network && docs[win.id].edited) {
            const choice = electron.dialog.showMessageBox(win, {message: "Save this document?", detail: "This document contains unsaved changes.", buttons: ["Save", "Cancel", "Don't Save"], defaultId: 0, cancelId: 1});
            if (choice == 0) {
                event.preventDefault();
                save({win, close_on_save: true});
            } else if (choice == 1) {
                event.preventDefault();
            } else {
                last_win_pos = win_pos;
                cleanup(win.id);
            }
        } else {
            last_win_pos = win_pos;
            cleanup(win.id);
        }
    });
    return win;
}

async function new_document({columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data} = {}) {
    const win = await new_document_window();
    if (!author) author = prefs.get("nick");
    if (!group) group = prefs.get("group");
    win.send("new_document", {columns, rows, title, author, group, date, palette, font_name, use_9px_font, ice_colors, comments, data});
}

menu.on("new_document", new_document);
electron.ipcMain.on("new_document", (event, opts) => new_document(opts));

async function open_file(file) {
    for (const id of Object.keys(docs)) {
        if (docs[id].file == file) {
            docs[id].win.show();
            return;
        }
    }
    const win = await new_document_window();
    docs[win.id].file = file;
    electron.app.addRecentDocument(file);
    win.setRepresentedFilename(file);
    win.setTitle(path.basename(file));
    win.send("open_file", {file});
}

function open({win} = {}) {
    electron.dialog.showOpenDialog(win, {filters: [{name: "TextArt", extensions: ["ans", "xb", "bin", "diz", "asc", "txt", "nfo"]}, {name: "All Files", extensions: ["*"]}], properties: ["openFile", "multiSelections"]}, (files) => {
        if (files) {
            if (win && !docs[win.id].network && !docs[win.id].file && !docs[win.id].edited) {
                docs[win.id].file = files[0];
                electron.app.addRecentDocument(files[0]);
                win.setRepresentedFilename(files[0]);
                win.setTitle(path.basename(files[0]));
                win.send("open_file", {file: files[0]});
            } else {
                open_file(files[0]);
            }
            for (let i = 1; i < files.length; i++) open_file(files[i]);
        }
    });
}

menu.on("open", open);
electron.ipcMain.on("open", (event) => open());

menu.on("save", save);

function save_as({win, close_on_save = false}) {
    electron.dialog.showSaveDialog(win, {filters: [{name: "ANSI Art", extensions: ["ans", "asc", "diz", "nfo", "txt"]}, {name: "XBin", extensions: ["xb"]}, {name: "Binary Text", extensions: ["bin"]}], defaultPath: `${docs[win.id].file ? path.parse(docs[win.id].file).name : "Untitled"}.ans`}, (file) => {
        if (file) {
            if (!docs[win.id].network) {
                docs[win.id].file = file;
                docs[win.id].edited = false;
                win.setRepresentedFilename(file);
                win.setTitle(path.basename(file));
                win.setDocumentEdited(false);
            }
            electron.app.addRecentDocument(file);
            win.send("save", {file, close_on_save});
        }
    });
}
menu.on("save_as", save_as);

function save({win, close_on_save = false}) {
    if (docs[win.id].file) {
        docs[win.id].edited = false;
        win.setDocumentEdited(false);
        win.send("save", {file: docs[win.id].file, close_on_save});
    } else {
        save_as({win, close_on_save});
    }
}
menu.on("save", save);

async function preferences() {
    const preferences = await window.static("app/html/preferences.html", {width: 480, height: 305});
    preferences.send("prefs", prefs.get_all());
}
menu.on("preferences", preferences);
electron.ipcMain.on("preferences", (event) => preferences());

menu.on("start_server", () => {
    // Todo
});

menu.on("show_new_connection_window", async () => await window.static("app/html/new_connection.html", {width: 480, height: 160}, touchbar.new_connection));

async function connect_to_server({server, pass} = {}) {
    const win = await new_document_window();
    docs[win.id].network = true;
    win.setTitle(server);
    win.send("connect_to_server", {server, pass});
}
electron.ipcMain.on("connect_to_server", (event, opts) => connect_to_server(opts));

async function show_splash_screen() {
    window.static("app/html/splash_screen.html", {width: 720, height: 600, ...frameless}, touchbar.splash_screen, {new_document, open});
}

menu.on("show_cheatsheet", () => window.static("app/html/cheatsheet.html", {width: 640, height: 816, ...frameless}));
menu.on("show_acknowledgements", () => window.static("app/html/acknowledgements.html", {width: 640, height: 400, ...frameless}));
menu.on("show_numpad_mappings", () => window.static("app/html/numpad_mappings.html", {width: 640, height: 400, ...frameless}));

function has_documents_open() {
    return Object.keys(docs).length > 0;
}

electron.ipcMain.on("get_canvas_size", async (event, {id, columns, rows}) => {
    docs[id].modal = await window.new_modal("app/html/resize.html", {width: 300, height: 164, parent: docs[id].win}, touchbar.get_canvas_size);
    docs[id].modal.send("set_canvas_size", {columns, rows});
    if (darwin) electron.Menu.setApplicationMenu(menu.modal_menu);
});

electron.ipcMain.on("document_changed", (event, {id}) => {
    if (!docs[id].network) {
        docs[id].edited = true;
        docs[id].win.setDocumentEdited(true);
    }
});

electron.ipcMain.on("destroy", (event, {id}) => {
    docs[id].win.close();
    cleanup(id);
});

electron.ipcMain.on("update_prefs", (event, {key, value}) => {
    prefs.set(key, value);
    for (const id of Object.keys(docs)) docs[id].win.send(key, value);
});

electron.ipcMain.on("show_rendering_modal", async (event, {id}) => {
    docs[id].modal = await window.new_modal("app/html/rendering.html", {width: 200, height: 80, parent: docs[id].win});
    if (darwin) electron.Menu.setApplicationMenu(menu.modal_menu);
    event.returnValue = true;
});

electron.ipcMain.on("show_connecting_modal", async (event, {id}) => {
    docs[id].modal = await window.new_modal("app/html/connecting.html", {width: 200, height: 80, parent: docs[id].win});
    if (darwin) electron.Menu.setApplicationMenu(menu.modal_menu);
    event.returnValue = true;
});

electron.ipcMain.on("close_modal", (event, {id}) => {
    if (docs[id].modal && !docs[id].modal.isDestroyed()) docs[id].modal.close();
    if (darwin) electron.Menu.setApplicationMenu(docs[id].menu);
});

electron.ipcMain.on("chat_input_focus", (event, {id}) => {
    if (darwin) electron.Menu.setApplicationMenu(docs[id].chat_input_menu);
});

electron.ipcMain.on("chat_input_blur", (event, {id}) => {
    if (darwin) {
        if (docs[id] && docs[id].modal && !docs[id].modal.isDestroyed()) {
            electron.Menu.setApplicationMenu(menu.modal_menu);
        } else {
            electron.Menu.setApplicationMenu(docs[id].menu);
        }
    }
});

electron.ipcMain.on("get_sauce_info", async (event, {id, title, author, group, comments}) => {
    docs[id].modal = await window.new_modal("app/html/sauce.html", {width: 350, height: 330, parent: docs[id].win}, touchbar.get_sauce_info);
    docs[id].modal.send("set_sauce_info", {title, author, group, comments});
    if (darwin) electron.Menu.setApplicationMenu(menu.modal_menu);
});

electron.ipcMain.on("update_sauce", (event, {id, title, author, group, comments}) => {
    if (docs[id] && docs[id].modal && !docs[id].modal.isDestroyed()) docs[id].modal.send("set_sauce_info", {title, author, group, comments});
});

if (darwin) {
    electron.app.on("will-finish-launching", (event) => {
        electron.app.on("open-file", (event, file) => {
            if (electron.app.isReady()) {
                open_file(file);
            } else {
                prevent_splash_screen_at_startup = true;
                electron.app.whenReady().then(() => open_file(file));
            }
        });
    });
    electron.app.on("activate", (event) => {
        if (!has_documents_open()) show_splash_screen();
    });
}

electron.app.on("ready", (event) => {
    new_document();
    if (!darwin && process.argv.length > 1 && require("path").parse(process.argv[0]).name != "electron") {
        for (let i = 1; i < process.argv.length; i++) open_file(process.argv[i]);
    } else {
        if (!prevent_splash_screen_at_startup) show_splash_screen();
    }
    if (darwin) electron.app.dock.setMenu(menu.dock_menu);
});

electron.app.on("window-all-closed", (event) => {
    if (darwin) {
        menu.set_application_menu();
    } else {
        electron.app.quit();
    }
});
