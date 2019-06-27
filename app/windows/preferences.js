const electron = require("electron");
const {open_box} = require("../senders");
let backup_folder_value;

function $(name) {
    return document.getElementById(name);
}

function prefs({nick, group, use_numpad, chunked_undo, use_flashing_cursor, use_pixel_aliasing, hide_scrollbars, unsaved_changes, scroll_margin, new_document_rows, smallscale_guide, use_backup, backup_folder}) {
    $("nick").value = nick;
    $("group").value = group;
    $("use_numpad").checked = use_numpad;
    $("chunked_undo").checked = chunked_undo;
    $("use_flashing_cursor").checked = use_flashing_cursor;
    $("use_pixel_aliasing").checked = use_pixel_aliasing;
    $("hide_scrollbars").checked = hide_scrollbars;
    $("unsaved_changes").checked = unsaved_changes;
    $("scroll_margin").value = scroll_margin;
    $("new_document_rows").value = new_document_rows;
    $("smallscale_guide").checked = smallscale_guide;
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

function use_backup() {
    update("use_backup", $("use_backup").checked);
}

function choose_folder() {
    const defaultPath = (backup_folder_value && backup_folder_value != "") ? backup_folder_value : electron.remote.app.getPath("documents");
    open_box({defaultPath, properties: ["openDirectory", "createDirectory"]}, (files) => {
        if (files) {
            const folder = files[0];
            $("backup_folder").innerText = folder;
            update("backup_folder", folder);
        }
    });
}

function override_submit(event) {
    if (event.key == "Enter" || event.key == "NumpadEnter") event.preventDefault();
}

document.addEventListener("DOMContentLoaded", (event) => {
    $("nick").addEventListener("keydown", override_submit, true);
    $("nick").addEventListener("input", (event) => nick(), true);
    $("group").addEventListener("keydown", override_submit, true);
    $("group").addEventListener("input", (event) => group(), true);
    $("use_numpad").addEventListener("change", (event) => use_numpad(), true);
    $("chunked_undo").addEventListener("change", (event) => chunked_undo(), true);
    $("use_flashing_cursor").addEventListener("change", (event) => use_flashing_cursor(), true);
    $("hide_scrollbars").addEventListener("change", (event) => hide_scrollbars(), true);
    $("unsaved_changes").addEventListener("change", (event) => unsaved_changes(), true);
    $("use_pixel_aliasing").addEventListener("change", (event) => use_pixel_aliasing(), true);
    $("scroll_margin").addEventListener("input", (event) => scroll_margin(), true);
    $("scroll_margin").addEventListener("keydown", override_submit, true);
    $("new_document_rows").addEventListener("input", (event) => new_document_rows(), true);
    $("new_document_rows").addEventListener("keydown", override_submit, true);
    $("smallscale_guide").addEventListener("change", (event) => smallscale_guide(), true);
    $("backup_choose").addEventListener("click", (event) => {
        choose_folder();
        event.preventDefault();
    }, true);
    $("use_backup").addEventListener("change", (event) => use_backup(), true);
    document.body.addEventListener("keydown", (event) => {
        if (event.code == "Escape") electron.remote.getCurrentWindow().close();
    }, true);
}, true);

electron.ipcRenderer.on("prefs", (event, opts) => prefs(opts));
