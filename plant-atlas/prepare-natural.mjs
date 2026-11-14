import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const sharp = createRequire(import.meta.url)(process.env.FOREST_SHARP || 'sharp');
const atlas = new URL('./', import.meta.url);
const target = new URL('./art/natural/', atlas);
const files = process.argv.slice(2);
const ids = [
    [3,4,8,10,16,20,21,23,24,27,1,2,5,6,7],
    [9,11,12,13,14,15,17,18,19,22,25,26,28,29,30],
    ...[[31,45],[46,60],[61,75],[76,90],[91,100],[101,110]].map(([from, to]) =>
        Array.from({ length: to - from + 1 }, (_, index) => from + index)),
];
if (files.length !== ids.length) throw Error('Pass the eight forest plant sheets in order.');

function partition(size, values, count, radius) {
    const edges = [0];
    for (let line = 1; line < count; line++) {
        const origin = Math.round(size * line / count);
        let point = origin, best = Infinity;
        for (let x = origin - radius; x <= origin + radius; x++) {
            const score = values[x] + Math.abs(x - origin) * 1.9;
            if (score < best) {
                best = score;
                point = x;
            }
        }
        edges.push(point);
    }
    return edges.concat(size);
}

// Keep the generated transparency. The visible bounds use a stronger alpha
// cutoff so scattered translucent pixels do not determine scale or roots.
async function extract(sheet, x, y, width, height, id) {
    const data = await sharp(sheet).extract({ left: x, top: y, width, height }).raw()
        .toBuffer({ resolveWithObject: true });
    if (data.info.channels !== 4) throw Error('Expected four channels for plant ' + id);
    const rgba = data.data;
    let xMin = width, yMin = height, xMax = -1, yMax = -1;
    let opaque = 0;
    for (let i = 3; i < rgba.length; i += 4) {
        if (rgba[i] < 12) rgba[i] = 0;
        if (rgba[i] < 113) continue;
        const point = (i - 3) / 4;
        xMin = Math.min(xMin, point % width);
        xMax = Math.max(xMax, point % width);
        yMin = Math.min(yMin, Math.floor(point / width));
        yMax = Math.max(yMax, Math.floor(point / width));
        opaque++;
    }
    if (opaque < 495 || xMax - xMin < 60 || yMax - yMin < 90) {
        throw Error('Empty plant cell ' + id);
    }
    const left = Math.max(0, xMin - 5), top = Math.max(0, yMin - 5);
    const bounds = { left, top, width: Math.min(width, xMax + 6) - left, height: Math.min(height, yMax + 6) - top };
    const roots = [];
    const tail = Math.max(4, Math.floor((yMax - yMin) * .052));
    for (let cx = xMin; cx <= xMax; cx++) {
        for (let cy = yMax - tail; cy <= yMax; cy++) {
            if (rgba[(cy * width + cx) * 4 + 3] >= 113) roots.push(cx);
        }
    }
    const file = String(id).padStart(3, '0') + '.webp';
    const result = await sharp(rgba, { raw: data.info }).extract(bounds)
        .webp({ quality: 88, alphaQuality: 97, effort: 5 }).toFile(fileURLToPath(new URL(file, target)));
    return {
        file, width: result.width, height: result.height,
        rootX: Number(((roots[roots.length >> 1] - left) / bounds.width).toFixed(4)),
        rootY: Number(((yMax - top) / bounds.height).toFixed(4)),
    };
}

await mkdir(target, { recursive: true });
const natural = {};
for (const [sheetIndex, file] of files.entries()) {
    const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    if (channels !== 4) throw Error('A generated sheet must have an alpha channel: ' + file);
    const horizontal = Array(height).fill(0), vertical = Array(width).fill(0);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha < 112) continue;
            horizontal[y]++;
            vertical[x]++;
        }
    }
    const columns = partition(width, vertical, 5, 17);
    const rows = partition(height, horizontal, ids[sheetIndex].length / 5, 23);
    for (const [index, id] of ids[sheetIndex].entries()) {
        const x = index % 5, y = Math.floor(index / 5);
        natural[id] = await extract(file, columns[x], rows[y], columns[x + 1] - columns[x], rows[y + 1] - rows[y], id);
    }
}
await writeFile(new URL('natural.json', atlas), JSON.stringify(natural) + '\n');
console.log('Prepared', Object.keys(natural).length, 'separate scene plants.');
