const electron = require("electron");
const events = new require("events");
const darwin = (process.platform == "darwin");
const menus = [];
const chat_menus = [];
const font_names = [];
const font_list = {
    "Amiga": {"Amiga Topaz 1": 16, "Amiga Topaz 1+": 16, "Amiga Topaz 2": 16, "Amiga Topaz 2+": 16, "Amiga P0T-NOoDLE": 16, "Amiga MicroKnight": 16, "Amiga MicroKnight+": 16, "Amiga mOsOul": 16},
    "Arabic": {"IBM VGA50 864": 8, "IBM EGA 864": 14, "IBM VGA 864": 16},
    "Baltic Rim": {"IBM VGA50 775": 8, "IBM EGA 775": 14, "IBM VGA 775": 16},
    "Cyrillic": {"IBM VGA50 866": 8, "IBM EGA 866": 14, "IBM VGA 866": 16, "IBM VGA50 855": 8, "IBM EGA 855": 14, "IBM VGA 855": 16},
    "French Canadian": {"IBM VGA50 863": 8, "IBM EGA 863": 14, "IBM VGA 863": 16, "IBM VGA25G 863": 19},
    "Greek": {"IBM VGA50 737": 8, "IBM EGA 737": 14, "IBM VGA 737": 16, "IBM VGA50 869": 8, "IBM EGA 869": 14, "IBM VGA 869": 16, "IBM VGA50 851": 8, "IBM EGA 851": 14, "IBM VGA 851": 16, "IBM VGA25G 851": 19},
    "Hebrew": {"IBM VGA50 862": 8, "IBM EGA 862": 14, "IBM VGA 862": 16},
    "IBM PC": {"IBM VGA50": 8, "IBM EGA": 14, "IBM VGA": 16, "IBM VGA25G": 19},
    "Icelandic": {"IBM VGA50 861": 8, "IBM EGA 861": 14, "IBM VGA 861": 16, "IBM VGA25G 861": 19},
    "Latin-1 Western European": {"IBM VGA50 850": 8, "IBM EGA 850": 14, "IBM VGA 850": 16, "IBM VGA25G 850": 19},
    "Latin-1 Central European": {"IBM VGA50 852": 8, "IBM EGA 852": 14, "IBM VGA 852": 16, "IBM VGA25G 852": 19},
    "Latin-1 Multilingual": {"IBM VGA50 853": 8, "IBM EGA 853": 14, "IBM VGA 853": 16, "IBM VGA25G 853": 19},
    "Nordic": {"IBM VGA50 865": 8, "IBM EGA 865": 14, "IBM VGA 865": 16, "IBM VGA25G 865": 19},
    "Portuguese": {"IBM VGA50 860": 8, "IBM EGA 860": 14, "IBM VGA 860": 16, "IBM VGA25G 860": 19},
    "Turkish": {"IBM VGA50 857": 8, "IBM EGA 857": 14, "IBM VGA 857": 16}
};

const moebius_menu = {
    label: "Mœbius",
    submenu: [
        {role: "about", label: "About Mœbius"},
        {type: "separator"},
        {label: "Preferences", id: "preferences", accelerator: "CmdorCtrl+,", click(item) {event.emit("preferences");}},
        {type: "separator"},
        {role: "services"},
        {type: "separator"},
        {role: "hide", label: "Hide Mœbius"},
        {role: "hideothers"},
        {role: "unhide"},
        {type: "separator"},
        {role: "quit", label: "Quit Mœbius"}
    ]
};

const bare_edit = {
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
};

const window_menu_items = {
    label: "Window",
    submenu: [
        {role: "minimize"},
        {role: "zoom"},
        {type: "separator"},
        {role: "front"}
    ]
};

const help_menu_items = {
    label: "Help", role: "help", submenu: [
        {label: "Cheatsheet", id: "show_cheatsheet", click(item) {event.emit("show_cheatsheet");}},
        {label: "Show Numpad Mappings", id: "show_numpad_mappings", click(item) {event.emit("show_numpad_mappings");}},
        {type: "separator"},
        {label: "Acknowledgements", id: "show_cheatsheet", click(item) {event.emit("show_acknowledgements");}},
        {type: "separator"},
        {label: "Mœbius Homepage", id: "show_homepage", click(item) {electron.shell.openExternal("http://www.andyh.org/moebius/");}},
        {label: "Source Code at GitHub", id: "show_repo", click(item) {electron.shell.openExternal("https://github.com/blocktronics/moebius");}},
        {label: "Raise an Issue at GitHub", id: "show_issues", click(item) {electron.shell.openExternal("https://github.com/blocktronics/moebius/issues");}},
    ]
};

