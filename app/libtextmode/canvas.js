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

function clone_canvas(original_canvas) {
    const {width, height} = original_canvas;
    const original_data = original_canvas.getContext("2d").getImageData(0, 0, width, height)

    const {canvas, ctx, image_data} = create_canvas(width, height);
    ctx.putImageData(original_data, 0, 0);

    return {canvas, ctx, image_data}
}


module.exports = {create_canvas, join_canvases, clone_canvas};
