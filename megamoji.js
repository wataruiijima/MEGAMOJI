var TEXT_CANVAS_SIZE    = 1500; /* a sufficiently large number */
var EMOJI_SIZE          = 128;
var ANIMATED_EMOJI_SIZE = 128;
var ANIMATION_FRAMES    = 12;

/* ---- Core */

function load_file (path, callback) {
    var reader = new FileReader();
    reader.onload = function (e) { callback(e.target.result); };
    reader.readAsDataURL(path);
}

function filter_chromakey (image) {
    var canvas = document.createElement("canvas");
    var ctx    = canvas.getContext('2d');
    canvas.width  = image.naturalWidth;
    canvas.height = image.naturalHeight;

    ctx.drawImage(image, 0, 0);

    var image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = image_data.data;
    var base_color = [data[0], data[1], data[2]];

    var queue = [
        [0, 0],
        [canvas.width - 1, 0],
        [0, canvas.height - 1],
        [canvas.width - 1, canvas.height - 1]
    ];

    while (queue.length) {
        var item = queue.shift();
        if (item[0] >= canvas.width || item[1] >= canvas.height || item[0] < 0 || item[1] < 0) {
            continue;
        }

        var ix = (item[1] * canvas.width + item[0]) * 4;
        if (!data[ix + 3]) continue;

        var norm = Math.hypot(
            data[ix] - base_color[0],
            data[ix + 1] - base_color[1],
            data[ix + 2] - base_color[2]
        );
        if (norm < 90) {
            data[ix + 3] = 0;
            queue.push(
                [item[0] - 1, item[1] - 1],
                [item[0],     item[1] - 1],
                [item[0] + 1, item[1] - 1],
                [item[0] - 1, item[1]],
                [item[0] + 1, item[1]],
                [item[0] - 1, item[1] + 1],
                [item[0],     item[1] + 1],
                [item[0] + 1, item[1] + 1]
            );
        }
    }

    ctx.putImageData(image_data, 0, 0);
    return canvas.toDataURL("image/png");
}

function crop_canvas (source_canvas, left, top, w, h) {
    var canvas    = document.createElement("canvas");
    var ctx       = canvas.getContext('2d');
    canvas.width  = w;
    canvas.height = h;

    ctx.drawImage(source_canvas, left, top, w, h, 0, 0, w, h);

    return canvas;
}

function line_image (line, color, font) {
    var canvas = document.createElement("canvas");
    canvas.width  = TEXT_CANVAS_SIZE;
    canvas.height = TEXT_CANVAS_SIZE;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle    = color;
    ctx.font         = font;
    ctx.textBaseline = "top";
    ctx.fillText(line, 0, 0);

    /* find topmost and bottommost non-transparent pixels */
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (var row = 0, top = -1, bottom = 0; row < canvas.height; row++) {
        for (var column = 0; column < canvas.width; column++) {
            if (data[(row * canvas.width + column) * 4 + 3]) {
                if (top == -1) top = row;
                bottom = row;
                break;
            }
        }
    }

    var width  = ctx.measureText(line).width;
    var height = bottom - top;

    return crop_canvas(canvas, 0, top, width, height);
}

/* Text, Color, Font, Alignment, LineSpacing -> BlobURL */
function generate_text_image (text, color, font, align, line_spacing) {
    var images       = text.split("\n").map(function (line) { return line_image(line, color, font); });
    var line_widths  = images.map(function (canvas) { return canvas.width; })
    var max_width    = Math.max.apply(null, line_widths);
    var total_height = images.reduce(function (l, r) { return l + r.height; }, 0) + line_spacing * (images.length - 1);

    var canvas = document.createElement("canvas");
    canvas.width  = max_width;
    canvas.height = total_height;

    var ctx = canvas.getContext('2d');

    var current_height = 0;
    images.forEach(function (image, ix) {
        ctx.save();

        if (align == "right") {
            ctx.translate(max_width - line_widths[ix], 0)
        } else if (align == "center") {
            ctx.translate((max_width - line_widths[ix]) / 2, 0);
        } else if (align == "stretch") {
            ctx.transform(max_width / line_widths[ix], 0, 0, 1, 0, 0);
        }

        ctx.drawImage(image, 0, current_height);
        current_height += image.height + line_spacing;

        ctx.restore();
    });

    return canvas.toDataURL();
}

