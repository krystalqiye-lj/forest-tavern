import { characters, getRequestHeaders } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const plantList = new URL('./plant-atlas/plants.json?v=1.2.1', import.meta.url);
const naturalList = new URL('./plant-atlas/natural.json?v=1.2.1', import.meta.url);
const layoutFile = 'linjian-garden-v1.json';
const layoutUrl = '/user/files/' + layoutFile;
const scenes = ['oak', 'creek', 'lake', 'falls'];
const seeds = [
    ['oak',.393,.706], ['oak',.592,.718], ['oak',.338,.830], ['oak',.627,.846],
    ['creek',.373,.637], ['creek',.598,.628], ['creek',.377,.854], ['creek',.588,.838],
];
const position = (scene, x, y) => ({ scene, x, y });
const unit = value => Number.isFinite(value) && value >= 0 && value <= 1;
const validSpot = spot => spot === null || Boolean(spot && scenes.includes(spot.scene) && unit(spot.x) && unit(spot.y));

function encodeLayout(state) {
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    let payload = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
        payload += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    return btoa(payload);
}

function readLayout(raw, plants) {
    const order = Array.from(new Set((Array.isArray(raw?.order) ? raw.order : [])
        .filter(value => typeof value === 'string' && value)));
    const rawUnlocked = Array.isArray(raw?.unlocked) ? raw.unlocked : [];
    const unlocked = Array.from(new Set(rawUnlocked.filter(id => plants.has(id))));
    const roles = Object.create(null);
    if (raw?.roles && typeof raw.roles === 'object') {
        for (const [id, assignment] of Object.entries(raw.roles)) {
            if (!assignment || !plants.has(assignment.plant) || !validSpot(assignment.spot)) continue;
            roles[id] = { plant: assignment.plant, spot: assignment.spot };
        }
    }
    return {
        version: 1, order, unlocked, roles,
        seedDefaults: !raw || raw.seedDefaults === true,
    };
}

