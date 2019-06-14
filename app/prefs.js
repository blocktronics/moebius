const electron = require("electron");
const fs = require("fs");
const path = require("path");
let prefs;
const default_values = {nick: "Anonymous", group: "", use_flashing_cursor: false, use_numpad: false, use_backup: false, backup_folder: ""};

electron.app.on("ready", (event) => {
    const file = path.join(electron.app.getPath("userData"), "preferences.json");
    if(!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}));
    prefs = JSON.parse(fs.readFileSync(file, "utf-8"));
});

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

module.exports = {set, get, get_all};