function effect_kira (keyframe, ctx, cellWidth, cellHeight, background) {
    ctx.filter = "saturate(1000%) hue-rotate(" + (keyframe * 360) + "deg)";
}

function effect_blink (keyframe, ctx, cellWidth, cellHeight, background) {
    if (keyframe >= 0.5) {
        ctx.translate(- cellWidth * 2, 0); /* hide */
    }
}

function effect_tikatika (keyframe, ctx, cellWidth, cellHeight, background) {
    ctx.globalAlpha = Math.round(keyframe * 10 * 1.2) % 2 ;
}

function effect_pyon (keyframe, ctx, cellWidth, cellHeight, background) {
    var resistance = 1.7; // バウンド時の強さ
    var y
    if(keyframe > 0.7) {
        y = - Math.abs(Math.cos(2 * Math.PI * keyframe)) * (cellHeight / 3)
    } else {
        y = - Math.abs(Math.cos(2 * Math.PI * keyframe)) * (cellHeight / 3) * Math.exp(-keyframe * resistance)
    }
    ctx.transform(1, 0, 0, 1, 0, y + cellHeight / 15);
}

function effect_shadow (keyframe, ctx, cellWidth, cellHeight, background) {
    ctx.shadowColor = 'black';
    ctx.shadowOffsetY = 7;
    ctx.shadowOffsetX = 7;
}

function effect_natural_blur (keyframe, ctx, cellWidth, cellHeight, background) {
    var hsv_color = hsvToRgb(0, 0, keyframe)
    ctx.shadowColor = `rgb(${hsv_color[0]}, ${hsv_color[1]}, ${hsv_color[2]})`;
    ctx.shadowBlur = 50*keyframe;
}

function effect_neon(keyframe, ctx, cellWidth, cellHeight, background) {
    var hsv_color = hsvToRgb(keyframe*360*4%360, 1, 1)
    ctx.shadowColor = `rgb(${hsv_color[0]}, ${hsv_color[1]}, ${hsv_color[2]})`;
    ctx.shadowBlur = 10;
}

function effect_aurora_blur(keyframe, ctx, cellWidth, cellHeight, background) {
    var hsv_color = hsvToRgb(keyframe*360, 1, 1)
    ctx.shadowColor = `rgb(${hsv_color[0]}, ${hsv_color[1]}, ${hsv_color[2]})`;
    ctx.shadowBlur = 50*keyframe;
}

function effect_shadow_rotate (keyframe, ctx, cellWidth, cellHeight, background) {
    ctx.shadowColor = 'black';
    ctx.shadowOffsetY = Math.cos(2 * Math.PI * keyframe)*5;
    ctx.shadowOffsetX = Math.sin(2 * Math.PI * keyframe)*5;
}

function effect_patapata (keyframe, ctx, cellWidth, cellHeight, background) {
    ctx.transform(Math.cos(2 * Math.PI * keyframe), 0, 0, 1, cellWidth * (0.5 - 0.5 * Math.cos(2 * Math.PI * keyframe)), 0);
}

function effect_sidetoside (keyframe, ctx, cellWidth, cellHeight, background) {
    ctx.transform(1, 0, 0, 1, cellWidth * Math.sin(2 * Math.PI * keyframe), 0);
}

function effect_rotate (keyframe, ctx, cellWidth, cellHeight, background) {
    ctx.translate(cellWidth / 2, cellHeight / 2);
    ctx.rotate(Math.PI * 2 * keyframe);
    ctx.translate(- cellWidth / 2, - cellHeight / 2);
}

