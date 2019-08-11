const electron = require("electron");
const touchbars = [];

function create_touch_bars(win) {
    const touchbar = {
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
                new electron.TouchBar.TouchBarButton({label: "Fill", click() {win.send("fill");}}),
                new electron.TouchBar.TouchBarButton({label: "Erase", click() {win.send("erase");}}),
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
                new electron.TouchBar.TouchBarButton({label: "Prev. Background", click() {win.send("previous_background_color");}}),
                new electron.TouchBar.TouchBarButton({label: "Next Background", click() {win.send("next_background_color");}}),
            ],
            escapeItem: new electron.TouchBar.TouchBarButton({label: "Edit", click() {win.send("change_to_select_mode");}})
        })
    };
    touchbars[win.id] = {win, touchbar};
}

function simple_touch_bar(win, option) {
    return new electron.TouchBar({
        items: [
            new electron.TouchBar.TouchBarButton({
                label: option,
                click() {
                    win.send("ok");
                }
            })
        ],
        escapeItem: new electron.TouchBar.TouchBarButton({
            label: "Cancel",
            click() {
                win.send("cancel");
            }
        })
    });
}

function get_sauce_info(win) {
    win.setTouchBar(simple_touch_bar(win, "Update"));
}

function get_canvas_size(win) {
    win.setTouchBar(simple_touch_bar(win, "Resize"));
}

function new_connection(win) {
    win.setTouchBar(simple_touch_bar(win, "Connect"));
}

function splash_screen(win, {preferences, new_document, open}) {
    win.setTouchBar(new electron.TouchBar({
        items: [
            new electron.TouchBar.TouchBarButton({
                label: "New",
                click() {
                    new_document();
                }
            }),
            new electron.TouchBar.TouchBarButton({
                label: "Open",
                click() {
                    open();
                }
            }),
            new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
        ],
        escapeItem: new electron.TouchBar.TouchBarButton({
            label: "Preferences",
            click() {
                preferences();
            }
        })
    }));
}

function select_attribute(win) {
    win.setTouchBar(new electron.TouchBar({
        items: [
            new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
            new electron.TouchBar.TouchBarButton({label: "Prev. Foreground", click() {win.send("previous_foreground_color");}}),
            new electron.TouchBar.TouchBarButton({label: "Next Foreground", click() {win.send("next_foreground_color");}}),
            new electron.TouchBar.TouchBarSpacer({size: "flexible"}),
            new electron.TouchBar.TouchBarButton({label: "Prev. Background", click() {win.send("previous_background_color");}}),
            new electron.TouchBar.TouchBarButton({label: "Next Background", click() {win.send("next_background_color");}}),
        ],
        escapeItem: new electron.TouchBar.TouchBarButton({label: "Cancel", click() {win.send("cancel");}})
    }));
}

electron.ipcMain.on("show_editing_touchbar", (event, {id}) => touchbars[id].win.setTouchBar(touchbars[id].touchbar.editing));
electron.ipcMain.on("show_selection_touchbar", (event, {id}) => touchbars[id].win.setTouchBar(touchbars[id].touchbar.selection));
electron.ipcMain.on("show_operation_touchbar", (event, {id}) => touchbars[id].win.setTouchBar(touchbars[id].touchbar.operation));
electron.ipcMain.on("show_brush_touchbar", (event, {id}) => touchbars[id].win.setTouchBar(touchbars[id].touchbar.brush));

module.exports = {create_touch_bars, get_sauce_info, get_canvas_size, select_attribute, new_connection, splash_screen};