const application = electron.Menu.buildFromTemplate([moebius_menu, {
    label: "File",
    submenu: [
        {label: "New", id: "new_document", accelerator: "Cmd+N", click(item) {event.emit("new_document");}},
        {type: "separator"},
        {label: "Open\u2026", id: "open", accelerator: "Cmd+O", click(item) {event.emit("open");}},
        {role: "recentDocuments", submenu: [{label: "Clear Menu", id: "clear_recent_documents", click(item) {electron.app.clearRecentDocuments();}}]},
        {type: "separator"},
        {role: "close"},
    ]
}, bare_edit, {
    label: "Network", submenu: [
        {label: "Connect to Server…", accelerator: "Cmd+Alt+S", id: "connect_to_server", click(item) {event.emit("show_new_connection_window");}},
    ]
}, window_menu_items, help_menu_items
]);

function file_menu_template(win) {
    return {
        label: "&File",
        submenu: [
            {label: "New", id: "new_document", accelerator: "CmdorCtrl+N", click(item) {event.emit("new_document");}},
            {label: "Duplicate as New Document", id: "duplicate", click(item) {win.send("duplicate");}},
            {type: "separator"},
            {label: "Open\u2026", id: "open", accelerator: "CmdorCtrl+O", click(item) {event.emit("open", win);}},
            darwin ? {role: "recentDocuments", submenu: [{role: "clearrecentdocuments"}]} : ({type: "separator"}, {label: "Settings", click(item) {event.emit("preferences");}}),
            {type: "separator"},
            {label: "Edit Sauce Info\u2026", id: "edit_sauce_info", accelerator: "CmdorCtrl+I", click(item) {win.send("get_sauce_info");}},
            {type: "separator"},
            {label: "Save", id: "save", accelerator: "CmdorCtrl+S", click(item) {win.send("save");}},
            {label: "Save As\u2026", id: "save_as", accelerator: "CmdorCtrl+Shift+S", click(item) {win.send("save_as");}},
            {type: "separator"},
            {label: "Export As PNG\u2026", id: "export_as_png", accelerator: "CmdorCtrl+Shift+E", click(item) {win.send("export_as_png");}},
            {label: "Export As UTF-8\u2026", id: "export_as_utf8", accelerator: "CmdorCtrl+Shift+U", click(item) {win.send("export_as_utf8");}},
            {type: "separator"},
            {role: "close", accelerator: darwin ? "Cmd+W" : "Alt+F4"}
        ]
    };
}

