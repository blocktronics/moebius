const prefs = require("./prefs.js");
const electron = require("electron");
const path = require("path");
const docs = {};
let splash_screen_win, cheatsheet_win, acknowledgements_win, preferences_win;
let last_document_xy_position;
const NEW_DOCUMENT_WIDTH = 1280;
const NEW_DOCUMENT_HEIGHT = 800;
const win32 = (process.platform == "win32");
const darwin = (process.platform == "darwin");
const discord_rpc = require("./discord_rpc.js");

function create_touch_bar(win) {
    return {
        editing: new electron.TouchBar({
            items: [
                new electron.TouchBar.TouchBarButton({label: "F1", click() {win.send("f_key", 0);}}),
                new electron.TouchBar.TouchBarButton({label: "F2", click() {win.send("f_key", 1);}}),
                new electron.TouchBar.TouchBarButton({label: "F3", click() {win.send("f_key", 2);}}),
                new electron.TouchBar.TouchBarButton({label: "F4", click() {win.send("f_key", 3);}}),
                new electron.TouchBar.TouchBarButton({label: "F5", click() {win.send("f_key", 4);}}),
                new electron.TouchBar.TouchBarButton({label: "F6", click() {win.send("f_key", 5);}}),
                new electron.TouchBar.TouchBarButton({label: "F7", click() {win.send("f_key", 6);}}),
                new electron.TouchBar.TouchBarButton({label: "F8", click() {win.send("f_key", 7);}})
            ],
            escapeItem: new electron.TouchBar.TouchBarButton({label: "Brush", click() {win.send("change_to_brush_mode");}})
        }), selection: new electron.TouchBar({
            items: [
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Copy", click() {win.send("copy_block");}}),
                new electron.TouchBar.TouchBarButton({label: "Move", click() {win.send("move_block");}}),
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Delete", click() {win.send("delete_selection");}}),
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Copy to Clipboard", click() {win.send("copy");}}),
                new electron.TouchBar.TouchBarButton({label: "Cut to Clipboard", click() {win.send("cut");}}),
            ],
            escapeItem: new electron.TouchBar.TouchBarButton({label: "Deselect", click() {win.send("deselect");}})
        }), operation: new electron.TouchBar({
            items: [
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Stamp", click() {win.send("stamp");}}),
                new electron.TouchBar.TouchBarButton({label: "Place", click() {win.send("place");}}),
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Center", click() {win.send("center");}}),
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Rotate", click() {win.send("rotate");}}),
                new electron.TouchBar.TouchBarButton({label: "Flip X", click() {win.send("flip_x");}}),
                new electron.TouchBar.TouchBarButton({label: "Flip Y", click() {win.send("flip_y");}}),
            ],
            escapeItem: new electron.TouchBar.TouchBarButton({label: "Cancel", click() {win.send("deselect");}})
        }), brush: new electron.TouchBar({
            items: [
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Prev. Foreground", click() {win.send("previous_foreground_color");}}),
                new electron.TouchBar.TouchBarButton({label: "Next Foreground", click() {win.send("next_foreground_color");}}),
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Prev. Background", click() {win.send("next_background_color");}}),
                new electron.TouchBar.TouchBarButton({label: "Next Background", click() {win.send("next_background_color");}}),
            ],
            escapeItem: new electron.TouchBar.TouchBarButton({label: "Edit", click() {win.send("change_to_select_mode");}})
        }), resize: new electron.TouchBar({
            items: [
                new electron.TouchBar.TouchBarButton({label: "Resize", click() {docs[win.id].modal.send("ok");}})
            ],
            escapeItem: new electron.TouchBar.TouchBarButton({label: "Cancel", click() {docs[win.id].modal.send("cancel");}})
        }), sauce: new electron.TouchBar({
            items: [
                new electron.TouchBar.TouchBarButton({label: "Update", click() {docs[win.id].modal.send("ok");}})
            ],
            escapeItem: new electron.TouchBar.TouchBarButton({label: "Cancel", click() {docs[win.id].modal.send("cancel");}})
        })
    };
}

function set_application_menu() {
    if (darwin) electron.Menu.setApplicationMenu(application_menu);
}

async function new_window({width, height, file}) {
    return new Promise((resolve) => {
        const win = new electron.BrowserWindow({width, height, minWidth: 800, minHeight: 500, show: false, webPreferences: {nodeIntegration: true}, backgroundColor: electron.systemPreferences.isDarkMode() ? "#22252B" : "#f6f6f6"});
        win.on("ready-to-show", (event) => {
            win.show();
            resolve(win);
        });
        win.loadFile(file);
    });
}

async function new_modal_window({width, height, file, parent}) {
    return new Promise((resolve) => {
        const win = (darwin) ? new electron.BrowserWindow({parent, width, height, show: false, modal: true, useContentSize: true, transparent: true, vibrancy: "dark", webPreferences: {nodeIntegration: true}}) : new electron.BrowserWindow({parent, width, height: height + 32, show: false, modal: true, maximizable: false, resizable: false, useContentSize: true, backgroundColor: "#292c33", webPreferences: {nodeIntegration: true}});
        if (win32) win.setMenu(null);
        win.on("ready-to-show", (event) => {
            win.show();
            resolve(win);
        });
        win.loadFile(file);
    });
}

function cleanup_document(id) {
    delete docs[id];
    if (docs.length == 0) set_application_menu();
}

async function new_document_window() {
    const win = await new_window({width: NEW_DOCUMENT_WIDTH, height: NEW_DOCUMENT_HEIGHT, file: "app/html/document.html"});
    if (splash_screen_win && !splash_screen_win.isDestroyed()) splash_screen_win.close();
    if (last_document_xy_position) {
        const display = electron.screen.getPrimaryDisplay();
        win.setPosition(Math.min(display.workArea.width + display.workArea.x - NEW_DOCUMENT_WIDTH, last_document_xy_position[0] + 30), Math.min(display.workArea.height + display.workArea.y - NEW_DOCUMENT_HEIGHT, last_document_xy_position[1] + 30));
    }
    last_document_xy_position = win.getPosition();
    docs[win.id] = {win, menu: document_menu(win), chat_input_menu: chat_input_menu(win), modal_menu: modal_menu(), touch_bars: create_touch_bar(win), edited: false};
    win.send("nick", {value: prefs.get("nick")});
    win.send("group", {value: prefs.get("group")});
    win.send("use_numpad", {value: prefs.get("use_numpad")});
    win.send("use_backup", {value: prefs.get("use_backup")});
    win.send("backup_folder", {value: prefs.get("backup_folder")});
    win.on("focus", (event) => {
        if (darwin) {
            if (docs[win.id] && docs[win.id].modal && !docs[win.id].modal.isDestroyed()) {
                electron.Menu.setApplicationMenu(docs[win.id].modal_menu);
            } else {
                electron.Menu.setApplicationMenu(docs[win.id].menu);
            }
        } else {
            docs[win.id].win.setMenu(docs[win.id].menu);
        }
        if (docs[win.id].network) {
            discord_rpc.set_details("Working on a joint");
        } else if (docs[win.id].file) {
            discord_rpc.set_details("Working on a project");
        } else {
            discord_rpc.set_details("Working on something new");
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
                last_document_xy_position = win.getPosition();
                cleanup_document(win.id);
            }
        } else {
            last_document_xy_position = win.getPosition();
            cleanup_document(win.id);
        }
        discord_rpc.set_details("Stopped working on something");
    });
    return win;
}

async function new_document({columns = 80, rows = 24} = {}) {
    const win = await new_document_window();
    win.send("new_document", {columns, rows, author: prefs.get("nick"), group: prefs.get("group")});
}

