const {convert_ega_to_style} = require("../../libtextmode/libtextmode");

class Overlay {
    constructor(border = false) {
        this.destroyed = false;
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        document.getElementById("editing_layer").appendChild(this.canvas);
        this.canvas.style.opacity = 0.6;
        if (border) this.canvas.classList.add("border");
    }

    hide() {
        if (!this.canvas.classList.contains("hidden")) this.canvas.classList.add("hidden");
    }

    show() {
        if (this.canvas.classList.contains("hidden")) this.canvas.classList.remove("hidden");
    }

    fill_style(font, col) {
        this.ctx.fillStyle = convert_ega_to_style(font.palette[col]);
    }

    fill_rect(x, y, width, height) {
        this.ctx.fillRect(x, y, width, height);
    }

    background_color(font, col) {
        this.canvas.style.backgroundColor = convert_ega_to_style(font.palette[col]);
    }

    destroy() {
        this.destroyed = true;
        const editing_layer = document.getElementById("editing_layer");
        if (editing_layer.contains(this.canvas)) editing_layer.removeChild(this.canvas);
    }

    update(x, y, width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = `${width}px`;
        this.canvas.style.height = `${height}px`;
        this.canvas.style.left = `${x}px`;
        this.canvas.style.top = `${y}px`;
    }
}

module.exports = {Overlay};
