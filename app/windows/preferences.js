const electron = require("electron");
const {send, open_box} = require("../senders");
let backup_folder_value;

function $(name) {
    return document.getElementById(name);
}

function prefs({nick, group, use_numpad, use_shift, chunked_undo, use_flashing_cursor, use_pixel_aliasing, hide_scrollbars, unsaved_changes, scroll_margin, new_document_rows, retention, smallscale_guide, debug, ignore_hdpi, use_backup, backup_folder}) {
    $("nick").value = nick;
    $("group").value = group;
    $("use_numpad").checked = use_numpad;
    $("use_shift").checked = use_shift;
    $("chunked_undo").checked = chunked_undo;
    $("use_flashing_cursor").checked = use_flashing_cursor;
    $("use_pixel_aliasing").checked = use_pixel_aliasing;
    $("hide_scrollbars").checked = hide_scrollbars;
    $("unsaved_changes").checked = unsaved_changes;
    $("scroll_margin").value = scroll_margin;
    $("new_document_rows").value = new_document_rows;
    $("retention").value = retention;
    $("smallscale_guide").checked = smallscale_guide;
    $("debug").checked = debug;
    $("ignore_hdpi").checked = ignore_hdpi;
    $("use_backup").checked = use_backup;
    backup_folder_value = backup_folder;
    $("backup_folder").innerText = (backup_folder == "") ? "No Backup Folder Set" : backup_folder;
}

function update(key, value) {
    electron.ipcRenderer.send("update_prefs", {key, value});
}

function nick() {
    update("nick", $("nick").value);
}

function group() {
    update("group", $("group").value);
}

function use_numpad() {
    update("use_numpad", $("use_numpad").checked);
}

function use_shift() {
    update("use_shift", $("use_shift").checked);
}

function chunked_undo() {
    update("chunked_undo", $("chunked_undo").checked);
}

function use_flashing_cursor() {
    update("use_flashing_cursor", $("use_flashing_cursor").checked);
}

function use_pixel_aliasing() {
    update("use_pixel_aliasing", $("use_pixel_aliasing").checked);
}

function hide_scrollbars() {
    update("hide_scrollbars", $("hide_scrollbars").checked);
}

function unsaved_changes() {
    update("unsaved_changes", $("unsaved_changes").checked);
}

function scroll_margin() {
    update("scroll_margin", $("scroll_margin").value);
}

function new_document_rows() {
    update("new_document_rows", $("new_document_rows").value);
}

function smallscale_guide() {
    update("smallscale_guide", $("smallscale_guide").checked);
}

function retention() {
    update("retention", $("retention").value);
}

function ignore_hdpi() {
    update("ignore_hdpi", $("ignore_hdpi").checked);
}

function debug() {
    update("debug", $("debug").checked);
}

function use_backup() {
    update("use_backup", $("use_backup").checked);
}

function choose_folder() {
    const defaultPath = (backup_folder_value && backup_folder_value != "") ? backup_folder_value : electron.remote.app.getPath("documents");
    const files = open_box({defaultPath, properties: ["openDirectory", "createDirectory"]});
    if (files) {
        const folder = files[0];
        $("backup_folder").innerText = folder;
        update("backup_folder", folder);
    }
}

function reset_fkeys() {
    update("fkeys", [ // Stolen mercilously from Pablo, thanks Curtis!
        [218, 191, 192, 217, 196, 179, 195, 180, 193, 194, 32, 32],
        [201, 187, 200, 188, 205, 186, 204, 185, 202, 203, 32, 32],
        [213, 184, 212, 190, 205, 179, 198, 181, 207, 209, 32, 32],
        [214, 183, 211, 189, 196, 186, 199, 182, 208, 210, 32, 32],
        [197, 206, 216, 215, 232, 232, 155, 156, 153, 239, 32, 32],
        [176, 177, 178, 219, 223, 220, 221, 222, 254, 250, 32, 32],
        [1, 2, 3, 4, 5, 6, 240, 14, 15, 32, 32, 32],
        [24, 25, 30, 31, 16, 17, 18, 29, 20, 21, 32, 32],
        [174, 175, 242, 243, 169, 170, 253, 246, 171, 172, 32, 32],
        [227, 241, 244, 245, 234, 157, 228, 248, 251, 252, 32, 32],
        [224, 225, 226, 229, 230, 231, 235, 236, 237, 238, 32, 32],
        [128, 135, 165, 164, 152, 159, 247, 249, 173, 168, 32, 32],
        [131, 132, 133, 160, 166, 134, 142, 143, 145, 146, 32, 32],
        [136, 137, 138, 130, 144, 140, 139, 141, 161, 158, 32, 32],
        [147, 148, 149, 162, 167, 150, 129, 151, 163, 154, 32, 32],
        [47, 92, 40, 41, 123, 125, 91, 93, 96, 39, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
        [32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 32],
    ]);
}

function override_submit(event) {
    if (event.code == "Enter" || event.code == "NumpadEnter") event.preventDefault();
}

document.addEventListener("DOMContentLoaded", (event) => {
    $("nick").addEventListener("keydown", override_submit, true);
    $("nick").addEventListener("input", (event) => nick(), true);
    $("group").addEventListener("keydown", override_submit, true);
    $("group").addEventListener("input", (event) => group(), true);
    $("use_numpad").addEventListener("change", (event) => use_numpad(), true);
    $("use_shift").addEventListener("change", (event) => use_shift(), true);
    $("chunked_undo").addEventListener("change", (event) => chunked_undo(), true);
    $("use_flashing_cursor").addEventListener("change", (event) => use_flashing_cursor(), true);
    $("hide_scrollbars").addEventListener("change", (event) => hide_scrollbars(), true);
    $("unsaved_changes").addEventListener("change", (event) => unsaved_changes(), true);
    $("use_pixel_aliasing").addEventListener("change", (event) => use_pixel_aliasing(), true);
    $("scroll_margin").addEventListener("input", (event) => scroll_margin(), true);
    $("scroll_margin").addEventListener("keydown", override_submit, true);
    $("new_document_rows").addEventListener("input", (event) => new_document_rows(), true);
    $("new_document_rows").addEventListener("keydown", override_submit, true);
    $("retention").addEventListener("change", retention, true);
    $("smallscale_guide").addEventListener("change", (event) => smallscale_guide(), true);
    $("debug").addEventListener("change", (event) => debug(), true);
    $("ignore_hdpi").addEventListener("change", (event) => ignore_hdpi(), true);
    $("use_backup").addEventListener("change", (event) => use_backup(), true);
    $("backup_choose").addEventListener("click", (event) => {
        choose_folder();
        event.preventDefault();
    }, true);
    $("reset_fkeys").addEventListener("click", (event) => {
        reset_fkeys();
        event.preventDefault();
    }, true);
    document.body.addEventListener("keydown", (event) => {
        if (event.code == "Escape") electron.remote.getCurrentWindow().close();
    }, true);
}, true);

electron.ipcRenderer.on("prefs", (event, opts) => prefs(opts));
