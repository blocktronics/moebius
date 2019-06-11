let visible = false;

function send(channel, opts) {
    electron.ipcRenderer.send(channel, {id: electron.remote.getCurrentWindow().id, ...opts});
}

function set_var(name, value) {
    document.documentElement.style.setProperty(`--${name}`, `${value}px`);
}

function scroll_to_bottom() {
    const messages = document.getElementById("messages");
    const rect = messages.getBoundingClientRect();
    messages.scrollTop = messages.scrollHeight - rect.height + 1;
}

function show(focus = true) {
    const chat_input = document.getElementById("chat_input");
    set_var("chat-height", 240);
    chat_input.value = "";
    scroll_to_bottom();
    if (focus) chat_input.focus();
}

function hide() {
    document.getElementById("chat_input").blur();
    set_var("chat-height", 0);
}

function toggle(focus) {
    visible = !visible;
    if (visible) {
        show(focus);
    } else {
        hide();
    }
}

function action(nick, text) {
    const messages = document.getElementById("messages");
    const rect = messages.getBoundingClientRect();
    const scroll = (rect.height > messages.scrollHeight) || (messages.scrollTop == messages.scrollHeight - rect.height + 1);
    const nick_div = document.createElement("div");
    nick_div.classList.add("nick");
    nick_div.innerText = `${nick} ${text}`;
    const container = document.createElement("div");
    container.appendChild(nick_div);
    document.getElementById("messages").appendChild(container);
    if (scroll) scroll_to_bottom();
}

function join(nick) {
    action(nick, "has joined");
}

function leave(nick) {
    action(nick, "has left");
}

function chat(nick, text) {
    const messages = document.getElementById("messages");
    const rect = messages.getBoundingClientRect();
    const scroll = (rect.height > messages.scrollHeight) || (messages.scrollTop == messages.scrollHeight - rect.height + 1);
    const nick_div = document.createElement("div");
    nick_div.classList.add("nick");
    nick_div.innerText = `${nick}:`;
    const text_div = document.createElement("div");
    text_div.classList.add("text");
    text_div.innerText = text;
    const container = document.createElement("div");
    container.appendChild(nick_div);
    container.appendChild(text_div);
    messages.appendChild(container);
    if (scroll) scroll_to_bottom();
}

module.exports = {toggle, join, leave, chat};
