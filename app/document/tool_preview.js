class ToolPreview {
    constructor() {
        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");
        document.getElementById("editing_layer").appendChild(this.canvas);
        this.canvas.style.opacity = 0.6;
    }

    fill_style(font, col) {
        this.ctx.fillStyle = libtextmode.convert_ega_to_style(font.palette[col]);
    }

    fill_rect(x, y, width, height) {
        this.ctx.fillRect(x, y, width, height);
    }

    background_color(font, col) {
        this.canvas.style.backgroundColor = libtextmode.convert_ega_to_style(font.palette[col]);
    }

    destroy() {
        document.getElementById("editing_layer").removeChild(this.canvas);
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

module.exports = {ToolPreview};