function edit_menu_template(win, chat) {
    return {
        label: "&Edit",
        submenu: [
            chat ? {label: "Undo", accelerator: "Cmd+Z", role: "undo"} : {label: "Undo", id: "undo", accelerator: darwin ? "Cmd+Z" : "", click(item) {win.send("undo");}, enabled: false},
            chat ? {label: "Redo", accelerator: "Cmd+Shift+Z", role: "redo"} : {label: "Redo", id: "redo", accelerator: darwin ? "Cmd+Shift+Z" : "", click(item) {win.send("redo");}, enabled: false},
            {type: "separator"},
            {label: "Change to Keyboard Mode", id: "change_to_select_mode", accelerator: "M", enabled: false},
            {type: "separator"},
            {label: "Toggle Insert Mode", id: "toggle_insert_mode", accelerator: darwin ? "" : "Insert", type: "checkbox", checked: false},
            {label: "Toggle Overwrite Mode", id: "overwrite_mode", accelerator: "CmdorCtrl+Alt+O", click(item) {win.send("overwrite_mode", item.checked);}, type: "checkbox", checked: false},
            {type: "separator"},
            {label: "Mirror Mode", id: "mirror_mode", accelerator: "CmdorCtrl+Alt+M", click(item) {win.send("mirror_mode", item.checked);}, type: "checkbox", checked: false},
            {type: "separator"},
            chat ? {label: "Cut", accelerator: "Cmd+X", role: "cut"} : {label: "Cut", id: "cut", accelerator: "CmdorCtrl+X", click(item) {win.send("cut");}, enabled: false},
            chat ? {label: "Copy", accelerator: "Cmd+C", role: "copy"} : {label: "Copy", id: "copy", accelerator: "CmdorCtrl+C", click(item) {win.send("copy");}, enabled: false},
            chat ? {label: "Paste", accelerator: "Cmd+V", role: "paste"} : {label: "Paste", id: "paste", accelerator: "CmdorCtrl+V", click(item) {win.send("paste");}, enabled: true},
            {label: "Paste As Selection", id: "paste_as_selection", accelerator: "CmdorCtrl+Alt+V", click(item) {win.send("paste_as_selection");}, enabled: true},
            {type: "separator"},
            {label: "Left Justify Line", id: "left_justify_line", accelerator: "Alt+L", click(item) {win.send("left_justify_line");}, enabled: true},
            {label: "Right Justify Line", id: "right_justify_line", accelerator: "Alt+R", click(item) {win.send("right_justify_line");}, enabled: true},
            {label: "Center Line", id: "center_line", accelerator: "Alt+C", click(item) {win.send("center_line");}, enabled: true},
            {label: "Erase Line", id: "erase_line", accelerator: "Alt+E", click(item) {win.send("erase_line");}, enabled: true},
            {type: "separator"},
            chat ? {label: "Select All", accelerator: "Cmd+A", role: "selectall"} : {label: "Select All", id: "select_all", accelerator: "CmdorCtrl+A", click(item) {win.send("select_all");}},
            {label: "Deselect", id: "deselect", accelerator: "Escape", click(item) {win.send("deselect");}, enabled: false},
            {type: "separator"},
            {label: "Set Canvas Size\u2026", id: "set_canvas_size", accelerator: "CmdorCtrl+Alt+C", click(item) {win.send("get_canvas_size");}, enabled: true},
            {type: "separator"},
            {label: "Crop", id: "crop", accelerator: "CmdorCtrl+K", click(item) {win.send("crop");}, enabled: false},
        ]
    };
}

function selection_menu_template(win) {
    return {
        label: "&Selection",
        submenu: [
            {label: "Move Block", id: "move_block", accelerator: "M", click(item) {win.send("move_block");}, enabled: false},
            {label: "Copy Block", id: "copy_block", accelerator: "C", click(item) {win.send("copy_block");}, enabled: false},
            {type: "separator"},
            {label: "Fill", id: "fill", accelerator: "F", click(item) {win.send("fill");}, enabled: false},
            {label: "Erase", id: "erase", accelerator: "E", click(item) {win.send("erase");}, enabled: false},
            {label: "Stamp", id: "stamp", accelerator: "S", click(item) {win.send("stamp");}, enabled: false},
            {label: "Place", id: "place", accelerator: "Enter", click(item) {win.send("place");}, enabled: false},
            {label: "Rotate", id: "rotate", accelerator: "R", click(item) {win.send("rotate");}, enabled: false},
            {label: "Flip X", id: "flip_x", accelerator: "X", click(item) {win.send("flip_x");}, enabled: false},
            {label: "Flip Y", id: "flip_y", accelerator: "Y", click(item) {win.send("flip_y");}, enabled: false},
            {label: "Center", id: "center", accelerator: "=", click(item) {win.send("center");}, enabled: false},
            {type: "separator"},
            {label: "Transparent", id: "transparent", accelerator: "T", click(item) {win.send("transparent", item.checked);}, type: "checkbox", checked: false, enabled: false},
            {label: "Over", id: "over", accelerator: "O", click(item) {win.send("over", item.checked);}, type: "checkbox", checked: false, enabled: false},
            {label: "Underneath", id: "underneath", accelerator: "U", click(item) {win.send("underneath", item.checked);}, type: "checkbox", checked: false, enabled: false},
        ]
    };
}

function font_menu_items(win) {
    return Object.keys(font_list).map((menu_title) => {
        return {label: menu_title, submenu: Object.keys(font_list[menu_title]).map((font_name) => {
            return {label: `${font_name} (8×${font_list[menu_title][font_name]})`, id: font_name, click(item) {win.send("change_font", font_name);}, type: "checkbox", checked: false};
        })};
    });
}