var last_gata = false;
function effect_gatagata (keyframe, ctx, cellWidth, cellHeight, background) {
    last_gata = !last_gata;
    ctx.translate(cellWidth / 2 + (Math.random() - 0.5) * 4, cellHeight / 2 + (Math.random() - 0.5) * 4);
    ctx.rotate(last_gata ? -0.05 : 0.05);
    ctx.translate(- cellWidth / 2, - cellHeight / 2);
}

function effect_yatta (keyframe, ctx, cellWidth, cellHeight, background) {
    if (keyframe >= 0.5) {
        ctx.transform(-1, 0, 0, 1, cellWidth, 0);
    }
    ctx.translate(cellWidth / 2, cellHeight / 2);
    ctx.rotate(0.1);
    ctx.translate(- cellWidth / 2, - cellHeight / 2);
    ctx.translate(0, cellHeight / 8 * Math.sin(8 * Math.PI * keyframe));
}

function effect_poyon (keyframe, ctx, cellWidth, cellHeight, background) {
    if (keyframe < 0.6) {
        ctx.translate(0, - cellHeight / 3 * Math.sin(Math.PI * keyframe / 0.6));
    } else {
        var ratio = Math.sin(Math.PI * (keyframe - 0.6) / 0.4) / 2;
        ctx.transform(1 + ratio, 0, 0, 1 - ratio, - ratio * cellWidth / 2, ratio * cellHeight);
    }
}

function effect_zoom (keyframe, ctx, cellWidth, cellHeight, background) {
    var zoom = Math.abs(keyframe - 0.5) * 2 - 0.5;
    ctx.transform(1 + zoom, 0, 0, 1 + zoom, - cellWidth / 2 * zoom, - cellHeight / 2 * zoom);
}