function open(win) {
    electron.dialog.showOpenDialog(win, {filters: [{name: "TextArt", extensions: ["ans", "xb", "bin", "diz"]}, {name: "All Files", extensions: ["*"]}], properties: ["openFile", "multiSelections"]}, (files) => {
        if (files) {
            if (win && !docs[win.id].file && !docs[win.id].edited) {
                docs[win.id].file = files[0];
                electron.app.addRecentDocument(files[0]);
                win.setRepresentedFilename(files[0]);
                win.setTitle(path.basename(files[0]));
                win.send("open_file", {file: files[0]});
                discord_rpc.set_details("Working on a project");
            } else {
                open_file(files[0]);
            }
            for (let i = 1; i < files.length; i++) open_file(files[i]);
        }
    });
}

function save_as({win, close_on_save = false}) {
    electron.dialog.showSaveDialog(win, {filters: [{name: "ANSI Art", extensions: ["ans"]}, {name: "XBin", extensions: ["xb"]}, {name: "Binary Text", extensions: ["bin"]}], defaultPath: `${docs[win.id].file ? path.parse(docs[win.id].file).name : "Untitled"}.ans`}, (file) => {
        if (file) {
            docs[win.id].file = file;
            docs[win.id].edited = false;
            win.setRepresentedFilename(file);
            win.setTitle(path.basename(file));
            win.setDocumentEdited(false);
            electron.app.addRecentDocument(file);
            win.send("save", {file, close_on_save});
        }
    });
}

function save({win, close_on_save = false}) {
    if (docs[win.id].file) {
        docs[win.id].edited = false;
        win.setDocumentEdited(false);
        win.send("save", {file: docs[win.id].file, close_on_save});
    } else {
        save_as({win, close_on_save});
    }
}

function export_as_png({win}) {
    electron.dialog.showSaveDialog(win, {filters: [{name: "Portable Network Graphics ", extensions: ["png"]}], defaultPath: `${docs[win.id].file ? path.parse(docs[win.id].file).name : "Untitled"}.png`}, (file) => {
        if (file) win.send("export_as_png", file);
    });
}

function open_reference_image({win}) {
    electron.dialog.showOpenDialog(win, {filters: [{name: "Images", extensions: ["png", "jpg"]}], properties: ["openFile"]}, (files) => {
        if (files) {
            win.send("open_reference_image", {image: electron.nativeImage.createFromPath(files[0]).toDataURL()});
            const toggle_reference_image_menu_item = docs[win.id].menu.getMenuItemById("toggle_reference_image");
            toggle_reference_image_menu_item.enabled = true;
            toggle_reference_image_menu_item.checked = true;
            docs[win.id].menu.getMenuItemById("clear_reference_image").enabled = true;
        }
    });
}

function toggle_reference_image(win, is_visible) {
    win.send("toggle_reference_image", {is_visible});
}

function preferences() {
    if (preferences_win && !preferences_win.isDestroyed()) {
        preferences_win.focus();
    } else {
        preferences_win = new electron.BrowserWindow({width: 480, height: 225, show: false, backgroundColor: "#000000", maximizable: false, resizable: false, fullscreenable: false, webPreferences: {nodeIntegration: true}});
        if (!darwin) preferences_win.setMenu(null);
        preferences_win.on("focus", (event) => set_application_menu());
        preferences_win.on("ready-to-show", (event) => {
            preferences_win.send("prefs", prefs.get_all());
            preferences_win.show();
        });
        preferences_win.loadFile("app/html/preferences.html");
    }
}

function start_server({item, win}) {
    // TODO
}

async function connect_to_server({ip, port, nick, pass}) {
    const win = await new_document_window();
    change_to_network_mode(win.id);
    docs[win.id].network = true;
    win.setTitle(ip);
    win.send("connect_to_server", {ip, port, nick, pass});
}

function disconnect({item, win}) {
    // TODO
}

function open_dev_tools({win}) {
    if (win && !win.isDestroyed()) win.webContents.openDevTools({activate: false, mode: "detach"});
}

// Displayed when anything other than a document is frontmost.
const application_menu = electron.Menu.buildFromTemplate([{
    label: "Mœbius",
    submenu: [
        {role: "about", label: "About Mœbius"},
        {type: "separator"},
        {label: "Preferences", id: "preferences", accelerator: "Cmd+,", click(item) {preferences();}},
        {type: "separator"},
        {role: "services"},
        {type: "separator"},
        {role: "hide", label: "Hide Mœbius"},
        {role: "hideothers"},
        {role: "unhide"},
        {type: "separator"},
        {role: "quit", label: "Quit Mœbius"}
    ]
}, {
    label: "File",
    submenu: [
        {label: "New", id: "new_document", accelerator: "Cmd+N", click(item) {new_document();}},
        {type: "separator"},
        {label: "Open\u2026", id: "open", accelerator: "Cmd+O", click(item) {open();}},
        {role: "recentDocuments", submenu: [{label: "Clear Menu", id: "clear_recent_documents", click(item) {electron.app.clearRecentDocuments();}}]},
        {type: "separator"},
        {role: "close"},
    ]
}, {
    label: "Edit",
    submenu: [
        {label: "Undo", accelerator: "Cmd+Z", role: "undo"},
        {label: "Redo", accelerator: "Cmd+Shift+Z", role: "redo"},
        {type: "separator"},
        {label: "Cut", accelerator: "Cmd+X", role: "cut"},
        {label: "Copy", accelerator: "Cmd+C", role: "copy"},
        {label: "Paste", accelerator: "Cmd+V", role: "paste"},
        {label: "Select All", accelerator: "Cmd+A", role: "selectall"}
    ]
}, {
    label: "Network", submenu: [
        {label: "Connect to Server…", id: "connect_to_server", click(item) {connect_to_server();}, enabled: false},
    ]
}, {
    label: "Window", submenu: [{role: "minimize"}, {role: "zoom"}, {type: "separator"}, {role: "front"}]
}, {
    label: "Help", role: "help", submenu: [
        {label: "Cheatsheet", id: "show_cheatsheet", click(item) {show_cheatsheet();}},
        {type: "separator"},
        {label: "Acknowledgements", id: "show_cheatsheet", click(item) {show_acknowledgements();}},
    ]
}]);

function chat_input_menu(win) {
    return electron.Menu.buildFromTemplate([{
        label: "Mœbius",
        submenu: [
            {role: "about", label: "About Mœbius"},
            {type: "separator"},
            {label: "Preferences", id: "preferences", accelerator: "Cmd+,", click(item) {preferences();}},
            {type: "separator"},
            {role: "services"},
            {type: "separator"},
            {role: "hide", label: "Hide Mœbius"},
            {role: "hideothers"},
            {role: "unhide"},
            {type: "separator"},
            {role: "quit", label: "Quit Mœbius"}
        ]
    }, {
        label: "File",
        submenu: [
            {label: "New", id: "new_document", accelerator: "Cmd+N", click(item) {new_document();}},
            {type: "separator"},
            {label: "Open\u2026", id: "open", accelerator: "Cmd+O", click(item) {open();}},
            {role: "recentDocuments", submenu: [{label: "Clear Menu", id: "clear_recent_documents", click(item) {electron.app.clearRecentDocuments();}}]},
            {type: "separator"},
            {role: "close"},
        ]
    }, {
        label: "Edit",
        submenu: [
            {label: "Undo", accelerator: "Cmd+Z", role: "undo"},
            {label: "Redo", accelerator: "Cmd+Shift+Z", role: "redo"},
            {type: "separator"},
            {label: "Cut", accelerator: "Cmd+X", role: "cut"},
            {label: "Copy", accelerator: "Cmd+C", role: "copy"},
            {label: "Paste", accelerator: "Cmd+V", role: "paste"},
            {label: "Select All", accelerator: "Cmd+A", role: "selectall"}
        ]
    }, {
        label: "Network", submenu: [
            {label: "Toggle Chat Window", id: "chat_window_toggle", accelerator: "Cmd+[", click(item) {win.send("chat_window_toggle", {is_visible: item.checked});}, type: "checkbox", checked: true}
        ]
    }, {
        label: "Window", submenu: [{role: "minimize"}, {role: "zoom"}, {type: "separator"}, {role: "front"}]
    }]);
}

