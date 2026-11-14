import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { featuredIds, habits, sheets } from './catalog.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.FOREST_SHARP || 'sharp');
const folder = dirname(fileURLToPath(import.meta.url));
const destination = resolve(folder, 'art/specimens');
const thumbnails = resolve(folder, 'art/thumbnails');
const clamp = (x, low, high) => Math.max(low, Math.min(high, x));

// Follow the transparent gap when long foliage reaches over a straight tile boundary.
async function findSeam(source, top, bottom, center) {
    const radius = 28, width = 2 * radius + 1, height = bottom - top;
    const { data } = await sharp(source).extract({ left: center - radius, top, width, height })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let previous = new Float32Array(width);
    const parents = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        const next = new Float32Array(width);
        for (let x = 0; x < width; x++) {
            let best = Infinity, parent = x;
            for (let candidate = Math.max(0, x - 4); candidate <= Math.min(width - 1, x + 4); candidate++) {
                const cost = previous[candidate] + Math.abs(x - candidate) * .075;
                if (cost < best) { best = cost; parent = candidate; }
            }
            const alpha = data[(y * width + x) * 4 + 3] / 255;
            next[x] = best + 15 * alpha ** 2 + Math.abs(radius - x) * .008;
            parents[y * width + x] = parent;
        }
        previous = next;
    }
    let x = previous.indexOf(Math.min(...previous));
    const seam = new Int16Array(height);
    for (let y = height - 1; y >= 0; y--) {
        seam[y] = center - radius + x;
        x = parents[y * width + x];
    }
    return seam;
}

// The original sheet has a warm paper background. Estimate its contribution
// near pale edges, while keeping interior pixels (including white petals).
function isolatePaper(data, width, height) {
    const total = width * height;
    const ink = new Float32Array(total);
    for (let p = 0; p < total; p++) {
        const i = p * 4;
        ink[p] = Math.max((253 - data[i]) / 253, (249 - data[i + 1]) / 249, (238 - data[i + 2]) / 238, 0);
    }
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const p = y * width + x;
            const i = p * 4;
            const current = ink[p];
            const local = Math.max(current, ink[p - width] || 0, ink[p + width] || 0,
                ink[y * width + Math.max(0, x - 1)], ink[y * width + Math.min(width - 1, x + 1)]);
            const alpha = current <= .039 ? 0 : clamp((current - .022) / (local >= .245 ? .21 : .105), 0, 1);
            data[i + 3] = Math.round(255 * alpha);
            if (alpha > .04 && alpha < 1) {
                for (let c = 0; c < 3; c++) {
                    const paper = [253, 249, 238][c];
                    data[i + c] = clamp(Math.round((data[i + c] - paper * (1 - alpha)) / alpha), 0, 255);
                }
            }
        }
    }
}

// Keep the connected specimen. This removes disconnected leaves from the
// next tile and soft noise outside the generated alpha silhouette.
function keepSpecimen(data, width, height, legacy) {
    const count = width * height;
    const group = new Int32Array(count);
    const queue = new Int32Array(count);
    let id = 0, main = 0, biggest = 0;
    for (let p = 0; p < count; p++) {
        if (group[p] || data[p * 4 + 3] < (legacy ? 49 : 41)) continue;
        group[p] = ++id;
        let tail = 1;
        queue[0] = p;
        for (let cursor = 0; cursor < tail; cursor++) {
            const point = queue[cursor];
            const x = point % width;
            const y = (point / width) | 0;
            for (let dy = -1; dy <= 1; dy++) {
                if (y + dy < 0 || y + dy >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (x + dx < 0 || x + dx >= width) continue;
                    const neighbor = point + dy * width + dx;
                    if (group[neighbor] || data[neighbor * 4 + 3] < (legacy ? 49 : 41)) continue;
                    group[neighbor] = id;
                    queue[tail++] = neighbor;
                }
            }
        }
        if (tail > biggest) {
            main = id;
            biggest = tail;
        }
    }
    if (biggest < 340) throw new Error('No intact plant in crop');
    const radius = 2;
    for (let p = 0; p < count; p++) {
        const i = p * 4 + 3;
        if (group[p] === main) continue;
        if (data[i] < 13) {
            data[i] = 0;
            continue;
        }
        const x = p % width;
        const y = (p / width) | 0;
        let near = false;
        for (let dy = -radius; dy <= radius && !near; dy++) {
            if (y + dy < 0 || y + dy >= height) continue;
            for (let dx = -radius; dx <= radius; dx++) {
                if (x + dx < 0 || x + dx >= width) continue;
                if (group[p + dy * width + dx] === main) {
                    near = true;
                    break;
                }
            }
        }
        if (!near) data[i] = 0;
    }
    return biggest;
}

