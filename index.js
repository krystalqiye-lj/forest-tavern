import { characters, default_avatar, isGenerating, selectCharacterById, this_chid } from '../../../../script.js';
import { eventSource, event_types } from '../../../events.js';
import { openWelcomeScreen } from '../../../welcome-screen.js';
import { loadGarden } from './garden.js?v=1.4.1';
import { activeTheme, availableThemes, switchTheme } from './theme-choice.js?v=1';
import { installForestMessageTools, installForestReader } from './forest-reader.js?v=1.3.0';
import { installForestChatWidgets } from './forest-chat-widgets.js?v=1.3.1';

const sourceUrl = new URL('./forest.html?v=1.4.1', import.meta.url);
const $ = id => document.getElementById(id);

function installForest() {
    const toolbar = $('top-settings-holder');
    const chat = $('sheld');
    if (!toolbar || !chat || $('forest-tavern-frame')) return;

    const paper = new Image();
    paper.onload = () => document.documentElement.style.setProperty('--forest-panel-paper', `url("${paper.src}")`);
    paper.src = new URL('./reading-paper-edge.png', import.meta.url).href;

    const drawers = new Map([
        ['ai-config-button', '生成设置'], ['sys-settings-button', 'API 连接'],
        ['advanced-formatting-button', '高级格式'], ['WI-SP-button', '世界书'],
        ['user-settings-button', '用户设置'], ['backgrounds-button', '背景'],
        ['extensions-settings-button', '扩展'], ['persona-management-button', '我的人设'],
        ['rightNavHolder', '角色管理'],
    ]);
    let selectedDrawer;

    function releaseDrawer(entry) {
        entry.observer.disconnect();
        entry.panel.removeAttribute('data-forest-drawer');
        if (entry.hadLibraryStyle) entry.panel.classList.add('qinghe-panel');
        entry.heading.remove();
        if (selectedDrawer === entry) {
            selectedDrawer = undefined;
            delete document.body.dataset.forestDrawerOpen;
        }
    }

    function closeDrawer() {
        if (!selectedDrawer) return;
        const entry = selectedDrawer;
        if (entry.panel.classList.contains('openDrawer')) entry.toggle.click();
        releaseDrawer(entry);
    }

    function openDrawer(id) {
        const label = drawers.get(id);
        const drawer = $(id);
        const toggle = drawer?.querySelector(':scope > .drawer-toggle');
        const panel = drawer?.querySelector(':scope > .drawer-content');
        if (!label || !toggle || !panel) return;
        closeDrawer();
        let opened = panel.classList.contains('openDrawer');
        const heading = document.createElement('header');
        heading.className = 'forest-drawer-heading';
        heading.innerHTML = `
            <h2></h2>
            <button type="button" class="forest-drawer-close"><span aria-hidden="true">×</span> 关闭</button>`;
        heading.querySelector('h2').textContent = label;
        heading.querySelector('button').addEventListener('click', closeDrawer);
        const hadLibraryStyle = panel.classList.contains('qinghe-panel');
        const entry = { panel, toggle, heading, hadLibraryStyle, observer: new MutationObserver(() => {
            if (panel.classList.contains('openDrawer')) opened = true;
            else if (opened) releaseDrawer(entry);
        }) };
        selectedDrawer = entry;
        document.body.dataset.forestDrawerOpen = id;
        panel.setAttribute('data-forest-drawer', '');
        if (hadLibraryStyle) panel.classList.remove('qinghe-panel');
        panel.prepend(heading);
        entry.observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
        if (!opened) toggle.click();
    }

    const frame = document.createElement('iframe');
    frame.id = 'forest-tavern-frame';
    frame.title = '林间拾叶';
    frame.hidden = true;
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    frame.setAttribute('allow', 'autoplay');
    document.body.append(frame);

    const bookHead = document.createElement('header');
    bookHead.className = 'forest-book-head';
    bookHead.hidden = true;
    bookHead.innerHTML = `
        <button class="forest-back" type="button" aria-label="合上书，返回森林"><span aria-hidden="true">×</span> 合上书</button>
        <h1 class="forest-book-title"></h1>
        <nav class="forest-reader-tools" aria-label="阅读工具">
            <button type="button" data-reader-panel="font" aria-controls="forest-reader-panel" aria-expanded="false">Aa 字体</button>
            <button type="button" data-reader-panel="settings" aria-controls="forest-reader-panel" aria-expanded="false">设置</button>
            <button class="forest-addons-toggle" type="button" aria-expanded="false" hidden>附加面板</button>
        </nav>
        <div class="forest-book-tabs">
            <button class="forest-bookmark" type="button" aria-controls="forest-plant-note" aria-expanded="false" hidden>
                <img class="forest-book-plant" alt="" draggable="false">
            </button>
            <button class="forest-photo-tab" type="button" aria-controls="forest-photo-note" aria-expanded="false">
                <img alt="" draggable="false">
            </button>
        </div>
        <aside class="forest-plant-note" id="forest-plant-note" hidden>
            <img class="forest-book-plant" alt="" draggable="false">
            <strong></strong>
        </aside>
        <div class="forest-reader-panel" id="forest-reader-panel" hidden>
            <div data-reader-content="font" hidden>
                <label class="forest-reader-field" for="forest-reader-font">正文字体
                    <select id="forest-reader-font">
                        <option value="round">霞鹜 975 圆体 SC</option>
                        <option value="wenkai">霞鹜文楷</option>
                        <option value="serif">思源宋体</option>
                        <option value="sans">思源黑体</option>
                    </select>
                </label>
                <label class="forest-reader-slider" for="forest-reader-size">字号
                    <output for="forest-reader-size"></output>
                    <input id="forest-reader-size" type="range" min="14" max="26" step="1">
                </label>
                <label class="forest-reader-slider" for="forest-reader-spacing">行距
                    <output for="forest-reader-spacing"></output>
                    <input id="forest-reader-spacing" type="range" min="1.4" max="2.4" step="0.1">
                </label>
                <button class="forest-reader-reset" type="button">恢复默认</button>
            </div>
            <div data-reader-content="settings" hidden>
                <label class="forest-reader-field" for="forest-reader-weather">天气
                    <select id="forest-reader-weather">
                        <option value="breeze">晴间微风</option>
                        <option value="wind">林间大风</option>
                        <option value="rain">小雨</option>
                        <option value="storm">雷雨</option>
                    </select>
                </label>
                <div class="forest-reader-links"></div>
            </div>
        </div>
        <dialog class="forest-photo-note" id="forest-photo-note" aria-labelledby="forest-photo-caption">
            <button type="button" class="forest-photo-close" aria-label="合上相片" autofocus>×</button>
            <figure>
                <img alt="" draggable="false">
                <figcaption id="forest-photo-caption"></figcaption>
            </figure>
        </dialog>
    `;
    chat.prepend(bookHead);
    const back = bookHead.querySelector('.forest-back');
    const readerLinks = bookHead.querySelector('.forest-reader-links');
    const drawerOrder = ['sys-settings-button', 'persona-management-button', 'ai-config-button',
        'user-settings-button', 'WI-SP-button', 'advanced-formatting-button', 'rightNavHolder',
        'extensions-settings-button', 'backgrounds-button'];
    for (const id of drawerOrder) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.readerDrawer = id;
        button.textContent = id === 'persona-management-button' ? '人设 · 面具' : drawers.get(id);
        readerLinks.append(button);
    }
    const reader = installForestReader(bookHead, openDrawer, value => send('set-weather', { value }));
    const closeMessageTools = installForestMessageTools(chat.querySelector('#chat'));
    const chatWidgets = installForestChatWidgets();
    eventSource.makeLast(event_types.APP_READY, () => {
        for (const [id, label] of [['options_button', '对话菜单'], ['send_but', '发送消息']]) {
            $(id)?.setAttribute('aria-label', label);
        }
    });
    const addonsToggle = bookHead.querySelector('.forest-addons-toggle');
    const panelLabels = new Set(['芋圆机按钮', '芋圆手机', '美化面板', '剧情核心']);
    const composer = chat.querySelector('#send_form');
    function updateAddonButtons() {
        const bar = composer?.querySelector('#qr--bar.TH--qr--bar');
        let hasAddons = false;
        for (const group of bar?.querySelectorAll('.qr--buttons') ?? []) {
            const buttons = [...group.querySelectorAll('.qr--button')];
            const hidden = buttons.map(control => {
                const label = control.textContent.replace(/[^\p{Script=Han}]/gu, '');
                const isAddon = panelLabels.has(label);
                control.toggleAttribute('data-forest-addon', isAddon);
                return isAddon;
            });
            hasAddons ||= hidden.includes(true);
            group.toggleAttribute('data-forest-addon', buttons.length > 0 && hidden.every(Boolean));
        }
        if (bar) {
            bar.toggleAttribute('data-forest-addon', hasAddons && !bar.querySelector('.qr--button:not([data-forest-addon])'));
        }
        addonsToggle.hidden = !hasAddons;
    }
    addonsToggle.addEventListener('click', () => {
        const expanded = chat.classList.toggle('forest-show-addons');
        addonsToggle.setAttribute('aria-expanded', String(expanded));
        addonsToggle.textContent = expanded ? '收起面板' : '附加面板';
    });
    if (composer) {
        new MutationObserver(updateAddonButtons).observe(composer, { childList: true, characterData: true, subtree: true });
        updateAddonButtons();
    }
    const bookmark = bookHead.querySelector('.forest-bookmark');
    const plantNote = bookHead.querySelector('.forest-plant-note');
    const photo = bookHead.querySelector('.forest-photo-tab');
    const photoNote = bookHead.querySelector('.forest-photo-note');
    photo.addEventListener('click', () => {
        togglePlantNote(false);
        photoNote.showModal();
        photo.setAttribute('aria-expanded', 'true');
    });
    photoNote.querySelector('button').addEventListener('click', () => photoNote.close());
    photoNote.addEventListener('click', event => {
        if (event.target === photoNote) photoNote.close();
    });
    photoNote.addEventListener('close', () => photo.setAttribute('aria-expanded', 'false'));
    function togglePlantNote(visible) {
        plantNote.hidden = !visible;
        bookmark.setAttribute('aria-expanded', String(visible));
    }
    bookmark.addEventListener('click', () => togglePlantNote(plantNote.hidden));
    document.addEventListener('click', event => {
        if (!plantNote.hidden && !bookHead.contains(event.target)) togglePlantNote(false);
    });
    bookHead.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !plantNote.hidden) {
            event.stopPropagation();
            togglePlantNote(false);
            bookmark.focus();
        }
    });

    let opening = false;
    let mode = 'closed';
    let garden, startingGarden, catalogSent = '';
    let rosterTimer;
    function send(type, payload = {}) {
        frame.contentWindow?.postMessage({ forestTavern: type, ...payload }, sourceUrl.origin);
    }
    function sync(force = false) {
        if (mode !== 'forest') return;
        const data = garden ? garden.data() : {
            cards: characters.filter(card => card?.avatar).map(card => ({ id: card.avatar, name: card.name })),
            unlocked: [],
        };
        const signature = JSON.stringify(data);
        if (force || signature !== catalogSent) {
            catalogSent = signature;
            send('catalog', data);
        }
    }
    function getGarden() {
        if (garden) return Promise.resolve(garden);
        startingGarden ??= loadGarden().then(result => {
            garden = result;
            garden.onUpdate(() => refreshGarden(true));
            sync();
            return garden;
        }).finally(() => { startingGarden = undefined; });
        return startingGarden;
    }
    async function refreshGarden(updateRoster = false) {
        try {
            await (await getGarden()).refresh(updateRoster);
            sync();
            const card = characters[this_chid];
            if (mode === 'reading' && card?.avatar) updateBookPlant(card);
        } catch (error) {
            console.warn('林间拾叶暂时无法同步花园：', error.message);
        }
    }
    function scheduleRefresh() {
        clearTimeout(rosterTimer);
        rosterTimer = setTimeout(refreshGarden, 140);
    }
    function setMode(next) {
        const forest = next === 'forest';
        const reading = next === 'reading';
        const changed = mode !== next;
        mode = next;
        closeDrawer();
        frame.hidden = next === 'closed';
        frame.inert = !forest;
        frame.tabIndex = forest ? 0 : -1;
        frame.setAttribute('aria-hidden', String(!forest));
        document.body.classList.toggle('forest-tavern-active', forest);
        document.body.classList.toggle('forest-tavern-reading', reading);
        chat.inert = forest;
        bookHead.hidden = !reading;
        if (!reading) {
            chatWidgets.close();
            reader.close();
            closeMessageTools();
            togglePlantNote(false);
            if (photoNote.open) photoNote.close();
            if ($('options')?.getClientRects().length) $('options_button')?.click();
        }
        if (!frame.hidden && !frame.hasAttribute('src')) frame.src = sourceUrl.href;
        else if (changed) send('view', { mode });
    }
    function updateBookPlant(card) {
        const plant = garden?.data().cards.find(entry => entry.id === card.avatar)?.plant;
        bookmark.hidden = !plant;
        if (!plant) {
            togglePlantNote(false);
            return;
        }
        for (const image of bookHead.querySelectorAll('.forest-book-plant')) {
            if (image.dataset.plant === plant.src) continue;
            image.dataset.plant = plant.src;
            image.onerror = () => {
                image.onerror = null;
                image.src = plant.thumbnail;
            };
            image.src = plant.src;
        }
        bookmark.setAttribute('aria-label', `查看植物书签 ${plant.name}`);
        plantNote.querySelector('strong').textContent = plant.name;
    }
    function updateBook(card, forcePhoto = false) {
        const name = card.name || '未命名角色';
        bookHead.querySelector('.forest-book-title').textContent = name;
        const avatar = card.avatar === 'none' ? new URL(default_avatar, window.location.href).href :
            new URL('/characters/' + encodeURIComponent(card.avatar), window.location.origin).href;
        const source = new URL(avatar);
        if (forcePhoto) source.searchParams.set('t', String(Date.now()));
        const changed = photo.dataset.avatar !== avatar;
        if (changed || forcePhoto) {
            photoNote.close();
            togglePlantNote(false);
            photo.dataset.avatar = avatar;
            for (const image of [photo.querySelector('img'), photoNote.querySelector('img')]) {
                image.onerror = () => {
                    image.onerror = null;
                    image.src = default_avatar;
                };
                image.src = source.href;
            }
        }
        photo.setAttribute('aria-label', `查看角色相片 ${name}`);
        photoNote.querySelector('figcaption').textContent = name;
        updateBookPlant(card);
    }
    function read(card) {
        chatWidgets.open(card.avatar);
        updateBook(card);
        setMode('reading');
        chatWidgets.finish();
    }
    function focusChat() {
        chat.tabIndex = -1;
        chat.focus({ preventScroll: true });
    }
    function show() {
        if ($('qinghe-library')?.hidden === false) $('qinghe-toggle')?.click();
        setMode('forest');
        sync();
        frame.focus({ preventScroll: true });
    }
    back.addEventListener('click', show);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
        if (selectedDrawer) closeDrawer();
        else if (mode === 'reading' && !reader.close(true) && !closeMessageTools(true)) show();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (opening || mode !== 'reading') return;
        const card = characters[this_chid];
        if (card?.avatar) read(card);
        else show();
    });
    window.addEventListener('message', async event => {
        if (event.origin !== sourceUrl.origin || event.source !== frame.contentWindow || mode === 'closed') return;
        const message = event.data;
        if (message?.forestTavern === 'ready') {
            send('theme-options', { themes: availableThemes().filter(theme => theme.id !== 'forest') });
            send('view', { mode });
            sync(true);
            return;
        }
        if (message?.forestTavern === 'weather') {
            reader.updateWeather(message.value);
            return;
        }
        if (mode !== 'forest') return;
        if (message?.forestTavern === 'refresh-garden') {
            void refreshGarden(true);
            return;
        }
        if (message?.forestTavern === 'edit-garden' && typeof message.id === 'string' &&
            Number.isSafeInteger(message.request)) {
            const reply = { request: message.request };
            const changes = {};
            if (Object.hasOwn(message, 'plant')) changes.plant = message.plant;
            if (Object.hasOwn(message, 'spot')) changes.spot = message.spot;
            try {
                if (!Object.keys(changes).length) return;
                await (await getGarden()).edit(message.id, changes);
                sync();
                send('garden-saved', reply);
            } catch (error) {
                send('garden-failed', { ...reply, text: error.message || '没有保存成功，请再试一次。' });
            }
            return;
        }
        if (message?.forestTavern === 'switch-theme') {
            if (isGenerating()) send('theme-failed', { text: '回复结束后就可以切换。' });
            else if (!switchTheme(message.id)) send('theme-failed', { text: '主题不可用，或暂时无法保存选择。' });
            return;
        }
        if (message?.forestTavern === 'drawer' && drawers.has(message.id)) {
            openDrawer(message.id);
            return;
        }
        if (message?.forestTavern !== 'character') return;
        if (opening) {
            send('failed', { text: '正在打开角色，请稍等。' });
            return;
        }
        if (message.via !== 'catalog' && !(message.via === 'plant' && garden?.isPlanted(message.id))) {
            send('failed');
            return;
        }
        if (isGenerating()) {
            send('failed', { text: '请等当前回复结束后再切换角色。' });
            return;
        }
        const id = characters.findIndex(card => card.avatar === message.id);
        if (id < 0) {
            sync();
            send('failed');
            return;
        }

        opening = true;
        chatWidgets.open(message.id);
        try {
            await selectCharacterById(id, { switchMenu: false });
            if (mode !== 'forest') return;
            const card = characters[this_chid];
            if (card?.avatar !== message.id) {
                send('failed');
                return;
            }
            read(card);
            focusChat();
        } catch (error) {
            console.error('林间拾叶无法打开角色', error);
            send('failed');
        } finally {
            opening = false;
            if (mode === 'forest') chatWidgets.close();
        }
    });

    eventSource.on(event_types.CHARACTER_EDITED, () => {
        scheduleRefresh();
        const card = characters[this_chid];
        if (mode === 'reading' && card?.avatar) updateBook(card, true);
    });
    eventSource.on(event_types.CHARACTER_RENAMED, async (oldId, newId) => {
        try {
            await (await getGarden()).rename(oldId, newId);
        } catch (error) {
            console.warn('林间拾叶无法保留改名角色的植物：', error.message);
        }
    });
    eventSource.on(event_types.CHARACTER_DELETED, async ({ character } = {}) => {
        if (!character?.avatar) return;
        try {
            const removal = (await getGarden()).remove(character.avatar);
            sync();
            await removal;
            sync();
        } catch (error) {
            console.warn('林间拾叶无法保存删除后的花园：', error.message);
            scheduleRefresh();
        }
    });
    const list = $('rm_print_characters_block');
    if (list) new MutationObserver(scheduleRefresh).observe(list, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void refreshGarden(true);
    });
    eventSource.removeListener(event_types.APP_READY, openWelcomeScreen);
    eventSource.removeListener(event_types.CHAT_CHANGED, openWelcomeScreen);
    eventSource.makeLast(event_types.APP_READY, () => {
        if (mode === 'forest') show();
    });
    show();
    void refreshGarden();
}

eventSource.on(event_types.APP_INITIALIZED, () => {
    if (activeTheme() === 'forest') installForest();
});
