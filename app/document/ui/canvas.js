const doc = require("../doc");
const chat = require("./chat");
const cursor = require("../tools/cursor");
let interval, render;
let mouse_button = false;

function $(name) {
    return document.getElementById(name);
}

function hide(id) {
    $(id).classList.add("hidden");
}

function show(id) {
    $(id).classList.remove("hidden");
}

function start_blinking() {
    let vis_toggle = false;
    $("ice_color_container").style.display = "none";
    $("blink_off_container").style.removeProperty("display");
    if (interval) clearInterval(interval);
    interval = setInterval(() => {
        if (vis_toggle) {
            $("blink_on_container").style.display = "none";
            $("blink_off_container").style.removeProperty("display");
        } else {
            $("blink_off_container").style.display = "none";
            $("blink_on_container").style.removeProperty("display");
        }
        vis_toggle = !vis_toggle;
    }, 300);
}

function stop_blinking() {
    if (interval) clearInterval(interval);
    $("ice_color_container").style.removeProperty("display");
    $("blink_off_container").style.display = "none";
    $("blink_on_container").style.display = "none";
}

function update_frame() {
    const viewport = $("viewport");
    const view_rect = viewport.getBoundingClientRect();
    const view_frame = $("view_frame");
    if (render) {
        const scale_factor = render.width / 260;
        const width = Math.min(Math.ceil(view_rect.width / scale_factor), 260);
        const height = Math.min(Math.ceil(view_rect.height / scale_factor), render.height / scale_factor);
        const top = Math.ceil(viewport.scrollTop / scale_factor);
        const left = Math.ceil(viewport.scrollLeft / scale_factor);
        const preview = $("preview");
        view_frame.style.width = `${width}px`;
        view_frame.style.height = `${height}px`;
        view_frame.style.top = `${top}px`;
        view_frame.style.left = `${20 + left}px`;
        if (top < preview.scrollTop) preview.scrollTop = top;
        const preview_height = preview.getBoundingClientRect().height;
        if (top > preview_height + preview.scrollTop - height - 2) preview.scrollTop = top - preview_height + height + 2;
    }
}

chat.on("update_frame", () => update_frame());

function add(new_render) {
    hide("view_frame");
    const ice_color_container = $("ice_color_container");
    const blink_off_container = $("blink_off_container");
    const blink_on_container = $("blink_on_container");
    const preview = $("preview");
    if (render) {
        for (const canvas of render.ice_color_collection) ice_color_container.removeChild(canvas);
        for (const canvas of render.blink_off_collection) blink_off_container.removeChild(canvas);
        for (const canvas of render.blink_on_collection) blink_on_container.removeChild(canvas);
        for (const canvas of render.preview_collection) preview.removeChild(canvas);
    }
    render = new_render;
    $("canvas_container").style.width = `${render.width}px`;
    $("canvas_container").style.height = `${render.height}px`;
    for (const canvas of render.ice_color_collection) ice_color_container.appendChild(canvas);
    for (const canvas of render.blink_off_collection) blink_off_container.appendChild(canvas);
    for (const canvas of render.blink_on_collection) blink_on_container.appendChild(canvas);
    for (const canvas of render.preview_collection) preview.appendChild(canvas);
    show("view_frame");
    update_frame();
}

function update_with_mouse_pos(client_x, client_y) {
    const preview = $("preview");
    const viewport = $("viewport");
    const preview_rect = preview.getBoundingClientRect();
    const viewport_rect = viewport.getBoundingClientRect();
    const x = client_x - preview_rect.left - 20 + preview.scrollLeft;
    const y = client_y - preview_rect.top + preview.scrollTop;
    const scale_factor = render.width / 260;
    const half_view_width = viewport_rect.width / scale_factor / 2;
    const half_view_height = viewport_rect.height / scale_factor / 2;
    viewport.scrollLeft = Math.floor((x - half_view_width) * scale_factor);
    viewport.scrollTop = Math.floor((y - half_view_height) * scale_factor);
    update_frame();
}

function mouse_down(event) {
    if (event.button == 0) {
        mouse_button = true;
        update_with_mouse_pos(event.clientX, event.clientY);
        $("preview").classList.add("grabbing");
    }
}

function mouse_move(event) {
    if (mouse_button) update_with_mouse_pos(event.clientX, event.clientY);
}

function unregister_button(event) {
    if (mouse_button) {
        mouse_button = false;
        $("preview").classList.remove("grabbing");
    }
}

window.addEventListener("DOMContentLoaded", (event) => {
    $("viewport").addEventListener("scroll", event => update_frame(), true);
    window.addEventListener("resize", event => update_frame(), true);
    $("preview").addEventListener("mousedown", mouse_down, true);
    $("preview").addEventListener("mousemove", mouse_move, true);
    $("preview").addEventListener("mouseup", unregister_button, true);
    $("preview").addEventListener("mouseout", unregister_button, true);
}, true);

function goto_row(row) {
    const rows_in_view = Math.floor($("viewport").getBoundingClientRect().height / doc.font.height);
    $("viewport").scrollTop = (row - Math.floor(rows_in_view / 2)) * doc.font.height;
}

doc.on("render", () => add(doc.render));
doc.on("ice_color", (value) => {
    if (value) {
        start_blinking();
    } else {
        stop_blinking();
    }
});
doc.on("use_9px_font", () => add(doc.render));
doc.on("goto_row", (row_no) => goto_row(row_no));
doc.on("goto_self", () => goto_row(cursor.y));
module.export = {update_frame};