function view_menu_template(win) {
    return {
        label: "&View",
        submenu: [
            {label: "Show Status Bar", id: "show_status_bar", accelerator: "CmdorCtrl+/", click(item) {win.send("show_statusbar", item.checked);}, type: "checkbox", checked: true},
            {label: "Show Tool Bar", id: "show_tool_bar", accelerator: "CmdorCtrl+T", click(item) {win.send("show_toolbar", item.checked);}, type: "checkbox", checked: true},
            {label: "Show Preview", id: "show_preview", accelerator: "CmdorCtrl+Alt+P", click(item) {win.send("show_preview", item.checked);}, type: "checkbox", checked: true},
            {type: "separator"},
            {label: "Use 9px Font", id: "use_9px_font", accelerator: "CmdorCtrl+F", click(item) {win.send("use_9px_font", item.checked);}, type: "checkbox", checked: false},
            {type: "separator"},
            {label: "Actual Size", id: "actual_size", accelerator: "CmdorCtrl+Alt+0", click(item) {win.send("actual_size");}, type: "checkbox", checked: false},
            {label: "Zoom In", id: "zoom_in", accelerator: "CmdorCtrl+=", click(item) {win.send("zoom_in");}},
            {label: "Zoom Out", id: "zoom_out", accelerator: "CmdorCtrl+-", click(item) {win.send("zoom_out");}},
            {type: "separator"},
            {label: "Change Font", submenu: font_menu_items(win)},
            {type: "separator"},
            {label: "Toggle 80×25 Guides", id: "smallscale_guide", click(item) {win.send("toggle_smallscale_guide", item.checked);}, type: "checkbox", checked: false},
            {type: "separator"},
            {label: "Open Reference Image\u2026", id: "open_reference_image", accelerator: "CmdorCtrl+Shift+O", click(item) {win.send("open_reference_image");}},
            {label: "Toggle Reference Image", id: "toggle_reference_image", accelerator: "Ctrl+Tab", click(item) {win.send("toggle_reference_image", item.checked);}, enabled: false, type: "checkbox", checked: true},
            {label: "Clear", id: "clear_reference_image", click(item) {win.send("clear_reference_image");}, enabled: false},
            {type: "separator"},
            {label: "Scroll Document With Cursor", id: "scroll_document_with_cursor", accelerator: "CmdorCtrl+R", click(item) {win.send("scroll_document_with_cursor", item.checked);}, type: "checkbox", checked: false},
            {type: "separator"},
            {role: "togglefullscreen"}
        ]
    };
}

function colors_menu_template(win) {
    return {
        label: "Colors",
        submenu: [
            {label: "Previous Foreground Color", id: "previous_foreground_color", accelerator: "Alt+Up", click(item) {win.send("previous_foreground_color");}},
            {label: "Next Foreground Color", id: "next_foreground_color", accelerator: "Alt+Down", click(item) {win.send("next_foreground_color");}},
            {type: "separator"},
            {label: "Previous Background Color", id: "previous_background_colour", accelerator: "Alt+Left", click(item) {win.send("previous_background_color");}},
            {label: "Next Background Color", id: "next_background_color", accelerator: "Alt+Right", click(item) {win.send("next_background_color");}},
            {type: "separator"},
            {label: "Use Attribute Under Cursor", id: "use_attribute_under_cursor", accelerator: "Alt+U", click(item) {win.send("use_attribute_under_cursor");}},
            {label: "Default Color", id: "default_color", accelerator: "CmdorCtrl+D", click(item) {win.send("default_color");}},
            {label: "Switch Foreground / Background", id: "switch_foreground_background", accelerator: "Shift+CmdorCtrl+X", click(item) {win.send("switch_foreground_background");}},
            {type: "separator"},
            {label: "Use iCE Colors", id: "ice_colors", accelerator: "CmdorCtrl+E", click(item) {win.send("ice_colors", item.checked);}, type: "checkbox", checked: false},
        ]
    };
}

function network_menu_template(win, enabled) {
    return {
        label: "&Network", submenu: [
            {label: "Connect to Server…", id: "connect_to_server", accelerator: "CmdorCtrl+Alt+S", click(item) {event.emit("show_new_connection_window");}},
            {type: "separator"},
            {label: "Toggle Chat Window", id: "chat_window_toggle", accelerator: "CmdorCtrl+[", click(item) {win.send("chat_window_toggle");}, enabled},
        ]
    };
}

function debug_menu_template(win) {
    return {
        label: "Debug",
        submenu: [
            {label: "Open Dev Tools", id: "open_dev_tools", click(item) {win.openDevTools({mode: "detach"});}}
        ]
    };
}

function create_menu_template(win, chat, debug) {
    const menu_lists = [file_menu_template(win), edit_menu_template(win, chat), selection_menu_template(win), colors_menu_template(win), view_menu_template(win), network_menu_template(win, chat)];
    if (debug) menu_lists.push(debug_menu_template(win));
    return menu_lists;
}

