function create_canvas(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const image_data = ctx.getImageData(0, 0, width, height);
    return {canvas, ctx, image_data};
}

function join_canvases(canvases) {
    let height = 0;
    for (const canvas of canvases) {
        height += canvas.height;
    }
    const {canvas, ctx} = create_canvas(canvases[0].width, height);
    for (let i = 0, y = 0; i < canvases.length; i++) {
        ctx.drawImage(canvases[i], 0, y);
        y += canvases[i].height;
    }
    return canvas;
}

module.exports = {create_canvas, join_canvases};