// Displayed when modal window is frontmost.
function modal_menu(win) {
    return electron.Menu.buildFromTemplate([{
        label: "Mœbius",
        submenu: [
            {role: "about", label: "About Mœbius"},
            {type: "separator"},
            {role: "services"},
            {type: "separator"},
            {role: "hide", label: "Hide Mœbius"},
            {role: "hideothers"},
            {role: "unhide"},
            {type: "separator"},
            {role: "quit", label: "Quit Mœbius"}
        ]
    }, {
        label: "Edit",
        submenu: [
            {label: "Undo", accelerator: "Cmd+Z", role: "undo"},
            {label: "Redo", accelerator: "Cmd+Shift+Z", role: "redo"},
            {type: "separator"},
            {label: "Cut", accelerator: "Cmd+X", role: "cut"},
            {label: "Copy", accelerator: "Cmd+C", role: "copy"},
            {label: "Paste", accelerator: "Cmd+V", role: "paste"},
            {label: "Select All", accelerator: "Cmd+A", role: "selectall"}
        ]
    }, {
            label: "Window", submenu: [{role: "minimize"}, {role: "zoom"}, {type: "separator"}, {role: "front"}]
    }, {
        label: "Help", role: "help", submenu: []
    }]);
}

function document_menu(win) {
    if (darwin) {
        return electron.Menu.buildFromTemplate([{
            label: "Mœbius",
            submenu: [{role: "about", label: "About Mœbius"},
            {type: "separator"},
            {label: "Preferences", id: "preferences", accelerator: "Cmd+,", click(item) {preferences();}},
            {type: "separator"},
            {role: "services"},
            {type: "separator"},
            {role: "hide", label: "Hide Mœbius"},
            {role: "hideothers"},
            {role: "unhide"},
            {type: "separator"},
            {role: "quit", label: "Quit Mœbius"}
        ]}, {
            label: "File",
            submenu: [
                {label: "New", id: "new_document", accelerator: "Cmd+N", click(item) {new_document();}},
                {type: "separator"},
                {label: "Open\u2026", id: "open", accelerator: "Cmd+O", click(item) {open(win);}},
                {role: "recentDocuments", submenu: [
                    {label: "Clear Menu", id: "clear_recent_documents", click(item) {electron.app.clearRecentDocuments();}},
                ]},
                {type: "separator"},
                {label: "Edit Sauce Info\u2026", id: "edit_sauce_info", accelerator: "Cmd+I", click(item) {win.send("get_sauce_info");}, enabled: true},
                {type: "separator"},
                {label: "Save", id: "save", accelerator: "Cmd+S", click(item) {save({win});}},
                {label: "Save As\u2026", id: "save_as", accelerator: "Cmd+Shift+S", click(item) {save_as({win});}},
                {type: "separator"},
                {label: "Export As PNG\u2026", id: "export_as_png", accelerator: "Cmd+Shift+E", click(item) {export_as_png({win});}},
                {type: "separator"},
                {role: "close"}
            ]
        }, {
            label: "Edit",
            submenu: [
                {label: "Undo", id: "undo", accelerator: "Cmd+Z", click(item) {win.send("undo");}, enabled: false},
                {label: "Redo", id: "redo", accelerator: darwin ? "Cmd+Shift+Z" : "Cmd+Y", click(item) {win.send("redo");}, enabled: false},
                {label: "Toggle Insert Mode", id: "toggle_insert_mode", click(item) {win.send("insert_mode", item.checked);}, type: "checkbox", checked: false},
                {type: "separator"},
                {label: "Cut", id: "cut", accelerator: "Cmd+X", click(item) {win.send("cut");}, enabled: false},
                {label: "Copy", id: "copy", accelerator: "Cmd+C", click(item) {win.send("copy");}, enabled: false},
                {label: "Paste", id: "paste", accelerator: "Cmd+V", click(item) {win.send("paste");}},
                {label: "Delete", id: "delete_selection", accelerator: "Cmd+Backspace", click(item) {win.send("delete_selection");}, enabled: false},
                {type: "separator"},
                {label: "Select All", id: "select_all", accelerator: "Cmd+A", click(item) {win.send("select_all");}},
                {label: "Deselect", id: "deselect", accelerator: "Escape", click(item) {win.send("deselect");}, enabled: false},
                {type: "separator"},
                {label: "Move Block", id: "move_block", accelerator: "M", click(item) {win.send("move_block");}, enabled: false},
                {label: "Copy Block", id: "copy_block", accelerator: "C", click(item) {win.send("copy_block");}, enabled: false},
                {type: "separator"},
                {label: "Stamp", id: "stamp", accelerator: "S", click(item) {win.send("stamp");}, enabled: false},
                {label: "Rotate", id: "rotate", accelerator: "R", click(item) {win.send("rotate");}, enabled: false},
                {label: "Flip X", id: "flip_x", accelerator: "X", click(item) {win.send("flip_x");}, enabled: false},
                {label: "Flip Y", id: "flip_y", accelerator: "Y", click(item) {win.send("flip_y");}, enabled: false},
                {label: "Center", id: "center", accelerator: "=", click(item) {win.send("center");}, enabled: false},
                {type: "separator"},
                {label: "Set Canvas Size\u2026", id: "set_canvas_size", accelerator: "Cmd+Alt+C", click(item) {win.send("get_canvas_size");}, enabled: true},
                {type: "separator"},
                {label: "Previous Foreground Color", id: "previous_foreground_color", accelerator: "Alt+Up", click(item) {win.send("previous_foreground_color");}},
                {label: "Next Foreground Color", id: "next_foreground_color", accelerator: "Alt+Down", click(item) {win.send("next_foreground_color");}},
                {type: "separator"},
                {label: "Previous Background Color", id: "previous_background_colour", accelerator: "Alt+Left", click(item) {win.send("previous_background_colour");}},
                {label: "Next Background Color", id: "next_background_color", accelerator: "Alt+Right", click(item) {win.send("next_background_color");}},
                {type: "separator"},
                {label: "Use Attribute Under Cursor", id: "use_attribute_under_cursor", accelerator: "Alt+U", click(item) {win.send("use_attribute_under_cursor");}},
                {label: "Default Color", id: "default_color", accelerator: "Cmd+D", click(item) {win.send("default_color");}},
                {label: "Switch Foreground / Background", id: "switch_foreground_background", accelerator: "Shift+Cmd+X", click(item) {win.send("switch_foreground_background");}}
            ]
        }, {
            label: "View",
            submenu: [
                {label: "Show Status Bar", id: "show_status_bar", accelerator: "Cmd+/", click(item) {win.send("show_statusbar", item.checked);}, type: "checkbox", checked: true},
                {label: "Show Tool Bar", id: "show_tool_bar", accelerator: "Cmd+T", click(item) {win.send("show_toolbar", item.checked);}, type: "checkbox", checked: true},
                {label: "Show Preview", id: "show_preview", accelerator: "Cmd+Alt+P", click(item) {win.send("show_preview", item.checked);}, type: "checkbox", checked: true},
                {type: "separator"},
                {label: "Selection Mode", id: "change_to_select_mode", accelerator: "Cmd+1", click(item) {win.send("change_to_select_mode");}, type: "checkbox", checked: false},
                {label: "Brush Mode", id: "change_to_brush_mode", accelerator: "Cmd+2", click(item) {win.send("change_to_brush_mode");}, type: "checkbox", checked: false},
                {label: "Line Mode", id: "change_to_line_mode", accelerator: "Cmd+3", click(item) {win.send("change_to_line_mode");}, type: "checkbox", checked: false},
                {label: "Rectangle Mode", id: "change_to_rectangle_mode", accelerator: "Cmd+4", click(item) {win.send("change_to_rectangle_mode");}, type: "checkbox", checked: false},
                {label: "Fill Mode", id: "change_to_fill_mode", accelerator: "Cmd+5", click(item) {win.send("change_to_fill_mode");}, type: "checkbox", checked: false},
                {label: "Sample Mode", id: "change_to_sample_mode", accelerator: "Cmd+6", click(item) {win.send("change_to_sample_mode");}, type: "checkbox", checked: false},
                {type: "separator"},
                {label: "Use 9px Font", id: "use_9px_font", click(item) {win.send("use_9px_font", item.checked);}, type: "checkbox", checked: false, enabled: true},
                {label: "Use iCE Colors", id: "ice_colors", click(item) {win.send("ice_colors", item.checked);}, type: "checkbox", checked: false, enabled: true},
                {type: "separator"},
                {label: "Actual Size", id: "actual_size", accelerator: "Cmd+0", click(item) {win.send("actual_size");}, type: "checkbox", checked: false},
                {label: "Zoom In", id: "zoom_in", accelerator: "Cmd+=", click(item) {win.send("zoom_in");}},
                {label: "Zoom Out", id: "zoom_out", accelerator: "Cmd+-", click(item) {win.send("zoom_out");}},
                {type: "separator"},
                {label: "Change Font", submenu: [
                    {label: "Amiga", submenu: [
                        {label: "Amiga Topaz 1 (8×16)", id: "Amiga Topaz 1", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga Topaz 1+ (8×16)", id: "Amiga Topaz 1+", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga Topaz 2 (8×16)", id: "Amiga Topaz 2", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga Topaz 2+ (8×16)", id: "Amiga Topaz 2+", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga P0T-NOoDLE (8×16)", id: "Amiga P0T-NOoDLE", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga MicroKnight (8×16)", id: "Amiga MicroKnight", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga MicroKnight+ (8×16)", id: "Amiga MicroKnight+", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga mOsOul (8×16)", id: "Amiga mOsOul", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Arabic", submenu: [
                        {label: "IBM VGA50 864 (8×8)", id: "IBM VGA50 864", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 864 (8×14)", id: "IBM EGA 864", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 864 (8×16)", id: "IBM VGA 864", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Baltic Rim", submenu: [
                        {label: "IBM VGA50 775 (8×8)", id: "IBM VGA50 775", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 775 (8×14)", id: "IBM EGA 775", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 775 (8×16)", id: "IBM VGA 775", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Cyrillic", submenu: [
                        {label: "IBM VGA50 866 (8×8)", id: "IBM VGA50 866", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 866 (8×14)", id: "IBM EGA 866", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 866 (8×16)", id: "IBM VGA 866", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA50 855 (8×8)", id: "IBM VGA50 855", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 855 (8×14)", id: "IBM EGA 855", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 855 (8×16)", id: "IBM VGA 855", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "French Canadian", submenu: [
                        {label: "IBM VGA50 863 (8×8)", id: "IBM VGA50 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 863 (8×14)", id: "IBM EGA 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 863 (8×16)", id: "IBM VGA 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 863 (8×19)", id: "IBM VGA25G 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Greek", submenu: [
                        {label: "IBM VGA50 737 (8×8)", id: "IBM VGA50 737", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 737 (8×14)", id: "IBM EGA 737", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 737 (8×16)", id: "IBM VGA 737", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA50 869 (8×8)", id: "IBM VGA50 869", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 869 (8×14)", id: "IBM EGA 869", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 869 (8×16)", id: "IBM VGA 869", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA50 851 (8×8)", id: "IBM VGA50 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 851 (8×14)", id: "IBM EGA 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 851 (8×16)", id: "IBM VGA 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 851 (8×19)", id: "IBM VGA25G 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Hebrew", submenu: [
                        {label: "IBM VGA50 862 (8×8)", id: "IBM VGA50 862", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 862 (8×14)", id: "IBM EGA 862", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 862 (8×16)", id: "IBM VGA 862", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "IBM PC", submenu: [
                        {label: "IBM VGA50 (8×8)",  id: "IBM VGA50", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA (8×14)", id: "IBM EGA", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA (8×16)", id: "IBM VGA", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G (8×19 (8×19)", id: "IBM VGA25G", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Icelandic", submenu: [
                        {label: "IBM VGA50 861 (8×8)", id: "IBM VGA50 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 861 (8×14)", id: "IBM EGA 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 861 (8×16)", id: "IBM VGA 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 861 (8×19)", id: "IBM VGA25G 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Latin-1 Western European", submenu: [
                        {label: "IBM VGA50 850 (8×8)", id: "IBM VGA50 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 850 (8×14)", id: "IBM EGA 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 850 (8×16)", id: "IBM VGA 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 850 (8×19)", id: "IBM VGA25G 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Latin-1 Central European", submenu: [
                        {label: "IBM VGA50 852 (8×8)", id: "IBM VGA50 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 852 (8×14)", id: "IBM EGA 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 852 (8×16)", id: "IBM VGA 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 852 (8×19)", id: "IBM VGA25G 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Latin-1 Multilingual", submenu: [
                        {label: "IBM VGA50 853 (8×8)", id: "IBM VGA50 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 853 (8×14)", id: "IBM EGA 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 853 (8×16)", id: "IBM VGA 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 853 (8×19)", id: "IBM VGA25G 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Nordic", submenu: [
                        {label: "IBM VGA50 865 (8×8)", id: "IBM VGA50 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 865 (8×14)", id: "IBM EGA 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 865 (8×16)", id: "IBM VGA 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 865 (8×19)", id: "IBM VGA25G 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Portuguese", submenu: [
                        {label: "IBM VGA50 860 (8×8)", id: "IBM VGA50 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 860 (8×14)", id: "IBM EGA 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 860 (8×16)", id: "IBM VGA 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 860 (8×19)", id: "IBM VGA25G 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Turkish", submenu: [
                        {label: "IBM VGA50 857 (8×8)", id: "IBM VGA50 857", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 857 (8×14)", id: "IBM EGA 857", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 857 (8×16)", id: "IBM VGA 857", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]}
                ]},
                {type: "separator"},
                {label: "Open Reference Image\u2026", id: "open_reference_image", click(item) {open_reference_image({win});}},
                {label: "Toggle Reference Image", id: "toggle_reference_image", accelerator: "Ctrl+Tab", click(item) {toggle_reference_image(win, item.checked);}, enabled: false, type: "checkbox", checked: true},
                {label: "Clear", id: "clear_reference_image", click(item) {win.send("clear_reference_image");}, enabled: false},
                {type: "separator"},
                {role: "togglefullscreen"}
            ]
        }, {
            label: "Network", submenu: [
                {label: "Start Server…", id: "start_server", click(item) {start_server({item, win});}, enabled: false},
                {label: "Connect to Server…", id: "connect_to_server", click(item) {connect_to_server();}, enabled: false},
                {type: "separator"},
                {label: "Toggle Chat Window", id: "chat_window_toggle", accelerator: "Cmd+[", click(item) {win.send("chat_window_toggle");}, enabled: false},
                {type: "separator"},
                {label: "Disconnect", id: "disconnect", click(item) {disconnect({item, win});}, enabled: false},
            ]
        }, {
            label: "Window", submenu: [{role: "minimize"}, {role: "zoom"}, {type: "separator"}, {role: "front"}]
        }, {
            label: "Debug",
            submenu: [
                {label: "Open Dev Tools", id: "open_dev_tools", click(item) {open_dev_tools({item, win});}}
            ]
        }, {
            label: "Help", role: "help", submenu: [
                {label: "Cheatsheet", id: "show_cheatsheet", click(item) {show_cheatsheet();}},
                {type: "separator"},
                {label: "Acknowledgements", id: "show_cheatsheet", click(item) {show_acknowledgements();}},
            ]
        }]);
    } else {
        return electron.Menu.buildFromTemplate([{
            label: "&File",
            submenu: [
                {label: "New", id: "new_document", accelerator: "Ctrl+N", click(item) {new_document();}},
                {type: "separator"},
                {label: "Open\u2026", id: "open", accelerator: "Ctrl+O", click(item) {open(win);}},
                {type: "separator"},
                {label: "Edit Sauce Info\u2026", id: "edit_sauce_info", accelerator: "Ctrl+I", click(item) {win.send("get_sauce_info");}, enabled: true},
                {type: "separator"},
                {label: "Save", id: "save", accelerator: "Ctrl+S", click(item) {save({win});}},
                {label: "Save As\u2026", id: "save_as", accelerator: "Ctrl+Shift+S", click(item) {save_as({win});}},
                {type: "separator"},
                {label: "Export As PNG\u2026", id: "export_as_png", accelerator: "Ctrl+Shift+E", click(item) {export_as_png({win});}},
                {type: "separator"},
                {label: "Settings", id: "preferences", click(item) {preferences();}},
                {type: "separator"},
                {label: "Close", accelerator: "Alt+F4", id: "preferences", click(item) {preferences();}, role: "close"}
            ]
        }, {
            label: "&Edit",
            submenu: [
                {label: "Undo", id: "undo", accelerator: "Ctrl+Z", click(item) {win.send("undo");}, enabled: false},
                {label: "Redo", id: "redo", accelerator: darwin ? "Ctrl+Shift+Z" : "Ctrl+Y", click(item) {win.send("redo");}, enabled: false},
                {label: "Toggle Insert Mode", id: "toggle_insert_mode", click(item) {win.send("insert_mode", item.checked);}, type: "checkbox", checked: false},
                {type: "separator"},
                {label: "Cut", id: "cut", accelerator: "Ctrl+X", click(item) {win.send("cut");}, enabled: false},
                {label: "Copy", id: "copy", accelerator: "Ctrl+C", click(item) {win.send("copy");}, enabled: false},
                {label: "Paste", id: "paste", accelerator: "Ctrl+V", click(item) {win.send("paste");}},
                {label: "Delete", id: "delete_selection", accelerator: "Ctrl+Backspace", click(item) {win.send("delete_selection");}, enabled: false},
                {type: "separator"},
                {label: "Select All", id: "select_all", accelerator: "Ctrl+A", click(item) {win.send("select_all");}},
                {label: "Deselect", id: "deselect", accelerator: "Escape", click(item) {win.send("deselect");}, enabled: false},
                {type: "separator"},
                {label: "Move Block", id: "move_block", accelerator: "M", click(item) {win.send("move_block");}, enabled: false},
                {label: "Copy Block", id: "copy_block", accelerator: "C", click(item) {win.send("copy_block");}, enabled: false},
                {type: "separator"},
                {label: "Stamp", id: "stamp", accelerator: "S", click(item) {win.send("stamp");}, enabled: false},
                {label: "Rotate", id: "rotate", accelerator: "R", click(item) {win.send("rotate");}, enabled: false},
                {label: "Flip X", id: "flip_x", accelerator: "X", click(item) {win.send("flip_x");}, enabled: false},
                {label: "Flip Y", id: "flip_y", accelerator: "Y", click(item) {win.send("flip_y");}, enabled: false},
                {label: "Center", id: "center", accelerator: "=", click(item) {win.send("center");}, enabled: false},
                {type: "separator"},
                {label: "Set Canvas Size\u2026", id: "set_canvas_size", accelerator: "Ctrl+Alt+C", click(item) {win.send("get_canvas_size");}, enabled: true},
                {type: "separator"},
                {label: "Previous Foreground Color", id: "previous_foreground_color", accelerator: "Alt+Up", click(item) {win.send("previous_foreground_color");}},
                {label: "Next Foreground Color", id: "next_foreground_color", accelerator: "Alt+Down", click(item) {win.send("next_foreground_color");}},
                {type: "separator"},
                {label: "Previous Background Color", id: "previous_background_colour", accelerator: "Alt+Left", click(item) {win.send("previous_background_colour");}},
                {label: "Next Background Color", id: "next_background_color", accelerator: "Alt+Right", click(item) {win.send("next_background_color");}},
                {type: "separator"},
                {label: "Use Attribute Under Cursor", id: "use_attribute_under_cursor", accelerator: "Alt+U", click(item) {win.send("use_attribute_under_cursor");}},
                {label: "Default Color", id: "default_color", accelerator: "Ctrl+D", click(item) {win.send("default_color");}},
                {label: "Switch Foreground / Background", id: "switch_foreground_background", accelerator: "Shift+Ctrl+X", click(item) {win.send("switch_foreground_background");}}
            ]
        }, {
            label: "&View",
            submenu: [
                {label: "Show Status Bar", id: "show_status_bar", accelerator: "Ctrl+/", click(item) {win.send("show_statusbar", item.checked);}, type: "checkbox", checked: true},
                {label: "Show Tool Bar", id: "show_tool_bar", accelerator: "Ctrl+T", click(item) {win.send("show_toolbar", item.checked);}, type: "checkbox", checked: true},
                {label: "Show Preview", id: "show_preview", accelerator: "Ctrl+Alt+P", click(item) {win.send("show_preview", item.checked);}, type: "checkbox", checked: true},
                {type: "separator"},
                {label: "Selection Mode", id: "change_to_select_mode", click(item) {win.send("change_to_select_mode");}, type: "checkbox", checked: false},
                {label: "Brush Mode", id: "change_to_brush_mode", click(item) {win.send("change_to_brush_mode");}, type: "checkbox", checked: false},
                {label: "Line Mode", id: "change_to_line_mode", click(item) {win.send("change_to_line_mode");}, type: "checkbox", checked: false},
                {label: "Rectangle Mode", id: "change_to_rectangle_mode", click(item) {win.send("change_to_rectangle_mode");}, type: "checkbox", checked: false},
                {label: "Fill Mode", id: "change_to_fill_mode", click(item) {win.send("change_to_fill_mode");}, type: "checkbox", checked: false},
                {label: "Sample Mode", id: "change_to_sample_mode", click(item) {win.send("change_to_sample_mode");}, type: "checkbox", checked: false},
                {type: "separator"},
                {label: "Use 9px Font", id: "use_9px_font", click(item) {win.send("use_9px_font", item.checked);}, type: "checkbox", checked: false, enabled: true},
                {label: "Use iCE Colors", id: "ice_colors", click(item) {win.send("ice_colors", item.checked);}, type: "checkbox", checked: false, enabled: true},
                {type: "separator"},
                {label: "Actual Size", id: "actual_size", accelerator: "Ctrl+Alt+0", click(item) {win.send("actual_size");}, type: "checkbox", checked: false},
                {label: "Zoom In", id: "zoom_in", accelerator: "Ctrl+=", click(item) {win.send("zoom_in");}},
                {label: "Zoom Out", id: "zoom_out", accelerator: "Ctrl+-", click(item) {win.send("zoom_out");}},
                {type: "separator"},
                {label: "Change Font", submenu: [
                    {label: "Amiga", submenu: [
                        {label: "Amiga Topaz 1 (8×16)", id: "Amiga Topaz 1", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga Topaz 1+ (8×16)", id: "Amiga Topaz 1+", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga Topaz 2 (8×16)", id: "Amiga Topaz 2", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga Topaz 2+ (8×16)", id: "Amiga Topaz 2+", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga P0T-NOoDLE (8×16)", id: "Amiga P0T-NOoDLE", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga MicroKnight (8×16)", id: "Amiga MicroKnight", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga MicroKnight+ (8×16)", id: "Amiga MicroKnight+", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "Amiga mOsOul (8×16)", id: "Amiga mOsOul", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Arabic", submenu: [
                        {label: "IBM VGA50 864 (8×8)", id: "IBM VGA50 864", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 864 (8×14)", id: "IBM EGA 864", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 864 (8×16)", id: "IBM VGA 864", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Baltic Rim", submenu: [
                        {label: "IBM VGA50 775 (8×8)", id: "IBM VGA50 775", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 775 (8×14)", id: "IBM EGA 775", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 775 (8×16)", id: "IBM VGA 775", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Cyrillic", submenu: [
                        {label: "IBM VGA50 866 (8×8)", id: "IBM VGA50 866", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 866 (8×14)", id: "IBM EGA 866", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 866 (8×16)", id: "IBM VGA 866", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA50 855 (8×8)", id: "IBM VGA50 855", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 855 (8×14)", id: "IBM EGA 855", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 855 (8×16)", id: "IBM VGA 855", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "French Canadian", submenu: [
                        {label: "IBM VGA50 863 (8×8)", id: "IBM VGA50 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 863 (8×14)", id: "IBM EGA 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 863 (8×16)", id: "IBM VGA 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 863 (8×19)", id: "IBM VGA25G 863", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Greek", submenu: [
                        {label: "IBM VGA50 737 (8×8)", id: "IBM VGA50 737", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 737 (8×14)", id: "IBM EGA 737", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 737 (8×16)", id: "IBM VGA 737", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA50 869 (8×8)", id: "IBM VGA50 869", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 869 (8×14)", id: "IBM EGA 869", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 869 (8×16)", id: "IBM VGA 869", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA50 851 (8×8)", id: "IBM VGA50 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 851 (8×14)", id: "IBM EGA 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 851 (8×16)", id: "IBM VGA 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 851 (8×19)", id: "IBM VGA25G 851", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Hebrew", submenu: [
                        {label: "IBM VGA50 862 (8×8)", id: "IBM VGA50 862", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 862 (8×14)", id: "IBM EGA 862", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 862 (8×16)", id: "IBM VGA 862", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "IBM PC", submenu: [
                        {label: "IBM VGA50 (8×8)",  id: "IBM VGA50", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA (8×14)", id: "IBM EGA", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA (8×16)", id: "IBM VGA", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G (8×19 (8×19)", id: "IBM VGA25G", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Icelandic", submenu: [
                        {label: "IBM VGA50 861 (8×8)", id: "IBM VGA50 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 861 (8×14)", id: "IBM EGA 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 861 (8×16)", id: "IBM VGA 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 861 (8×19)", id: "IBM VGA25G 861", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Latin-1 Western European", submenu: [
                        {label: "IBM VGA50 850 (8×8)", id: "IBM VGA50 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 850 (8×14)", id: "IBM EGA 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 850 (8×16)", id: "IBM VGA 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 850 (8×19)", id: "IBM VGA25G 850", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Latin-1 Central European", submenu: [
                        {label: "IBM VGA50 852 (8×8)", id: "IBM VGA50 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 852 (8×14)", id: "IBM EGA 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 852 (8×16)", id: "IBM VGA 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 852 (8×19)", id: "IBM VGA25G 852", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Latin-1 Multilingual", submenu: [
                        {label: "IBM VGA50 853 (8×8)", id: "IBM VGA50 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 853 (8×14)", id: "IBM EGA 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 853 (8×16)", id: "IBM VGA 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 853 (8×19)", id: "IBM VGA25G 853", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Nordic", submenu: [
                        {label: "IBM VGA50 865 (8×8)", id: "IBM VGA50 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 865 (8×14)", id: "IBM EGA 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 865 (8×16)", id: "IBM VGA 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 865 (8×19)", id: "IBM VGA25G 865", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Portuguese", submenu: [
                        {label: "IBM VGA50 860 (8×8)", id: "IBM VGA50 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 860 (8×14)", id: "IBM EGA 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 860 (8×16)", id: "IBM VGA 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA25G 860 (8×19)", id: "IBM VGA25G 860", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]},
                    {label: "Turkish", submenu: [
                        {label: "IBM VGA50 857 (8×8)", id: "IBM VGA50 857", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM EGA 857 (8×14)", id: "IBM EGA 857", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                        {label: "IBM VGA 857 (8×16)", id: "IBM VGA 857", click(item) {change_font(win, item.id);}, type: "checkbox", checked: false},
                    ]}
                ]},
                {type: "separator"},
                {label: "Open Reference Image\u2026", id: "open_reference_image", click(item) {open_reference_image({win});}},
                {label: "Toggle Reference Image", id: "toggle_reference_image", accelerator: "Ctrl+Tab", click(item) {toggle_reference_image(win, item.checked);}, enabled: false, type: "checkbox", checked: true},
                {label: "Clear", id: "clear_reference_image", click(item) {win.send("clear_reference_image");}, enabled: false},
                {type: "separator"},
                {role: "togglefullscreen"}
            ]
        }, {
            label: "&Network", submenu: [
                {label: "Start Server…", id: "start_server", click(item) {start_server({item, win});}, enabled: false},
                {label: "Connect to Server…", id: "connect_to_server", click(item) {connect_to_server();}, enabled: false},
                {type: "separator"},
                {label: "Toggle Chat Window", id: "chat_window_toggle", accelerator: "Ctrl+[", click(item) {win.send("chat_window_toggle");}, enabled: false},
                {type: "separator"},
                {label: "Disconnect", id: "disconnect", click(item) {disconnect({item, win});}, enabled: false},
            ]
        }, {
            label: "&Debug",
            submenu: [
                {label: "Open Dev Tools", id: "open_dev_tools", click(item) {open_dev_tools({item, win});}}
            ]
        }, {
            label: "Help", role: "help", submenu: [
                {label: "Cheatsheet", id: "show_cheatsheet", click(item) {show_cheatsheet();}},
                {type: "separator"},
                {label: "Acknowledgements", id: "show_cheatsheet", click(item) {show_acknowledgements();}},
            ]
        }]);
    }
}

function change_font(win, font_name) {
    if (docs[win.id].network) {
        electron.dialog.showMessageBox(win, {type: "error", message: "Change Font", detail: "The font cannot be changed when connected to a server."});
    } else {
        win.send("change_font", font_name);
    }
}

function show_splash_screen() {
    if (splash_screen_win && !splash_screen_win.isDestroyed()) {
        splash_screen_win.focus();
    } else {
        splash_screen_win = new electron.BrowserWindow({width: 720, height: 600, show: false, backgroundColor: "#000000", titleBarStyle: "hiddenInset", maximizable: false, resizable: false, useContentSize: true, frame: darwin ? false : true, fullscreenable: false, webPreferences: {nodeIntegration: true}});
        if (!darwin) splash_screen_win.setMenu(null);
        splash_screen_win.on("focus", (event) => {
            set_application_menu();
            discord_rpc.set_details("Admiring the splash screen");
        });
        splash_screen_win.on("ready-to-show", (event) => splash_screen_win.show());
        splash_screen_win.loadFile("app/html/splash_screen.html");
        splash_screen_win.setTouchBar(new electron.TouchBar({
            items: [
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "New", click() {new_document();}}),
                new electron.TouchBar.TouchBarButton({label: "Open", click() {open();}}),
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
                new electron.TouchBar.TouchBarButton({label: "Connect to Server", click() {connect_to_server();}}),
                new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
            ], escapeItem: new electron.TouchBar.TouchBarLabel({label: "Mœbius", textColor: "#939393"})
        }));
    }
}

function show_cheatsheet() {
    if (cheatsheet_win && !cheatsheet_win.isDestroyed()) {
        cheatsheet_win.focus();
    } else {
        cheatsheet_win = new electron.BrowserWindow({width: 640, height: 816, show: false, backgroundColor: "#000000", titleBarStyle: "hiddenInset", maximizable: false, resizable: false, useContentSize: true, frame: darwin ? false : true, fullscreenable: false, webPreferences: {nodeIntegration: true}});
        if (!darwin) cheatsheet_win.setMenu(null);
        cheatsheet_win.on("focus", (event) => {
            set_application_menu();
            discord_rpc.set_details("Admiring the cheatsheet");
        });
        cheatsheet_win.on("ready-to-show", (event) => cheatsheet_win.show());
        cheatsheet_win.loadFile("app/html/cheatsheet.html");
    }
}

function show_acknowledgements() {
    if (acknowledgements_win && !acknowledgements_win.isDestroyed()) {
        acknowledgements_win.focus();
    } else {
        acknowledgements_win = new electron.BrowserWindow({width: 640, height: 400, show: false, backgroundColor: "#000000", titleBarStyle: "hiddenInset", maximizable: false, resizable: false, useContentSize: true, frame: darwin ? false : true, fullscreenable: false, webPreferences: {nodeIntegration: true}});
        if (!darwin) acknowledgements_win.setMenu(null);
        acknowledgements_win.on("focus", (event) => {
            set_application_menu();
            discord_rpc.set_details("Admiring the acknowledgements");
        });
        acknowledgements_win.on("ready-to-show", (event) => acknowledgements_win.show());
        acknowledgements_win.loadFile("app/html/acknowledgements.html");
    }
}

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

function has_document_windows() {
    return Object.keys(docs).length > 0;
}

async function show_rendering_modal(event, id) {
    docs[id].modal = await new_modal_window({width: 200, height: 80, file: "app/html/rendering.html", parent: docs[id].win});
    if (darwin) electron.Menu.setApplicationMenu(docs[id].modal_menu);
    event.returnValue = true;
}

async function show_connecting_modal(event, id) {
    docs[id].modal = await new_modal_window({width: 200, height: 80, file: "app/html/connecting.html", parent: docs[id].win});
    if (darwin) electron.Menu.setApplicationMenu(docs[id].modal_menu);
    event.returnValue = true;
}

function close_modal(id) {
    if (docs[id].modal && !docs[id].modal.isDestroyed()) docs[id].modal.close();
    if (darwin) electron.Menu.setApplicationMenu(docs[id].menu);
}

function update_menu_checkboxes({id, insert_mode, use_9px_font, ice_colors, actual_size, font_name}) {
    const menu = docs[id].menu;
    menu.getMenuItemById("toggle_insert_mode").checked = insert_mode;
    menu.getMenuItemById("use_9px_font").checked = use_9px_font;
    menu.getMenuItemById("ice_colors").checked = ice_colors;
    menu.getMenuItemById("actual_size").checked = actual_size;
    if (docs[id].font_name) {
        menu.getMenuItemById(docs[id].font_name).checked = false;
        delete docs[id].font_name;
    }
    const font_menu_item = menu.getMenuItemById(font_name);
    if (font_menu_item) {
        font_menu_item.checked = true;
        docs[id].font_name = font_name;
    }
}

function enable_undo(id) {
    docs[id].menu.getMenuItemById("undo").enabled = true;
}

function disable_undo(id) {
    docs[id].menu.getMenuItemById("undo").enabled = false;
}

function enable_redo(id) {
    docs[id].menu.getMenuItemById("redo").enabled = true;
}

function disable_redo(id) {
    docs[id].menu.getMenuItemById("redo").enabled = false;
}

function disable_selection_menu_items(id) {
    docs[id].menu.getMenuItemById("cut").enabled = false;
    docs[id].menu.getMenuItemById("copy").enabled = false;
    docs[id].menu.getMenuItemById("delete_selection").enabled = false;
    docs[id].menu.getMenuItemById("deselect").enabled = false;
    docs[id].menu.getMenuItemById("move_block").enabled = false;
    docs[id].menu.getMenuItemById("copy_block").enabled = false;
}

function disable_selection_menu_items_except_deselect(id) {
    disable_selection_menu_items(id);
    docs[id].menu.getMenuItemById("deselect").enabled = true;
}

function enable_selection_menu_items(id) {
    docs[id].menu.getMenuItemById("cut").enabled = true;
    docs[id].menu.getMenuItemById("copy").enabled = true;
    docs[id].menu.getMenuItemById("delete_selection").enabled = true;
    docs[id].menu.getMenuItemById("deselect").enabled = true;
    docs[id].menu.getMenuItemById("move_block").enabled = true;
    docs[id].menu.getMenuItemById("copy_block").enabled = true;
}

function enable_operation_menu_items(id) {
    docs[id].menu.getMenuItemById("stamp").enabled = true;
    docs[id].menu.getMenuItemById("rotate").enabled = true;
    docs[id].menu.getMenuItemById("flip_x").enabled = true;
    docs[id].menu.getMenuItemById("flip_y").enabled = true;
    docs[id].menu.getMenuItemById("center").enabled = true;
}

function disable_operation_menu_items(id) {
    docs[id].menu.getMenuItemById("stamp").enabled = false;
    docs[id].menu.getMenuItemById("rotate").enabled = false;
    docs[id].menu.getMenuItemById("flip_x").enabled = false;
    docs[id].menu.getMenuItemById("flip_y").enabled = false;
    docs[id].menu.getMenuItemById("center").enabled = false;
}

function disable_editing_shortcuts(id) {
    disable_selection_menu_items(id);
    disable_operation_menu_items(id);
    docs[id].menu.getMenuItemById("use_attribute_under_cursor").enabled = false;
}

function enable_editing_shortcuts(id) {
    disable_selection_menu_items(id);
    disable_operation_menu_items(id);
    docs[id].menu.getMenuItemById("use_attribute_under_cursor").enabled = true;
}

function show_editing_touchbar(id) {
    docs[id].win.setTouchBar(docs[id].touch_bars.editing);
}

function show_selection_touchbar(id) {
    docs[id].win.setTouchBar(docs[id].touch_bars.selection);
}

function show_operation_touchbar(id) {
    docs[id].win.setTouchBar(docs[id].touch_bars.operation);
}

async function get_canvas_size({id, columns, rows}) {
    docs[id].modal = await new_modal_window({width: 300, height: 164, file: "app/html/resize.html", parent: docs[id].win});
    docs[id].modal.setTouchBar(docs[id].touch_bars.resize);
    docs[id].modal.send("set_canvas_size", {columns, rows});
    if (darwin) electron.Menu.setApplicationMenu(docs[id].modal_menu);
}

function set_canvas_size({id, columns, rows}) {
    close_modal(id);
    docs[id].win.send("set_canvas_size", {columns, rows});
}

async function get_sauce_info({id, title, author, group, comments}) {
    docs[id].modal = await new_modal_window({width: 350, height: 330, file: "app/html/sauce.html", parent: docs[id].win});
    docs[id].modal.send("set_sauce_info", {title, author, group, comments});
    docs[id].modal.setTouchBar(docs[id].touch_bars.sauce);
    if (darwin) electron.Menu.setApplicationMenu(docs[id].modal_menu);
}

function set_sauce_info({id, title, author, group, comments}) {
    close_modal(id);
    docs[id].win.send("set_sauce_info", {title, author, group, comments});
}

function document_changed(id) {
    if (!docs[id].network) {
        docs[id].edited = true;
        docs[id].win.setDocumentEdited(true);
    }
}

function show_brush_touchbar(id) {
    docs[id].win.setTouchBar(docs[id].touch_bars.brush);
}

function disable_clear_reference_image(id) {
    docs[id].menu.getMenuItemById("toggle_reference_image").enabled = false;
    docs[id].menu.getMenuItemById("clear_reference_image").enabled = false;
}

function change_to_select_mode(id) {
    docs[id].menu.getMenuItemById("change_to_select_mode").checked = true;
    docs[id].menu.getMenuItemById("change_to_brush_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_line_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_rectangle_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_fill_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_sample_mode").checked = false;
}

function change_to_brush_mode(id) {
    docs[id].menu.getMenuItemById("change_to_select_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_brush_mode").checked = true;
    docs[id].menu.getMenuItemById("change_to_line_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_rectangle_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_fill_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_sample_mode").checked = false;
}

function change_to_line_mode(id) {
    docs[id].menu.getMenuItemById("change_to_select_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_brush_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_line_mode").checked = true;
    docs[id].menu.getMenuItemById("change_to_rectangle_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_fill_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_sample_mode").checked = false;
}

function change_to_rectangle_mode(id) {
    docs[id].menu.getMenuItemById("change_to_select_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_brush_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_line_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_rectangle_mode").checked = true;
    docs[id].menu.getMenuItemById("change_to_fill_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_sample_mode").checked = false;
}

function change_to_fill_mode(id) {
    docs[id].menu.getMenuItemById("change_to_select_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_brush_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_line_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_rectangle_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_fill_mode").checked = true;
    docs[id].menu.getMenuItemById("change_to_sample_mode").checked = false;
}

function change_to_sample_mode(id) {
    docs[id].menu.getMenuItemById("change_to_select_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_brush_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_line_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_rectangle_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_fill_mode").checked = false;
    docs[id].menu.getMenuItemById("change_to_sample_mode").checked = true;
}

function change_to_network_mode(id) {
    docs[id].menu.getMenuItemById("edit_sauce_info").enabled = false;
    docs[id].menu.getMenuItemById("set_canvas_size").enabled = false;
    docs[id].menu.getMenuItemById("use_9px_font").enabled = false;
    docs[id].menu.getMenuItemById("ice_colors").enabled = false;
}

function destroy(id) {
    docs[id].win.close();
    cleanup_document(id);
}

function send_all(channel, opts) {
    for (const id of Object.keys(docs)) docs[id].win.send(channel, opts);
}

function nick(value) {
    prefs.set("nick", value);
    send_all("nick", {value});
}

function group(value) {
    prefs.set("group", value);
    send_all("group", {value});
}

function use_numpad(value) {
    prefs.set("use_numpad", value);
    send_all("use_numpad", {value});
}

function use_backup(value) {
    prefs.set("use_backup", value);
    send_all("use_backup", {value});
}

function backup_folder(value) {
    prefs.set("backup_folder", value);
    send_all("backup_folder", {value});
}

function enable_chat_window_toggle(id) {
    docs[id].menu.getMenuItemById("chat_window_toggle").enabled = true;
    docs[id].menu.getMenuItemById("chat_window_toggle").checked = true;
}

function chat_input_focus(id) {
    if (darwin) electron.Menu.setApplicationMenu(docs[id].chat_input_menu);
}

function chat_input_blur(id) {
    if (darwin) {
        if (docs[id] && docs[id].modal && !docs[id].modal.isDestroyed()) {
            electron.Menu.setApplicationMenu(docs[id].modal_menu);
        } else {
            electron.Menu.setApplicationMenu(docs[id].menu);
        }
    }
}

electron.ipcMain.on("new_document", (event) => new_document());
electron.ipcMain.on("open", (event) => open());
electron.ipcMain.on("connect_to_server", (event, {ip, port, nick, pass}) => connect_to_server({ip, port, nick, pass}));
electron.ipcMain.on("show_rendering_modal", (event, {id}) => show_rendering_modal(event, id));
electron.ipcMain.on("show_connecting_modal", (event, {id}) => show_connecting_modal(event, id));
electron.ipcMain.on("close_modal", (event, {id}) => close_modal(id));
electron.ipcMain.on("update_menu_checkboxes", (event, opts) => update_menu_checkboxes(opts));
electron.ipcMain.on("enable_undo", (event, {id}) => enable_undo(id));
electron.ipcMain.on("disable_undo", (event, {id}) => disable_undo(id));
electron.ipcMain.on("enable_redo", (event, {id}) => enable_redo(id));
electron.ipcMain.on("disable_redo", (event, {id}) => disable_redo(id));
electron.ipcMain.on("disable_selection_menu_items", (event, {id}) => disable_selection_menu_items(id));
electron.ipcMain.on("disable_selection_menu_items_except_deselect", (event, {id}) => disable_selection_menu_items_except_deselect(id));
electron.ipcMain.on("enable_selection_menu_items", (event, {id}) => enable_selection_menu_items(id));
electron.ipcMain.on("enable_operation_menu_items", (event, {id}) => enable_operation_menu_items(id));
electron.ipcMain.on("disable_operation_menu_items", (event, {id}) => disable_operation_menu_items(id));
electron.ipcMain.on("show_editing_touchbar", (event, {id}) => show_editing_touchbar(id));
electron.ipcMain.on("show_selection_touchbar", (event, {id}) => show_selection_touchbar(id));
electron.ipcMain.on("show_operation_touchbar", (event, {id}) => show_operation_touchbar(id));
electron.ipcMain.on("get_canvas_size", (event, opts) => get_canvas_size(opts));
electron.ipcMain.on("set_canvas_size", (event, opts) => set_canvas_size(opts));
electron.ipcMain.on("get_sauce_info", (event, opts) => get_sauce_info(opts));
electron.ipcMain.on("set_sauce_info", (event, opts) => set_sauce_info(opts));
electron.ipcMain.on("document_changed", (event, {id}) => document_changed(id));
electron.ipcMain.on("disable_editing_shortcuts", (event, {id}) => disable_editing_shortcuts(id));
electron.ipcMain.on("enable_editing_shortcuts", (event, {id}) => enable_editing_shortcuts(id));
electron.ipcMain.on("show_brush_touchbar", (event, {id}) => show_brush_touchbar(id));
electron.ipcMain.on("disable_clear_reference_image", (event, {id}) => disable_clear_reference_image(id));
electron.ipcMain.on("change_to_select_mode", (event, {id}) => change_to_select_mode(id));
electron.ipcMain.on("change_to_brush_mode", (event, {id}) => change_to_brush_mode(id));
electron.ipcMain.on("change_to_line_mode", (event, {id}) => change_to_line_mode(id));
electron.ipcMain.on("change_to_rectangle_mode", (event, {id}) => change_to_rectangle_mode(id));
electron.ipcMain.on("change_to_fill_mode", (event, {id}) => change_to_fill_mode(id));
electron.ipcMain.on("change_to_sample_mode", (event, {id}) => change_to_sample_mode(id));
electron.ipcMain.on("destroy", (event, {id}) => destroy(id));
electron.ipcMain.on("nick", (event, {value}) => nick(value));
electron.ipcMain.on("group", (event, {value}) => group(value));
electron.ipcMain.on("use_numpad", (event, {value}) => use_numpad(value));
electron.ipcMain.on("use_backup", (event, {value}) => use_backup(value));
electron.ipcMain.on("backup_folder", (event, {value}) => backup_folder(value));
electron.ipcMain.on("preferences", (event) => preferences());
electron.ipcMain.on("enable_chat_window_toggle", (event, {id}) => enable_chat_window_toggle(id));
electron.ipcMain.on("chat_input_focus", (event, {id}) => chat_input_focus(id));
electron.ipcMain.on("chat_input_blur", (event, {id}) => chat_input_blur(id));

module.exports = {show_splash_screen, open_file, set_application_menu, has_document_windows, connect_to_server};