function get_menu_item(id, name) {
    return menus[id].getMenuItemById(name);
}

function get_chat_menu_item(id, name) {
    return chat_menus[id].getMenuItemById(name);
}

function enable(id, name) {
    get_menu_item(id, name).enabled = true;
    if (name != "cut" && name != "copy" && name != "paste" && name != "undo" && name != "redo" && name != "select_all") get_chat_menu_item(id, name).enabled = true;
}

function disable(id, name) {
    get_menu_item(id, name).enabled = false;
    if (name != "cut" && name != "copy" && name != "paste" && name != "undo" && name != "redo" && name != "select_all") get_chat_menu_item(id, name).enabled = false;
}

function check(id, name) {
    get_menu_item(id, name).checked = true;
    get_chat_menu_item(id, name).checked = true;
}

function uncheck(id, name) {
    get_menu_item(id, name).checked = false;
    get_chat_menu_item(id, name).checked = false;
}

function set_check(id, name, value) {
    get_menu_item(id, name).checked = value;
    get_chat_menu_item(id, name).checked = value;
}

electron.ipcMain.on("enable_undo", (event, {id}) => {
    enable(id, "undo");
});

electron.ipcMain.on("disable_undo", (event, {id}) => {
    disable(id, "undo");
});

electron.ipcMain.on("enable_redo", (event, {id}) => {
    enable(id, "redo");
});

electron.ipcMain.on("disable_redo", (event, {id}) => {
    disable(id, "redo");
});

electron.ipcMain.on("enable_reference_image", (event, {id}) => {
    enable(id, "toggle_reference_image");
    check(id, "toggle_reference_image");
    enable(id, "clear_reference_image");
});

electron.ipcMain.on("disable_clear_reference_image", (event, {id}) => {
    disable(id, "toggle_reference_image");
    disable(id, "clear_reference_image");
});

electron.ipcMain.on("enable_selection_menu_items", (event, {id}) => {
    enable(id, "cut");
    enable(id, "copy");
    enable(id, "erase");
    enable(id, "fill");
    disable(id, "paste");
    disable(id, "paste_as_selection");
    enable(id, "deselect");
    enable(id, "move_block");
    enable(id, "copy_block");
    enable(id, "crop");
    disable(id, "left_justify_line");
    disable(id, "right_justify_line");
    disable(id, "center_line");
    disable(id, "erase_line");
    disable(id, "use_attribute_under_cursor");
});

function disable_selection_menu_items(id) {
    disable(id, "cut");
    disable(id, "copy");
    disable(id, "erase");
    disable(id, "fill");
    disable(id, "deselect");
    disable(id, "move_block");
    disable(id, "copy_block");
    disable(id, "crop");
    enable(id, "paste");
    enable(id, "paste_as_selection");
    enable(id, "left_justify_line");
    enable(id, "right_justify_line");
    enable(id, "center_line");
    enable(id, "erase_line");
    enable(id, "use_attribute_under_cursor");
}

electron.ipcMain.on("disable_selection_menu_items", (event, {id}) => disable_selection_menu_items(id));

electron.ipcMain.on("disable_selection_menu_items_except_deselect_and_crop", (event, {id}) => {
    disable_selection_menu_items(id);
    enable(id, "deselect");
    enable(id, "crop");
});

electron.ipcMain.on("enable_operation_menu_items", (event, {id}) => {
    enable(id, "stamp");
    enable(id, "place");
    enable(id, "rotate");
    enable(id, "flip_x");
    enable(id, "flip_y");
    enable(id, "center");
    enable(id, "transparent");
    enable(id, "over");
    check(id, "over");
    enable(id, "underneath");
    disable(id, "left_justify_line");
    disable(id, "right_justify_line");
    disable(id, "center_line");
    disable(id, "erase_line");
    disable(id, "paste");
    disable(id, "paste_as_selection");
    disable(id, "use_attribute_under_cursor");
});

function disable_operation_menu_items(id) {
    disable(id, "stamp");
    disable(id, "place");
    disable(id, "rotate");
    disable(id, "flip_x");
    disable(id, "flip_y");
    disable(id, "center");
    disable(id, "transparent");
    uncheck(id, "transparent");
    disable(id, "over");
    uncheck(id, "over");
    disable(id, "underneath");
    uncheck(id, "underneath");
    enable(id, "paste");
    enable(id, "paste_as_selection");
    enable(id, "use_attribute_under_cursor");
}

