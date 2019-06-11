const electron = require("electron");
const fs = require("fs");
const path = require("path");
const file = path.join(electron.app.getPath("userData"), "preferences.json");
if(!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
const prefs = JSON.parse(fs.readFileSync(file, "utf-8"));
const default_values = {nick: "Anon", use_numpad: false, use_backup: false, backup_folder: ""};

function set(key, value) {
    prefs[key] = value;
    fs.writeFileSync(file, JSON.stringify(prefs));
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

module.exports = {set, get, get_all};
