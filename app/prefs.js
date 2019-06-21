const electron = require("electron");
const path = require("path");
const file = path.join(electron.app.getPath("userData"), "preferences.json");
const default_values = {nick: "Anonymous", group: "", use_flashing_cursor: false, use_pixel_aliasing: false, use_numpad: false, hide_scrollbars: false, use_backup: false, backup_folder: ""};
const fs = require("fs");
const prefs = (fs.existsSync(file)) ? JSON.parse(fs.readFileSync(file, "utf-8")) : default_values;

function set(key, value) {
    prefs[key] = value;
    fs.writeFileSync(path.join(electron.app.getPath("userData"), "preferences.json"), JSON.stringify(prefs));
}

function assign_default(key) {
    if (prefs[key] == undefined) set(key, default_values[key]);
}

function get(key) {
    assign_default(key);
    return prefs[key];
}

function get_all() {
    for (const key of Object.keys(default_values)) assign_default(key);
    return prefs;
}

function send(win) {
    const prefs = get_all();
    for (const key of Object.keys(prefs)) win.send(key, prefs[key]);
}

module.exports = {set, get, get_all, send};