export async function loadGarden() {
    const [response, natural] = await Promise.all([
        fetch(plantList),
        fetch(naturalList).then(file => file.ok ? file.json() : {}).catch(() => ({})),
    ]);
    if (!response.ok) throw new Error('植物图鉴未能加载。');
    const source = await response.json();
    const plants = new Map(source.plants.map(plant => {
        const model = natural[plant.id];
        return [plant.id, {
            ...plant,
            src: new URL('art/specimens/' + plant.file, plantList).href,
            model: model && {
                ...model,
                src: new URL('art/natural/' + model.file + '?v=1.2.1', naturalList).href,
            },
        }];
    }));
    const variety = Array.from(plants.keys());
    const canNotify = typeof BroadcastChannel === 'function';
    const channel = canNotify ? new BroadcastChannel('forest-garden') : null;
    const deleting = new Set();
    const installedAvatars = new Map();
    let pending = Promise.resolve();

    async function load() {
        const file = await fetch(layoutUrl, { cache: 'no-store', credentials: 'same-origin' });
        if (file.ok) return readLayout(await file.json(), plants);
        if (file.status !== 404) throw new Error('读取花园失败，请重试。');
        const order = extension_settings.forestTavern?.order;
        return readLayout({ order, seedDefaults: true }, plants);
    }

    async function save(state) {
        const result = await fetch('/api/files/upload', {
            method: 'POST', headers: getRequestHeaders(),
            body: JSON.stringify({ name: layoutFile, data: encodeLayout(state) }),
        });
        if (!result.ok) throw new Error('没有保存成功，请重试。');
        channel?.postMessage('saved');
    }

    const roster = () => new Map(characters.filter(card => card?.avatar && card.avatar !== 'none' &&
        !deleting.has(card.avatar))
        .map(card => [card.avatar, card]));
    let state = readLayout({ order: extension_settings.forestTavern?.order, seedDefaults: true }, plants);

    function reconcile(next) {
        const cards = roster();
        const wasNew = next.seedDefaults;
        const used = new Set([...next.unlocked, ...Object.values(next.roles).map(role => role.plant)]);
        let changed = false;
        if (deleting.size) {
            const order = next.order.filter(id => !deleting.has(id));
            changed = order.length !== next.order.length;
            next.order = order;
            for (const id of deleting) {
                if (Object.hasOwn(next.roles, id)) {
                    delete next.roles[id];
                    changed = true;
                }
            }
        }
        for (const id of cards.keys()) {
            if (!next.order.includes(id)) {
                next.order.push(id);
                changed = true;
            }
        }
        const legacySlots = next.order.slice(0, seeds.length).map(id => cards.has(id) ? id : null);
        if (wasNew) {
            const extras = next.order.slice(seeds.length).filter(id => cards.has(id));
            for (let index = 0; index < seeds.length; index++) {
                legacySlots[index] ??= extras.shift() ?? null;
            }
        }
        for (const [index, id] of next.order.entries()) {
            if (!cards.has(id) || Object.hasOwn(next.roles, id)) continue;
            const inherited = wasNew && plants.has(index + 1) ? index + 1 : undefined;
            const plant = inherited ?? variety.find(id => !used.has(id)) ?? variety[index % variety.length];
            used.add(plant);
            const slot = wasNew ? legacySlots.indexOf(id) : -1;
            const seed = seeds[slot];
            next.roles[id] = { plant, spot: seed ? position(...seed) : null };
            changed = true;
        }
        changed ||= used.size !== next.unlocked.length;
        next.unlocked = Array.from(used).sort((a, b) => a - b);
        if (wasNew && cards.size) {
            next.seedDefaults = false;
            changed = true;
        }
        return changed;
    }

    function data() {
        const cards = roster();
        return {
            unlocked: state.unlocked.map(id => plants.get(id)),
            cards: state.order.flatMap(id => {
                const card = cards.get(id);
                const assignment = state.roles[id];
                if (!card || !assignment) return [];
                return [{ id, name: card.name || '未命名角色', plant: plants.get(assignment.plant), spot: assignment.spot }];
            }),
        };
    }

    function enqueue(operation, updateRoster = false) {
        const task = pending.then(async () => {
            if (updateRoster) await refreshDeletedCards();
            // Re-read the shared copy before changing a role so other devices' edits are retained.
            const next = await load();
            const changed = reconcile(next);
            const updated = operation?.(next);
            if (changed || updated) await save(next);
            state = next;
            // The filename can be reused by a later import. Release the
            // tombstone only after the old assignment has been erased.
            for (const card of characters) {
                if (deleting.has(card?.avatar) && installedAvatars.get(card.avatar) === card.create_date &&
                    Boolean(card.create_date) && !Object.hasOwn(next.roles, card.avatar)) {
                    deleting.delete(card.avatar);
                }
            }
            return data();
        });
        pending = task.catch(() => {});
        return task;
    }

    async function refreshDeletedCards() {
        // Each SillyTavern tab has a separate list. Keep its stale entries from
        // re-creating assignments removed on a phone or another tab.
        try {
            const response = await fetch('/api/characters/all', {
                method: 'POST', headers: getRequestHeaders(), body: '{}',
            });
            if (!response.ok) return;
            const cards = await response.json();
            installedAvatars.clear();
            for (const card of cards) installedAvatars.set(card.avatar, card.create_date);
        } catch { return; }
        for (const card of characters) {
            if (card?.avatar && card.avatar !== 'none' && !installedAvatars.has(card.avatar)) {
                deleting.add(card.avatar);
            }
        }
    }

    try {
        state = await load();
    } catch (error) {
        console.warn('林间拾叶暂时无法同步花园：', error.message);
    }
    reconcile(state);

    return {
        data,
        refresh: updateRoster => enqueue(undefined, updateRoster),
        isPlanted(id) { return !deleting.has(id) && Boolean(state.roles[id]?.spot); },
        onUpdate(callback) { if (channel) channel.onmessage = callback; },
        rename(oldId, newId) {
            if (typeof oldId !== 'string' || typeof newId !== 'string' || oldId === newId ||
                !Object.hasOwn(state.roles, oldId)) return Promise.resolve(data());
            return enqueue(next => {
                if (!Object.hasOwn(next.roles, oldId)) return false;
                next.roles[newId] = next.roles[oldId];
                delete next.roles[oldId];
                next.order = Array.from(new Set(next.order.map(id => id === oldId ? newId : id)));
                return true;
            });
        },
        remove(id) {
            installedAvatars.delete(id);
            deleting.add(id);
            return enqueue();
        },
        edit(id, changes) {
            return enqueue(next => {
                if (!roster().has(id) || !Object.hasOwn(next.roles, id)) {
                    throw new Error('这个角色已不在图鉴里。');
                }
                const target = next.roles[id];
                if (Object.hasOwn(changes, 'plant')) {
                    if (!next.unlocked.includes(changes.plant)) throw new Error('这个品种还没有解锁。');
                    target.plant = changes.plant;
                }
                if (Object.hasOwn(changes, 'spot')) {
                    if (!validSpot(changes.spot)) throw new Error('这个位置无法保存。');
                    target.spot = changes.spot;
                }
                return true;
            });
        },
    };
}