electron.ipcMain.on("disable_operation_menu_items", (event, {id}) => disable_operation_menu_items(id));

electron.ipcMain.on("disable_editing_shortcuts", (event, {id}) => {
    disable_selection_menu_items(id);
    disable_operation_menu_items(id);
    disable(id, "use_attribute_under_cursor");
    disable(id, "left_justify_line");
    disable(id, "right_justify_line");
    disable(id, "center_line");
    disable(id, "erase_line");
    disable(id, "paste");
    disable(id, "paste_as_selection");
    enable(id, "change_to_select_mode");
});

electron.ipcMain.on("enable_editing_shortcuts", (event, {id}) => {
    disable_selection_menu_items(id);
    disable_operation_menu_items(id);
    enable(id, "use_attribute_under_cursor");
    enable(id, "left_justify_line");
    enable(id, "right_justify_line");
    enable(id, "center_line");
    enable(id, "erase_line");
    enable(id, "paste");
    enable(id, "paste_as_selection");
    disable(id, "change_to_select_mode");
});

electron.ipcMain.on("update_menu_checkboxes", (event, {id, insert_mode, overwrite_mode, use_9px_font, ice_colors, actual_size, font_name}) => {
    if (insert_mode != undefined) set_check(id, "toggle_insert_mode", insert_mode);
    if (overwrite_mode != undefined) set_check(id, "overwrite_mode", overwrite_mode);
    if (use_9px_font != undefined) set_check(id, "use_9px_font", use_9px_font);
    if (ice_colors != undefined) set_check(id, "ice_colors", ice_colors);
    if (actual_size != undefined) set_check(id, "actual_size", actual_size);
    if (font_name != undefined) {
        if (font_names[id]) uncheck(id, font_names[id]);
        if (get_menu_item(id, font_name)) {
            check(id, font_name);
            font_names[id] = font_name;
        }
    }
});

electron.ipcMain.on("uncheck_transparent", (event, {id}) => uncheck(id, "transparent"));
electron.ipcMain.on("uncheck_underneath", (event, {id}) => uncheck(id, "underneath"));
electron.ipcMain.on("check_underneath", (event, {id}) => check(id, "underneath"));
electron.ipcMain.on("uncheck_over", (event, {id}) => uncheck(id, "over"));
electron.ipcMain.on("check_over", (event, {id}) => check(id, "over"));

electron.ipcMain.on("uncheck_smallscale_guide", (event, {id}) => uncheck(id, "smallscale_guide"));
electron.ipcMain.on("check_smallscale_guide", (event, {id}) => check(id, "smallscale_guide"));

electron.ipcMain.on("enable_chat_window_toggle", (event, {id}) => {
    enable(id, "chat_window_toggle");
    check(id, "chat_window_toggle");
});

class MenuEvent extends events.EventEmitter {
    set_application_menu() {
        if (darwin) electron.Menu.setApplicationMenu(application);
    }

    chat_input_menu(win, debug) {
        const menu = darwin ? electron.Menu.buildFromTemplate([moebius_menu, ...create_menu_template(win, true, debug), window_menu_items, help_menu_items]) : electron.Menu.buildFromTemplate([...create_menu_template(win, true, debug), help_menu_items]);
        chat_menus[win.id] = menu;
        return menu;
    }

    get modal_menu() {
        return electron.Menu.buildFromTemplate([moebius_menu, bare_edit, window_menu_items, help_menu_items]);
    }

    document_menu(win, debug) {
        const menu = darwin ? electron.Menu.buildFromTemplate([moebius_menu, ...create_menu_template(win, false, debug), window_menu_items, help_menu_items]) : electron.Menu.buildFromTemplate([...create_menu_template(win, false, debug), help_menu_items]);
        menus[win.id] = menu;
        return menu;
    }

    get dock_menu() {
        return electron.Menu.buildFromTemplate([
            {label: "New Document", click(item) {event.emit("new_document");}},
            {label: "Open\u2026", click(item) {event.emit("open");}},
            {label: "Preferences", click(item) {event.emit("preferences");}},
            {label: "Connect to Server…", click(item) {event.emit("show_new_connection_window");}}
        ]);
    }

    cleanup(id) {
        delete menus[id];
        delete font_names[id];
    }
}

const event = new MenuEvent();

module.exports = event;