function dimensions(data, width, height) {
    let x0 = width, x1 = 0, y0 = height, y1 = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] < 17) continue;
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
        }
    }
    const foot = [];
    const rootDepth = Math.max(3, Math.floor((y1 - y0) * .026));
    for (let x = x0; x <= x1; x++) {
        for (let y = y1 - rootDepth; y <= y1; y++) {
            if (data[(y * width + x) * 4 + 3] > 100) foot.push(x);
        }
    }
    foot.sort((a, b) => a - b);
    return {
        left: Math.max(0, x0 - 2), top: Math.max(0, y0 - 2),
        right: Math.min(width, x1 + 3), bottom: Math.min(height, y1 + 3),
        rootX: foot.length ? foot[foot.length >> 1] : (x0 + x1) / 2,
        rootY: y1,
        touches: [x0, width - 1 - x1, y0, height - 1 - y1],
    };
}

await mkdir(destination, { recursive: true });
await mkdir(thumbnails, { recursive: true });
const catalog = [];
for (const sheet of sheets) {
    const legacy = sheet.file.endsWith('.jpg');
    const source = resolve(folder, legacy ? sheet.file : 'art/source/' + sheet.file);
    for (let row = 0; row < sheet.rows.length; row++) {
        const [top, bottom, ...x] = sheet.rows[row];
        const seams = new Map(await Promise.all((sheet.seams?.[row] ?? []).map(async edge =>
            [edge, await findSeam(source, top, bottom, x[edge])])));
        for (let col = 0; col < 5; col++) {
            const [id, name, category, habit] = sheet.entries[row * 5 + col];
            const start = seams.get(col);
            const end = seams.get(col + 1);
            const left = start ? Math.min(...start) : x[col];
            const right = end ? Math.max(...end) : x[col + 1];
            const {data, info:{width, height}} = await sharp(source)
                .extract({left, top, width:right - left, height:bottom - top})
                .ensureAlpha().raw().toBuffer({resolveWithObject:true});
            if (start || end) {
                for (let y = 0; y < height; y++) {
                    for (let px = 0; px < width; px++) {
                        if (left + px < (start?.[y] ?? left) || left + px >= (end?.[y] ?? right)) {
                            data[(y * width + px) * 4 + 3] = 0;
                        }
                    }
                }
            }
            if (legacy) isolatePaper(data, width, height);
            keepSpecimen(data, width, height, legacy);
            const box = dimensions(data, width, height);
            const cropWidth = box.right - box.left;
            const cropHeight = box.bottom - box.top;
            const file = String(id).padStart(3, '0') + '.webp';
            await sharp(data, {raw:{width,height,channels:4}})
                .extract({left:box.left, top:box.top, width:cropWidth, height:cropHeight})
                .resize({width:430, height:430, fit:'inside', withoutEnlargement:true})
                .webp({quality:91, alphaQuality:100, effort:5}).toFile(resolve(destination, file));
            const artwork = sharp(resolve(destination, file));
            await artwork.clone().resize({ width: 160, height: 160, fit: 'inside' })
                .png().toFile(resolve(thumbnails, file.replace(/\.webp$/, '.png')));
            const saved = await artwork.metadata();
            catalog.push({
                id, name, category, file, original: id <= 40,
                width: saved.width, height: saved.height,
                rootX: Number(((box.rootX - box.left) / cropWidth).toFixed(4)),
                rootY: Number(((box.rootY - box.top) / cropHeight).toFixed(4)),
                habit, ...habits[habit],
            });
            if (box.touches.includes(0)) console.warn('Inspect edge:', id, name, box.touches);
        }
    }
}
catalog.sort((a,b) => a.id - b.id);
if (catalog.length !== 110 || new Set(catalog.map(p => p.id)).size !== 110) {
    throw new Error('The plant catalog must contain 110 separate illustrations');
}
const order = featuredIds.concat(catalog.map(p => p.id).filter(id => !featuredIds.includes(id)));
await writeFile(resolve(folder, 'plants.json'), JSON.stringify({order, plants:catalog}, null, 2) + '\n');
console.log('Isolated', catalog.length, 'transparent specimens.');