function effect_tiritiri (keyframe, ctx, cellWidth, cellHeight, background) {
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < cellHeight; row++) {
        for (var col = 0; col < cellWidth; col++) {
            data[(row * cellWidth + col) * 4 + 3] = parseInt(255 * Math.random());
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

function effect_stripe (keyframe, ctx, cellWidth, cellHeight, background) {
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < cellHeight; row++) {
        for (var col = 0; col < cellWidth; col++) {
            if (col % 3 === 1)  {
                data[(row * cellWidth + col) * 4 + 3] = 0;
            }
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

function effect_river (keyframe, ctx, cellWidth, cellHeight, background) {
    var bgColorHSV = hexToHsv(background);
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < (cellHeight * cellWidth * 4); row = row + 4) {
        if ((row / 4 + (keyframe * 40)) % 40 < 40 && (row / 4 + (keyframe * 40)) % 40 > 20) {
            var color = hsvToRgb(bgColorHSV["h"] + 180, 1, 1);
            data[row] = color[0];
            data[row + 1] = color[1];
            data[row + 2] = color[2];
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

function effect_signPole (keyframe, ctx, cellWidth, cellHeight, background) {
    var bgColorHSV = hexToHsv(background);
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < cellHeight; row++) {
        for (var col = 0; col < cellWidth; col++) {
            if ((row + col + (keyframe * 40)) % 40 < 40 && (row + col + (keyframe * 40)) % 40 > 20) {
                var color = hsvToRgb(bgColorHSV["h"] + 180, 1, 1);
                data[(row * cellWidth + col) * 4] = color[0];
                data[(row * cellWidth + col) * 4 + 1] = color[1];
                data[(row * cellWidth + col) * 4 + 2] = color[2];
            }
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

function effect_psych (keyframe, ctx, cellWidth, cellHeight, background) {
    var bgColorHSV = hexToHsv(background);
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < cellHeight; row++) {
        for (var col = 0; col < cellWidth; col++) {
            if (row % 10 <= 5 && col % 10 >= 5) {
                var color = hsvToRgb((keyframe * 360 * 4 + 180) % 360, 1, 1);
                data[(row * cellWidth + col) * 4] = color[0];
                data[(row * cellWidth + col) * 4 + 1] = color[1];
                data[(row * cellWidth + col) * 4 + 2] = color[2];
                data[(row * cellWidth + col) * 4 + 3] = 255;
            } else if (row % 10 < 5 ^ col % 10 < 5) {
                var color = hsvToRgb((keyframe * 360 * 4 + 90) % 360, 1, 1);
                data[(row * cellWidth + col) * 4] = color[0];
                data[(row * cellWidth + col) * 4 + 1] = color[1];
                data[(row * cellWidth + col) * 4 + 2] = color[2];
                data[(row * cellWidth + col) * 4 + 3] = 255;
            } else {
                var color = hsvToRgb((keyframe * 360 * 4) % 360, 1, 1);
                data[(row * cellWidth + col) * 4] = color[0];
                data[(row * cellWidth + col) * 4 + 1] = color[1];
                data[(row * cellWidth + col) * 4 + 2] = color[2];
                data[(row * cellWidth + col) * 4 + 3] = 255;
            }
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

function effect_check (keyframe, ctx, cellWidth, cellHeight, background) {
    var bgColorHSV = hexToHsv(background);
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < cellHeight; row++) {
        for (var col = 0; col < cellWidth; col++) {
            if (row % 16 <= 8 && col % 16 >= 8) {
                var color = hsvToRgb(bgColorHSV['h'], 1, 0.8);
                data[(row * cellWidth + col) * 4] = color[0];
                data[(row * cellWidth + col) * 4 + 1] = color[1];
                data[(row * cellWidth + col) * 4 + 2] = color[2];
                data[(row * cellWidth + col) * 4 + 3] = 255;
            } else if (row % 16 < 8 ^ col % 16 < 8) {
                var color = hsvToRgb(bgColorHSV['h'], 1, 1);
                data[(row * cellWidth + col) * 4] = color[0];
                data[(row * cellWidth + col) * 4 + 1] = color[1];
                data[(row * cellWidth + col) * 4 + 2] = color[2];
                data[(row * cellWidth + col) * 4 + 3] = 255;
            } else {
                var color = hsvToRgb(bgColorHSV['h'], 1, 0.5);
                data[(row * cellWidth + col) * 4] = color[0];
                data[(row * cellWidth + col) * 4 + 1] = color[1];
                data[(row * cellWidth + col) * 4 + 2] = color[2];
                data[(row * cellWidth + col) * 4 + 3] = 255;
            }
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

function effect_timeMachine (keyframe, ctx, cellWidth, cellHeight, background) {
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < (cellHeight * cellWidth * 4); row = row + 4) {
        if ((row / 4) % 40 < 40 * keyframe) {
            var color = hsvToRgb(keyframe * 360 * 4 % 360 + 180, 1, 1);
            data[row] = color[0];
            data[row + 1] = color[1];
            data[row + 2] = color[2];
            data[row + 3] = 255;
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

function effect_dizzy (keyframe, ctx, cellWidth, cellHeight, background) {
    var image_data = ctx.getImageData(0, 0, cellWidth, cellHeight);
    var data = image_data.data;
    for (var row = 0; row < (cellHeight * cellWidth * 4); row = row + 4) {
        if ((row / 4+(keyframe * 40)) % 40 < 40 && (row / 4 + (keyframe * 40)) % 40 > 20) {
            var color = hsvToRgb(keyframe * 360 * 4 % 360 + 180, 1, 1);
            data[row] = color[0];
            data[row + 1] = color[1];
            data[row + 2] = color[2];
            data[row + 3] = 255;
        }
    }
    ctx.putImageData(image_data, 0, 0);
}

// 謁見
function animation_ekken (keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight) {
    keyframe = keyframe < 0.5 ? 1 : (keyframe - 0.5) * 2;
    var size        = 1.0 * keyframe + 0.5 * (1 - keyframe);
    var ekkenOffset = cellWidth * keyframe;
    ctx.drawImage(image, offsetH, offsetV, width, height, cellWidth * (1 - size) / 2, cellHeight * (1 - size) / 2, cellWidth * size, cellHeight * size);
    ctx.drawImage(image, offsetH, offsetV, width / 2, height, - ekkenOffset / 2, 0, cellWidth / 2, cellHeight);
    ctx.drawImage(image, offsetH + width / 2, offsetV, width / 2, height, cellWidth / 2 + ekkenOffset / 2, 0, cellWidth / 2, cellHeight);
}

// 謁見
function animation_ekken_vertical (keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight) {
    keyframe = keyframe < 0.5 ? 1 : (keyframe - 0.5) * 2;
    var size        = 1.0 * keyframe + 0.5 * (1 - keyframe);
    var ekkenOffset = cellWidth * keyframe;
    ctx.drawImage(image, offsetH, offsetV, width, height, cellWidth * (1 - size) / 2, cellHeight * (1 - size) / 2, cellWidth * size, cellHeight * size);
    ctx.drawImage(image, offsetH, offsetV, width, height / 2, 0, - ekkenOffset / 2, cellWidth, cellHeight / 2);
    ctx.drawImage(image, offsetH, offsetV + height / 2, width, height / 2, 0, cellHeight / 2 + ekkenOffset / 2, cellWidth, cellHeight / 2);
}

// 水平方向にスクロール
function animation_scroll_horizontal (keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight) {
    offsetH = (offsetH + image.naturalWidth * keyframe) % image.naturalWidth;
    ctx.drawImage(image, offsetH, offsetV, width, height, 0, 0, cellWidth, cellHeight);
    if (offsetH + width > image.naturalWidth) {
        ctx.drawImage(image, 0, offsetV, width, height, (image.naturalWidth - offsetH) * (cellWidth / width), 0, cellWidth, cellHeight);
    }
}

// 垂直方向にスクロール
function animation_scroll_vertical (keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight) {
    offsetV = (offsetV + image.naturalHeight * keyframe) % image.naturalHeight;
    ctx.drawImage(image, offsetH, offsetV, width, height, 0, 0, cellWidth, cellHeight);
    if (offsetV + height > image.naturalHeight) {
        ctx.drawImage(image, offsetH, 0, width, height, 0, (image.naturalHeight - offsetV) * (cellHeight / height), cellWidth, cellHeight);
    }
}

// 水平方向に押し出し
function animation_push_horizontal (keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight) {
    keyframe = keyframe > 0.75 ? (keyframe - 0.75) * 4 : 0;
    animation_scroll_horizontal(keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight);
}

// 垂直方向に押し出し
function animation_push_vertical (keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight) {
    keyframe = keyframe > 0.75 ? (keyframe - 0.75) * 4 : 0;
    animation_scroll_vertical(keyframe, ctx, image, offsetH, offsetV, width, height, cellWidth, cellHeight);
}

function render_result_cell (image, offsetH, offsetV, width, height, animation, animationInvert, effects, framerate, background) {
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext('2d');

    if (!animation && !effects.length) {
        canvas.width = EMOJI_SIZE;
        canvas.height = EMOJI_SIZE;
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, EMOJI_SIZE, EMOJI_SIZE);
        ctx.drawImage(image, offsetH, offsetV, width, height, 0, 0, EMOJI_SIZE, EMOJI_SIZE);

        return canvas.toDataURL();
    } else {
        canvas.width = ANIMATED_EMOJI_SIZE;
        canvas.height = ANIMATED_EMOJI_SIZE;

        var encoder = new GIFEncoder();
        encoder.setRepeat(0);
        encoder.setFrameRate(framerate);
        encoder.start();
        for (var i = 0; i < ANIMATION_FRAMES; i++) {
            var keyframe = animationInvert ? 1 - (i / ANIMATION_FRAMES) : i / ANIMATION_FRAMES;
            ctx.save();
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, ANIMATED_EMOJI_SIZE, ANIMATED_EMOJI_SIZE);
            effects.forEach(function (effect) {
                effect(keyframe, ctx, ANIMATED_EMOJI_SIZE, ANIMATED_EMOJI_SIZE, background);
            });
            if (animation) {
                animation(keyframe, ctx, image, offsetH, offsetV, width, height, ANIMATED_EMOJI_SIZE, ANIMATED_EMOJI_SIZE);
            } else {
                ctx.drawImage(image, offsetH, offsetV, width, height, 0, 0, ANIMATED_EMOJI_SIZE, ANIMATED_EMOJI_SIZE);
            }
            ctx.restore();
            encoder.addFrame(ctx);
        }
        encoder.finish();

        return "data:image/gif;base64," + encode64(encoder.stream().getData());
    }
}

//from https://qiita.com/hachisukansw/items/633d1bf6baf008e82847
function hsvToRgb(H,S,V) {
    //https://en.wikipedia.org/wiki/HSL_and_HSV#From_HSV

    var C = V * S;
    var Hp = H / 60;
    var X = C * (1 - Math.abs(Hp % 2 - 1));

    var R, G, B;
    if (0 <= Hp && Hp < 1) {[R,G,B]=[C,X,0]};
    if (1 <= Hp && Hp < 2) {[R,G,B]=[X,C,0]};
    if (2 <= Hp && Hp < 3) {[R,G,B]=[0,C,X]};
    if (3 <= Hp && Hp < 4) {[R,G,B]=[0,X,C]};
    if (4 <= Hp && Hp < 5) {[R,G,B]=[X,0,C]};
    if (5 <= Hp && Hp < 6) {[R,G,B]=[C,0,X]};

    var m = V - C;
    [R, G, B] = [R+m, G+m, B+m];

    R = Math.floor(R * 255);
    G = Math.floor(G * 255);
    B = Math.floor(B * 255);

    return [R ,G, B];
}

// from https://stackoverflow.com/questions/8022885/rgb-to-hsv-color-in-javascript
function hexToHsv (hex) {
    var r = parseInt(hex.substring(1, 3), 16) / 255;
    var g = parseInt(hex.substring(3, 5), 16) / 255;
    var b = parseInt(hex.substring(5, 7), 16) / 255;

    var v     = Math.max(r, g, b);
    var vDiff = v - Math.min(r, g, b);

    var h, s;
    if (vDiff == 0) {
        h = s = 0;
    } else {
        s = vDiff / v;

        var rr = (v - r) / 6 / vDiff + 1 / 2;
        var gg = (v - g) / 6 / vDiff + 1 / 2;
        var bb = (v - b) / 6 / vDiff + 1 / 2;

        if (r === v) {
            h = bb - gg;
        } else if (g === v) {
            h = (1 / 3) + rr - bb;
        } else if (b === v) {
            h = (2 / 3) + gg - rr;
        }

        if (h < 0) {
            h += 1;
        } else if (h > 1) {
            h -= 1;
        }
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        v: Math.round(v * 100)
    };
}

function urlToImage (url) {
    var img = document.createElement("img");
    img.src = url;
    return img;
}

/* ---- View */

var store = {
    baseImage: null,
    resultImages: [],
    /* form inputs */
    source: {
        file: {
            /* basic */
            file: null,
            url: null,
            /* advanced */
            showDetails: false,
            filter: ""
        },
        text: {
            /* basic */
            content: "",
            align: "left",
            color: "#e85600",
            font: "bold sans-serif",
            /* advanced */
            showDetails: false,
            lineSpacing: 0.1
        }
    },
    target: {
        /* basic */
        trimming: "",
        hCells: 1,
        vCells: 1,
        animation: "",
        animationInvert: false,
        effects: [],
        /* advanced */
        showDetails: false,
        offsetLeft: 0,
        offsetTop: 0,
        hZoom: "1.0",
        vZoom: "1.0",
        framerate: 18,
        backgroundColor: "#ffffff"
    },
};

var methods = {
    loadFile: function () {
        load_file(vm.source.file.file, function (blobUrl) {
            var filter = window[vm.source.file.filter];
            vm.baseImage = filter ? filter(urlToImage(blobUrl)) : blobUrl;
        });
    },
    loadUrl: function () {
        var filter = window[vm.source.file.filter];
        vm.baseImage = filter ? filter(urlToImage(vm.source.file.url)) : vm.source.file.url;
    },
    refreshDefaultSettings: function () {
        var image = vm.$refs.baseImage;
        var v     = vm.target.vCells;
        var h     = vm.target.hCells;
        var width_ratio  = (EMOJI_SIZE * h) / image.naturalWidth;
        var height_ratio = (EMOJI_SIZE * v) / image.naturalHeight;

        if (vm.target.trimming == "cover") {
            width_ratio = height_ratio = Math.max(width_ratio, height_ratio);
        } else if (vm.target.trimming == "contain") {
            width_ratio = height_ratio = Math.min(width_ratio, height_ratio);
        }

        vm.target.hZoom      = width_ratio + "";
        vm.target.vZoom      = height_ratio + "";
        vm.target.offsetLeft = (image.naturalWidth - EMOJI_SIZE / width_ratio * h) / 2 + "";
        vm.target.offsetTop  = Math.min(0, (image.naturalHeight - EMOJI_SIZE / height_ratio * v) / 2) + "";
    },
    render: function () {
        var image     = vm.$refs.baseImage;
        var animation = window[vm.target.animation];
        var effects   = vm.target.effects.map(function (x) { return window[x]; });

        var offsetLeft = parseInt(vm.target.offsetLeft);
        var offsetTop  = parseInt(vm.target.offsetTop);

        var cell_width = EMOJI_SIZE / vm.target.hZoom;
        var cell_height = EMOJI_SIZE / vm.target.vZoom;

        vm.resultImages = [];
        for (var y = 0; y < vm.target.vCells; y++) {
            for (var x = 0, row = []; x < vm.target.hCells; x++) {
                var url = render_result_cell(
                    image,
                    offsetLeft + x * cell_width, offsetTop + y * cell_height,
                    cell_width, cell_height,
                    animation, vm.target.animationInvert,
                    effects, vm.target.framerate, vm.target.backgroundColor
                );
                row.push(url);
            }
            vm.resultImages.push(row);
        }

        ga("send", "event", "emoji", "render");
    },
    onToggleFileDetails: function () {
        vm.source.file.showDetails = !vm.source.file.showDetails;
    },
    onToggleTextDetails: function () {
        vm.source.text.showDetails = !vm.source.text.showDetails;
    },
    onToggleTargetDetails: function () {
        vm.target.showDetails = !vm.target.showDetails;
    },
    onChangeFile: function (e) {
        vm.source.file.filter = "";
        vm.source.file.file = e.target.files[0];
        vm.loadFile();
    },
    onChangeUrl: function () {
        vm.source.file.filter = "";
    },
    onClickReload: function () {
        vm.source.file.url ? vm.loadUrl() : vm.loadFile();
    },
    onClickGenerateText: function () {
        vm.baseImage = generate_text_image(
            vm.source.text.content,
            vm.source.text.color,
            vm.source.text.font.replace(/^([^ ]+)/, "$1 " + EMOJI_SIZE + "px"),
            vm.source.text.align,
            vm.source.text.lineSpacing * EMOJI_SIZE
        );
    }
};

var vm = new Vue({ el: "#app", data: store, methods: methods });

window.onerror = function (msg, file, line, col) {
    ga('send', 'event', "error", "thrown", file + ":" + line + ":" + col + " " + msg);
};
