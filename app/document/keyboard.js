const events = require("events");
const darwin = (process.platform == "darwin");

class KeyboardEvent extends events.EventEmitter {
    chat(text) {
        this.emit("chat", text);
    }

    ctrl_key(event) {
        switch (event.code) {
            case "Digit0":
                this.emit("toggle_bg", 0);
                return;
            case "Digit1":
                this.emit("toggle_bg", 1);
                return;
            case "Digit2":
                this.emit("toggle_bg", 2);
                return;
            case "Digit3":
                this.emit("toggle_bg", 3);
                return;
            case "Digit4":
                this.emit("toggle_bg", 4);
                return;
            case "Digit5":
                this.emit("toggle_bg", 5);
                return;
            case "Digit6":
                this.emit("toggle_bg", 6);
                return;
            case "Digit7":
                this.emit("toggle_bg", 7);
                return;
            case "KeyC":
                this.emit("copy");
                return;
            case "KeyV":
                this.emit("copy");
                return;
            case "KeyX":
                this.emit("cut");
                return;
            case "KeyA":
                this.emit("select_all");
                return;
            case "ArrowLeft":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("start_of_row");
                event.preventDefault();
                return;
            case "ArrowUp":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("page_up");
                event.preventDefault();
                return;
            case "ArrowRight":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("end_of_row");
                event.preventDefault();
                return;
            case "ArrowDown":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("page_down");
                event.preventDefault();
                return;
        }
    }

    alt_key(event) {
        switch (event.code) {
            case "Digit0":
                this.emit("toggle_fg", 0);
                return;
            case "Digit1":
                this.emit("toggle_fg", 1);
                return;
            case "Digit2":
                this.emit("toggle_fg", 2);
                return;
            case "Digit3":
                this.emit("toggle_fg", 3);
                return;
            case "Digit4":
                this.emit("toggle_fg", 4);
                return;
            case "Digit5":
                this.emit("toggle_fg", 5);
                return;
            case "Digit6":
                this.emit("toggle_fg", 6);
                return;
            case "Digit7":
                this.emit("toggle_fg", 7);
                return;
        }
    }

    meta_key(event) {
        if (darwin) {
            switch (event.code) {
                case "ArrowLeft":
                    if (event.shiftKey) this.emit("start_selection_if_necessary");
                    this.emit("start_of_row");
                    event.preventDefault();
                    return;
                case "ArrowUp":
                    if (event.shiftKey) this.emit("start_selection_if_necessary");
                    this.emit("page_up");
                    event.preventDefault();
                    return;
                case "ArrowRight":
                    if (event.shiftKey) this.emit("start_selection_if_necessary");
                    this.emit("end_of_row");
                    event.preventDefault();
                    return;
                case "ArrowDown":
                    if (event.shiftKey) this.emit("start_selection_if_necessary");
                    this.emit("page_down");
                    event.preventDefault();
                    return;
            }
        }
    }

    key_typed(event) {
        if (this.use_numpad) {
            switch (event.code) {
                case "Numpad1":
                    this.emit("f_key", 1);
                    return;
                case "Numpad2":
                    this.emit("f_key", 5);
                    return;
                case "Numpad3":
                    this.emit("f_key", 1);
                    return;
                case "Numpad4":
                    this.emit("f_key", 6);
                    return;
                case "Numpad5":
                    this.emit("f_key", 3);
                    return;
                case "Numpad6":
                    this.emit("f_key", 7);
                    return;
                case "Numpad7":
                    this.emit("f_key", 2);
                    return;
                case "Numpad8":
                    this.emit("f_key", 4);
                    return;
                case "Numpad9":
                    this.emit("f_key", 2);
                    return;
                case "Numpad0":
                    this.emit("f_key", 0);
                    return;
                case "NumpadAdd":
                    this.emit("f_key", 0);
                    return;
                case "NumpadDecimal":
                    this.emit("key_typed", 32);
                    return;
                case "NumpadEnter":
                    this.emit("new_line");
                    return;
            }
        }
        switch (event.code) {
            case "Home":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("start_of_row");
                event.preventDefault();
                return;
            case "End":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("end_of_row");
                event.preventDefault();
                return;
            case "ArrowLeft":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("left");
                event.preventDefault();
                return;
            case "ArrowUp":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("up");
                event.preventDefault();
                return;
            case "ArrowRight":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("right");
                event.preventDefault();
                return;
            case "ArrowDown":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("down");
                event.preventDefault();
                return;
            case "PageUp":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("page_up");
                event.preventDefault();
                return;
            case "PageDown":
                if (event.shiftKey) this.emit("start_selection_if_necessary");
                this.emit("page_down");
                event.preventDefault();
                return;
            case "Tab":
                this.emit(event.shiftKey ? "reverse_tab" : "tab");
                event.preventDefault();
                return;
            case "Enter":
                this.emit("enter");
                return;
            case "Insert":
                this.emit("insert");
                return;
            case "F1":
                if (!this.prevent_typing) this.emit("f_key", 0);
                return;
            case "F2":
                if (!this.prevent_typing) this.emit("f_key", 1);
                return;
            case "F3":
                if (!this.prevent_typing) this.emit("f_key", 2);
                return;
            case "F4":
                if (!this.prevent_typing) this.emit("f_key", 3);
                return;
            case "F5":
                if (!this.prevent_typing) this.emit("f_key", 4);
                return;
            case "F6":
                if (!this.prevent_typing) this.emit("f_key", 5);
                return;
            case "F7":
                if (!this.prevent_typing) this.emit("f_key", 6);
                return;
            case "F8":
                if (!this.prevent_typing) this.emit("f_key", 7);
                return;
            case "F9":
                if (!this.prevent_typing) this.emit("f_key", 8);
                return;
            case "F10":
                if (!this.prevent_typing) this.emit("f_key", 9);
                return;
            case "Backspace":
                if (!this.prevent_typing) this.emit("backspace");
                return;
            case "Delete":
                if (!this.prevent_typing) this.emit("delete_key");
                return;
        }
        if (!this.prevent_typing && event.key.length == 1) {
            const code = event.key.charCodeAt(0);
            if (code >= 32 && code <= 126) {
                event.preventDefault();
                this.emit("key_typed", code);
            }
        }
    }

    keydown(event) {
        if (document.activeElement == this.chat_input) {
            if (event.code == "Enter" || event.code == "NumpadEnter" && this.chat_input.value){
                this.chat(this.chat_input.value);
                this.chat_input.value = "";
            }
        } else if (event.ctrlKey && !event.altKey && !event.metaKey) {
            this.ctrl_key(event, this.emit);
        } else if (event.altKey && !event.ctrlKey && !event.metaKey) {
            this.alt_key(event, this.emit);
        } else if (event.metaKey && !event.ctrlKey && !event.altKey) {
            this.meta_key(event, this.emit);
        } else {
            if (!event.metaKey) this.key_typed(event, this.emit, this.use_numpad);
        }
    }

    get in_chat() {
        return document.activeElement == this.chat_input;
    }

    constructor() {
        super();
        this.use_numpad = false;
        this.prevent_typing = false;
        electron.ipcRenderer.on("use_numpad", (event, value) => this.use_numpad = value);
        document.addEventListener("DOMContentLoaded", () => {
            this.chat_input = document.getElementById("chat_input");
            document.body.addEventListener("keydown", () => this.keydown(event), true);
        }, true);
    }
}

module.exports = new KeyboardEvent();
