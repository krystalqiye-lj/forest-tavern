const sharp = require(process.env.FOREST_SHARP || 'sharp');

// Input skies and forest are the clean user-provided backgrounds. The sign cutout has
// a transparent background; shadows and partial grass cover are painted at each root.
const [, , scene, input, signFile, output] = process.argv;
const layouts = {
    creek: [[741, 590, 67, 84, false, -3, .91]],
    lake: [[720, 665, 73, 94, true, -4, .94], [955, 696, 76, 89, false, 3, .90]],
    falls: [[540, 769, 83, 96, true, -2, .98]],
};

function smooth(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

(async () => {
    const background = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = background.info;
    const rawSign = await sharp(signFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let xMin = rawSign.info.width, yMin = rawSign.info.height, xMax = 0, yMax = 0;
    for (let y = 0; y < rawSign.info.height; y++) for (let x = 0; x < rawSign.info.width; x++) {
        const i = (y * rawSign.info.width + x) * 4 + 3;
        if (rawSign.data[i] < 13) rawSign.data[i] = 0;
        if (rawSign.data[i] > 55) {
            xMin = Math.min(xMin, x);
            yMin = Math.min(yMin, y);
            xMax = Math.max(xMax, x);
            yMax = Math.max(yMax, y);
        }
    }
    const bare = await sharp(rawSign.data, { raw: rawSign.info })
        .extract({ left: xMin, top: yMin, width: xMax - xMin + 1, height: yMax - yMin + 1 }).png().toBuffer();
    const layers = [];
    for (const [x, y, signWidth, signHeight, leftward, angle, tint] of layouts[scene]) {
        const left = Math.round(x - signWidth / 2), top = Math.round(y - signHeight * .24);
        const mark = sharp(bare).resize(signWidth, signHeight, { fit: 'fill' });
        if (leftward) mark.flop();
        const graphic = await mark.png().toBuffer();
        const board = await sharp(graphic).rotate(angle, { background: '#00000000' }).raw().toBuffer({ resolveWithObject: true });
        for (let row = 0; row < board.info.height; row++) for (let col = 0; col < board.info.width; col++) {
            const i = (row * board.info.width + col) * 4;
            if (!board.data[i + 3]) continue;
            const under = ((top + row) * width + left + col) * 3;
            const r = background.data[under], g = background.data[under + 1], b = background.data[under + 2];
            const blades = g-b > 18 && g >= r-5 ? smooth(11, 49, g-b) : 0;
            const root = smooth(board.info.height - 23, board.info.height - 3, row);
            board.data[i + 3] = Math.round(board.data[i+3] * (1 - root * .76) * (1 - root * blades * .84));
            board.data[i] = Math.round(board.data[i] * tint);
            board.data[i+1] = Math.round(board.data[i+1] * Math.min(.98, tint + .013));
            board.data[i+2] = Math.round(board.data[i+2] * tint);
        }
        const shadow = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="110" height="39"><defs><filter id="h"><feGaussianBlur stdDeviation="3.5"/></filter></defs><ellipse cx="50" cy="21" rx="19" ry="5" fill="#232513" opacity=".49" filter="url(#h)"/><path d="M43 20 97 29 90 33 44 24Z" fill="#192516" opacity=".24" filter="url(#h)"/></svg>');
        layers.push({ input: shadow, left: x-48, top: top + signHeight - 25 });
        layers.push({ input: await sharp(board.data, { raw: board.info }).blur(.43).png().toBuffer(), left, top });
    }
    await sharp(background.data, { raw: background.info }).composite(layers).jpeg({ quality: 93 }).toFile(output);
})().catch(error => { console.error(error); process.exitCode = 1; });
