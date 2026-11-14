(() => {
    const find = (selector, root = document) => root.querySelector(selector);
    const write = (type, fields = {}) => parent.postMessage({ forestTavern: type, ...fields }, location.origin);
    const startKey = 'forest-tavern-start-scene';
    const locations = {
        oak: { name: '大树下', trails: [
            { x: .5462, y: .6582, to: 'creek', label: '去小溪边' },
        ] },
        creek: { name: '小溪边', trails: [
            { x: .330, y: .482, to: 'oak', label: '回到大树' },
            { x: 743 / 1536, y: 592 / 1024, to: 'lake', label: '去静湖' },
        ] },
        lake: { name: '静湖', trails: [
            { x: 722 / 1672, y: 667 / 941, to: 'creek', label: '回到小溪边' },
            { x: 957 / 1672, y: 698 / 941, to: 'falls', label: '去瀑布' },
        ] },
        falls: { name: '瀑布', trails: [
            { x: 542 / 1672, y: 771 / 941, to: 'lake', label: '回到静湖' },
        ] },
    };
    const view = find('.view'), choices = find('.plants'), veil = find('.scene-veil');
    const motion = ForestMedia.sceneMotion(find('.scene-still'), find('.scene-clip'));
    const nameplate = find('.plant-nameplate');
    const touchControls = matchMedia('(hover: none) and (pointer: coarse)');
    const plantScale = 1.67;
    const catalog = find('.catalog'), search = find('.catalog-search'), entries = find('.catalog-entries');
    const startSelect = find('.forest-start-scene'), colophonStatus = find('.colophon-status');
    const cultivars = find('.cultivar'), cultivarSearch = find('.cultivar-search'), cultivarChoices = find('.cultivar-choices');
    const station = find('.field-station'), bookProp = find('[data-field="catalog"]'), weatherProp = find('[data-field="weather"]');
    const signToggle = find('[data-field="signs"]'), signs = find('.field-signs'), side = find('.side');
    const panHint = find('.pan-hint'), status = find('.forest-status');
    const tool = find('.garden-tool'), instruction = find('.garden-instruction');
    const travelTool = find('.garden-scene'), ghost = find('.plant-ghost');
    let place = 'oak', cards = [], unlocked = [], viewMode = 'forest';
    let readingPlant = null, approached = null, plantSignature = '';
    try {
        const saved = localStorage.getItem(startKey);
        if (Object.hasOwn(locations, saved)) place = saved;
    } catch { /* Keep the default clearing. */ }

    let journey = 0, traveling = false, selecting = false;
    let landing = null, pointer = null, placing = null, picking = null;
    let request = 0, saving = null, noticeTimer, openingTimer;
    let catalogSignature, pendingCatalog, heldControl, releaseTimer;
    const botany = ForestBotany.create(find('.botany'), reduced, {
        visible: () => viewMode === 'forest',
        wind: () => ({ breeze: 1.18, wind: 2.05, rain: .82, storm: 2.45 })[weather],
        weather: () => weather,
    });
    const camera = createForestCamera(view, find('.camera'), choices, reduced, {
        canPan: () => viewMode === 'forest' && !traveling && !selecting && !pointer?.drag &&
            catalog.hidden && side.hidden && signs.hidden,
        onPan: () => {
            panHint.hidden = true;
            landing = null;
            clearApproach();
            botany.invalidate();
        },
    });

    function syncMotion() {
        motion.update(place, {
            paused: reduced.matches || document.hidden || viewMode === 'closed',
            rate: ({ breeze: 1, wind: 1.55, rain: .84, storm: 1.43 })[weather],
        });
        botany.invalidate();
    }

    function showLocation(next) {
        clearApproach();
        place = next;
        scene.dataset.place = next;
        camera.setScene(next);
        camera.reset();
        renderPlants();
        syncMotion();
        setWeatherScene(next);
    }

    function flash(text, time = 3400) {
        clearTimeout(noticeTimer);
        status.textContent = text;
        status.hidden = !text;
        if (text && time) noticeTimer = setTimeout(() => { status.hidden = true; }, time);
    }

    function lockScene() {
        for (const button of choices.querySelectorAll('button')) button.disabled = selecting || traveling || Boolean(placing);
        for (const button of station.querySelectorAll('button')) button.disabled = traveling || selecting;
    }

    function closeMenu() {
        side.hidden = true;
        weatherProp.setAttribute('aria-expanded', 'false');
    }
    function closeSigns() {
        signs.hidden = true;
        signToggle.setAttribute('aria-expanded', 'false');
    }
    function closeCatalog(focus = false) {
        if (cultivars.open) cultivars.close();
        catalog.hidden = true;
        bookProp.setAttribute('aria-expanded', 'false');
        if (focus) bookProp.focus({ preventScroll: true });
    }

    async function travel(button, next) {
        if (traveling || selecting || placing) return;
        const thisJourney = ++journey;
        traveling = true;
        clearApproach();
        closeMenu();
        closeSigns();
        closeCatalog();
        lockScene();
        await camera.approach(button, 1.19, 410);
        if (thisJourney !== journey) return;
        veil.classList.add('covered');
        if (!reduced.matches) await new Promise(resolve => setTimeout(resolve, 265));
        if (thisJourney !== journey) return;
        showLocation(next);
        traveling = false;
        lockScene();
        view.focus({ preventScroll: true });
        veil.classList.remove('covered');
    }

    function setPosition(el, x, y) {
        el.style.setProperty('--x', (x * 100) + '%');
        el.style.setProperty('--y', (y * 100) + '%');
    }

    function clearApproach(duration) {
        if (!approached) return;
        approached.button.removeAttribute('data-approached');
        approached = null;
        nameplate.hidden = true;
        if (duration !== undefined) camera.reset(duration);
    }

    function placeNameplate(button) {
        if (nameplate.hidden) return;
        const hit = button.getBoundingClientRect();
        const edge = nameplate.offsetWidth / 2 + 12;
        const x = Math.min(view.clientWidth - edge, Math.max(edge, (hit.left + hit.right) / 2));
        const y = Math.min(view.clientHeight - 12, Math.max(nameplate.offsetHeight + 12, hit.top - 7));
        nameplate.style.left = x + 'px';
        nameplate.style.top = y + 'px';
    }

    async function approachPlant(card, button) {
        clearApproach();
        const preview = { card, button, ready: false };
        approached = preview;
        button.setAttribute('data-approached', '');
        panHint.hidden = true;
        closeMenu();
        closeSigns();
        closeCatalog();
        await camera.approach(button, plantScale, 460);
        if (approached !== preview) return;
        preview.ready = true;
        nameplate.textContent = card.name;
        nameplate.setAttribute('aria-label', '打开与' + card.name + '的对话');
        nameplate.hidden = false;
        placeNameplate(button);
    }

    function plantBusy() {
        return selecting || traveling || placing || saving;
    }

    async function openPlant(card, button, alreadyClose = false) {
        if (plantBusy()) return;
        const thisJourney = ++journey;
        selecting = true;
        readingPlant = card.id;
        clearApproach();
        panHint.hidden = true;
        closeMenu();
        closeSigns();
        closeCatalog();
        lockScene();
        if (!alreadyClose) await camera.approach(button, plantScale, 590);
        if (thisJourney === journey) openChat(card, 'plant');
    }

    function renderPlants() {
        const planted = cards.filter(card => card.plant && card.spot?.scene === place)
            .sort((a, b) => a.spot.y - b.spot.y);
        const signature = JSON.stringify([place, planted.map(({ id, name, plant, spot }) => [id, name, plant.id, spot.x, spot.y])]);
        if (signature === plantSignature) return;
        plantSignature = signature;
        clearApproach(260);
        const fragment = document.createDocumentFragment();
        choices.setAttribute('aria-label', locations[place].name + '的花草');
        for (const card of planted) {
            const button = document.createElement('button');
            const label = document.createElement('span');
            button.type = 'button';
            button.className = 'plant specimen';
            button.dataset.id = card.id;
            button.setAttribute('aria-label', '打开与' + card.name + '的对话');
            label.textContent = card.name;
            setPosition(button, card.spot.x, card.spot.y);
            button.append(label);
            button.addEventListener('click', event => {
                if (plantBusy()) return;
                if (approached?.button === button) {
                    if (approached.ready) void openPlant(card, button, true);
                    return;
                }
                const touch = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents ||
                    (!event.pointerType && event.detail > 0 && touchControls.matches);
                if (touch) void approachPlant(card, button);
                else void openPlant(card, button);
            });
            fragment.append(button);
        }

        for (const trail of locations[place].trails) {
            const arrow = document.createElement('button');
            arrow.type = 'button';
            arrow.className = 'plant trail';
            arrow.dataset.to = trail.to;
            arrow.setAttribute('aria-label', trail.label);
            const direction = document.createElement('span');
            direction.textContent = trail.label;
            arrow.append(direction);
            setPosition(arrow, trail.x, trail.y);
            arrow.addEventListener('click', () => travel(arrow, trail.to));
            fragment.append(arrow);
        }

        choices.replaceChildren(fragment);
        resizeHits();
        lockScene();
        botany.setCards(planted);
    }

    function resizeHits() {
        const layerHeight = choices.offsetHeight || innerHeight;
        for (const button of choices.querySelectorAll('.specimen')) {
            const card = cards.find(entry => entry.id === button.dataset.id);
            if (!card?.plant || !card.spot) continue;
            const { width, height } = ForestBotany.measure(card, layerHeight);
            const { rootX, rootY } = card.plant.model ?? card.plant;
            const hitWidth = Math.max(44, width + 6);
            const hitHeight = Math.max(44, height + 6);
            const left = width * rootX + (hitWidth - width) / 2;
            const top = height * rootY + (hitHeight - height) / 2;
            button.style.setProperty('--hit-w', hitWidth + 'px');
            button.style.setProperty('--hit-h', hitHeight + 'px');
            button.style.setProperty('--hit-x', -left + 'px');
            button.style.setProperty('--hit-y', -Math.min(top, card.spot.y * layerHeight) + 'px');
        }
    }

    function openCard(card) {
        if (selecting || traveling || saving) return;
        ++journey;
        selecting = true;
        readingPlant = null;
        closeCatalog();
        lockScene();
        flash('');
        openChat(card, 'catalog');
    }

    function openChat(card, via) {
        clearTimeout(openingTimer);
        openingTimer = setTimeout(() => failOpening('角色还没打开，可以再试一次。'), 15000);
        write('character', { id: card.id, via });
    }

    function failOpening(text) {
        clearTimeout(openingTimer);
        selecting = false;
        lockScene();
        if (readingPlant) camera.reset(300);
        else showCatalog();
        readingPlant = null;
        flash(text || '打开角色失败，请重试。');
    }

    nameplate.addEventListener('click', () => {
        if (approached?.ready) void openPlant(approached.card, approached.button, true);
    });

    function showCatalog() {
        closeMenu();
        closeSigns();
        catalog.hidden = false;
        bookProp.setAttribute('aria-expanded', 'true');
        renderCatalog();
        write('refresh-garden');
    }

    function applyCatalog(message) {
        const signature = JSON.stringify([message.cards, message.unlocked]);
        if (signature === catalogSignature) return;
        catalogSignature = signature;
        cards = message.cards;
        unlocked = message.unlocked;
        renderPlants();
        if (!catalog.hidden) renderCatalog();
        if (cultivars.open) renderCultivars();
    }

    function flushCatalog() {
        clearTimeout(releaseTimer);
        heldControl = undefined;
        if (!pendingCatalog) return;
        const latest = pendingCatalog;
        pendingCatalog = undefined;
        applyCatalog(latest);
    }

    addEventListener('pointerdown', event => {
        if (!event.isPrimary || !event.target.closest('.plant, .plant-nameplate, .catalog-entry, .cultivar-choices')) return;
        clearTimeout(releaseTimer);
        heldControl = event.pointerId;
    }, true);
    function releaseControl(event) {
        if (event.pointerId !== heldControl) return;
        // Older mobile browsers can synthesize a click after pointerup has finished.
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(flushCatalog, 350);
    }
    addEventListener('pointerup', releaseControl);
    addEventListener('pointercancel', releaseControl);
    addEventListener('click', () => {
        if (heldControl !== undefined) flushCatalog();
    });
    addEventListener('blur', () => {
        if (heldControl !== undefined) releaseControl({ pointerId: heldControl });
    });

    function picture(plant) {
        if (!plant) {
            const space = document.createElement('span');
            space.className = 'plant-portrait';
            return space;
        }
        const img = new Image();
        img.className = 'plant-portrait';
        img.alt = '';
        img.decoding = 'async';
        const artwork = touchControls.matches ? [plant.thumbnail, plant.src] : [plant.src, plant.thumbnail];
        ForestMedia.useImage(img, ...artwork, plant.model?.src);
        img.draggable = false;
        return img;
    }

    function renderCatalog() {
        const top = entries.scrollTop;
        const query = search.value.trim().toLocaleLowerCase();
        find('.catalog-count').textContent = '已解锁 ' + unlocked.length + ' 种 · 已收录 ' + cards.length + ' 位角色';
        const filtered = cards.filter(card => [card.name, card.plant?.name].some(name =>
            name?.toLocaleLowerCase().includes(query)));
        const fragment = document.createDocumentFragment();
        for (const card of filtered) {
            const item = document.createElement('li');
            item.className = 'catalog-entry';
            const open = document.createElement('button');
            open.type = 'button';
            open.className = 'role-open';
            open.dataset.role = card.id;
            const role = document.createElement('strong'), notes = document.createElement('small');
            role.textContent = card.name;
            notes.textContent = [card.plant?.name, locations[card.spot?.scene]?.name ?? '未种下'].filter(Boolean).join(' · ');
            open.append(role, notes);
            open.onclick = () => openCard(card);
            const actions = document.createElement('div');
            let illustration = picture(card.plant);
            actions.className = 'catalog-actions';
            if (card.plant) {
                const label = card.spot ? '移栽' : '种下';
                const placeButton = placementButton(card, label);
                placeButton.textContent = label;
                const seed = placementButton(card, label);
                seed.classList.add('atlas-seed');
                seed.tabIndex = -1;
                seed.append(illustration);
                illustration = seed;
                const change = document.createElement('button');
                change.type = 'button';
                change.className = 'plant-change';
                change.textContent = '换植物';
                change.setAttribute('aria-label', '给 ' + card.name + ' 换植物');
                change.onclick = () => showCultivars(card);
                actions.append(placeButton, change);
            }
            item.append(illustration, open, actions);
            fragment.append(item);
        }
        if (!filtered.length) {
            const empty = document.createElement('li');
            empty.className = 'catalog-empty';
            empty.textContent = cards.length ? '没有找到匹配的角色。' : '导入角色卡后，图鉴会自动收录。';
            fragment.append(empty);
        }
        entries.replaceChildren(fragment);
        entries.scrollTop = top;
    }

    function placementButton(card, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'plant-place';
        button.setAttribute('aria-label', label + ' ' + card.name);
        button.onpointerdown = event => armDrag(event, card);
        button.onclick = event => {
            if (!event.defaultPrevented && !placing && !saving && !catalog.hidden) beginPlacement(card, false);
        };
        return button;
    }

    function renderCultivars() {
        if (!picking) return;
        const query = cultivarSearch.value.trim().toLocaleLowerCase();
        const options = unlocked.filter(plant => [plant.name, plant.category].some(text =>
            text?.toLocaleLowerCase().includes(query)));
        cultivarChoices.replaceChildren();
        for (const plant of options) {
            const control = document.createElement('button');
            control.type = 'button';
            control.dataset.plant = String(plant.id);
            control.setAttribute('aria-current', String(plant.id === picking.plant?.id));
            const name = document.createElement('strong');
            name.textContent = plant.name;
            control.append(picture(plant), name);
            control.onclick = () => {
                if (!picking || saving) return;
                const id = picking.id;
                cultivars.close();
                if (id) saveEdit(id, { plant: plant.id }, '书签和场景里的植物已一起换好。');
            };
            cultivarChoices.append(control);
        }
        if (!options.length) cultivarChoices.textContent = '没有找到匹配的已解锁品种。';
    }

    function showCultivars(card) {
        if (saving || placing || cultivars.open) return;
        picking = card;
        cultivarSearch.value = '';
        find('.cultivar-role').textContent = card.name + ' · ' + card.plant.name;
        renderCultivars();
        cultivars.showModal();
    }

    function drawPlacement(x, y) {
        const area = choices.getBoundingClientRect();
        const spot = viewportSpot(x, y, area);
        const size = ForestBotany.measure({ plant: placing.plant, spot }, area.height);
        const plant = placing.plant.model ?? placing.plant;
        ghost.style.width = size.width + 'px';
        ghost.style.height = size.height + 'px';
        ghost.style.translate = (-100 * plant.rootX) + '% ' + (-100 * plant.rootY) + '%';
        ghost.style.left = x + 'px';
        ghost.style.top = y + 'px';
        ghost.hidden = false;
    }

    function viewportSpot(x, y, area = choices.getBoundingClientRect()) {
        return {
            scene: place,
            x: Math.max(0, Math.min(1, (x - area.left) / area.width)),
            y: Math.max(0, Math.min(1, (y - area.top) / area.height)),
        };
    }

    function pointOnScene(x, y) {
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && view.contains(hit));
    }

    function populateTool(dragging) {
        tool.hidden = false;
        instruction.textContent = dragging ? '把植物拖到想种的位置' : '点画面任意位置种下；也可以先滑动看景。';
        travelTool.value = place;
    }

    function beginPlacement(card, dragging) {
        if (!card.plant || saving) return;
        placing = card;
        closeCatalog();
        closeMenu();
        closeSigns();
        flash('');
        document.body.classList.add('is-placing');
        ForestMedia.useImage(ghost, card.plant.model?.src, card.plant.src, card.plant.thumbnail);
        populateTool(dragging);
        if (!dragging) view.focus({ preventScroll: true });
        lockScene();
    }

    function stopPlacement(reopen) {
        placing = null;
        pointer = null;
        landing = null;
        tool.hidden = true;
        ghost.hidden = true;
        document.body.classList.remove('is-placing');
        lockScene();
        if (reopen) showCatalog();
    }

    function saveEdit(id, changes, success) {
        if (saving) return;
        const token = ++request;
        saving = { token, id, success, timer: setTimeout(() => {
            if (saving?.token !== token) return;
            saving = null;
            flash('暂时没有收到保存结果，打开图鉴可以重新同步。', 5100);
        }, 12000) };
        write('edit-garden', { request: token, id, ...changes });
    }

    function land(x, y) {
        if (!placing || !pointOnScene(x, y)) return;
        const id = placing.id;
        const spot = viewportSpot(x, y);
        stopPlacement(false);
        saveEdit(id, { spot }, '种好了。');
    }

    function armDrag(event, card) {
        if (!event.isPrimary || event.button !== 0 || !card.plant || saving) return;
        pointer = { id: event.pointerId, card, startX: event.clientX, startY: event.clientY, touch: event.pointerType === 'touch', drag: false };
    }

    addEventListener('pointermove', event => {
        if (pointer?.id !== event.pointerId) return;
        if (!pointer.drag) {
            if (Math.hypot(pointer.startX - event.clientX, pointer.startY - event.clientY) < (pointer.touch ? 16 : 9)) return;
            pointer.drag = true;
            // The button lives in the book we are about to close. Keep the gesture on the document.
            try { document.body.setPointerCapture(event.pointerId); } catch { /* Document listeners still track the drag. */ }
            beginPlacement(pointer.card, true);
        }
        drawPlacement(event.clientX, event.clientY);
    });

    addEventListener('pointerup', event => {
        if (pointer?.id !== event.pointerId) return;
        const dragged = pointer.drag;
        pointer = null;
        if (!dragged) return;
        ghost.hidden = true;
        if (placing && pointOnScene(event.clientX, event.clientY)) land(event.clientX, event.clientY);
        else populateTool(false);
    });

    addEventListener('pointercancel', event => {
        if (pointer?.id !== event.pointerId) return;
        if (pointer.drag) stopPlacement(true);
        pointer = null;
    });

    view.addEventListener('pointerdown', event => {
        if (placing && !pointer?.drag && event.isPrimary && event.button === 0) {
            landing = { id: event.pointerId, x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
        }
    });
    view.addEventListener('click', event => {
        if (!event.target.closest('.plant, .plant-nameplate')) clearApproach(260);
    });
    view.addEventListener('pointermove', event => {
        if (placing && !pointer?.drag && event.pointerType === 'mouse') drawPlacement(event.clientX, event.clientY);
    });
    view.addEventListener('pointerleave', () => { if (!pointer?.drag) ghost.hidden = true; });
    view.addEventListener('pointerup', event => {
        if (!placing || landing?.id !== event.pointerId) return;
        const valid = Math.hypot(event.clientX - landing.x, event.clientY - landing.y) < (landing.touch ? 18 : 10);
        landing = null;
        if (valid) land(event.clientX, event.clientY);
    });
    view.addEventListener('pointercancel', () => { landing = null; });
    view.addEventListener('keydown', event => {
        if (placing && event.key === 'Enter' && event.target === view) {
            event.preventDefault();
            land(innerWidth / 2, innerHeight / 2);
        }
    });

    find('.garden-cancel').onclick = () => stopPlacement(true);
    travelTool.onchange = () => {
        if (!placing || !Object.hasOwn(locations, travelTool.value)) return;
        showLocation(travelTool.value);
        populateTool(false);
        ghost.hidden = true;
        view.focus({ preventScroll: true });
    };

    search.oninput = renderCatalog;
    cultivarSearch.oninput = renderCultivars;
    find('.close-cultivar').onclick = () => cultivars.close();
    cultivars.addEventListener('close', () => { picking = null; });
    cultivars.addEventListener('click', event => {
        if (event.target === cultivars) {
            const rect = cultivars.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right ||
                event.clientY < rect.top || event.clientY > rect.bottom) cultivars.close();
        }
    });
    find('.close-catalog').onclick = () => closeCatalog(true);
    find('[data-close-weather]').onclick = () => {
        closeMenu();
        weatherProp.focus({ preventScroll: true });
    };
    const themeSwitches = find('.theme-switches');
    themeSwitches.addEventListener('click', event => {
        const control = event.target.closest('button[data-scenic-theme]');
        if (control) write('switch-theme', { id: control.dataset.scenicTheme });
    });
    startSelect.value = place;
    startSelect.onchange = () => {
        try {
            localStorage.setItem(startKey, startSelect.value);
            colophonStatus.textContent = '下次会直接进入' + locations[startSelect.value].name + '。';
        } catch {
            colophonStatus.textContent = '暂时无法保存入口场景。';
        }
    };

    bookProp.setAttribute('aria-controls', 'catalog');
    bookProp.setAttribute('aria-expanded', 'false');
    weatherProp.setAttribute('aria-controls', 'side');
    weatherProp.setAttribute('aria-expanded', 'false');
    station.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button || selecting || traveling) return;
        clearApproach(260);
        switch (button.dataset.field) {
            case 'catalog':
                if (catalog.hidden) showCatalog();
                else closeCatalog();
                return;
            case 'weather': {
                const open = side.hidden;
                closeCatalog();
                closeSigns();
                side.hidden = !open;
                weatherProp.setAttribute('aria-expanded', String(open));
                if (open) weatherPanel(find('#panel'));
                return;
            }
            case 'signs': {
                const open = signs.hidden;
                closeCatalog();
                closeMenu();
                signs.hidden = !open;
                signToggle.setAttribute('aria-expanded', String(open));
                return;
            }
        }
        if (button.dataset.drawer) {
            closeSigns();
            closeMenu();
            closeCatalog();
            write('drawer', { id: button.dataset.drawer });
        }
    });

    addEventListener('keydown', event => {
        if (event.key !== 'Escape' || cultivars.open) return;
        if (placing) stopPlacement(true);
        else if (!catalog.hidden) closeCatalog(true);
        else if (!side.hidden) closeMenu();
        else if (!signs.hidden) closeSigns();
        else clearApproach(260);
    });
    addEventListener('resize', () => {
        resizeHits();
        if (!approached) return;
        camera.approach(approached.button, plantScale, 0);
        placeNameplate(approached.button);
    });
    document.addEventListener('visibilitychange', syncMotion);
    if (reduced.addEventListener) reduced.addEventListener('change', syncMotion);
    else reduced.addListener(syncMotion);
    function sendWeather() {
        write('weather', { value: weather });
    }
    window.addEventListener('forest-weather-change', () => {
        syncMotion();
        sendWeather();
    });

    addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== parent) return;
        const message = event.data;
        switch (message?.forestTavern) {
            case 'set-weather':
                if (viewMode === 'reading') setForestWeather(message.value);
                return;
            case 'catalog':
                // Do not rebuild the buttons between a finger going down and its click.
                if (heldControl !== undefined) pendingCatalog = message;
                else {
                    pendingCatalog = message;
                    flushCatalog();
                }
                return;
            case 'theme-options':
                themeSwitches.replaceChildren(...message.themes.map(({ id, label }) => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'theme-switch';
                    button.dataset.scenicTheme = id;
                    button.textContent = '前往' + label;
                    return button;
                }));
                themeSwitches.hidden = !themeSwitches.childElementCount;
                return;
            case 'theme-failed':
                colophonStatus.textContent = message.text;
                return;
            case 'garden-saved':
            case 'garden-failed':
                if (saving?.token !== message.request) return;
                clearTimeout(saving.timer);
                flash(message.forestTavern === 'garden-saved' ? saving.success : message.text);
                saving = null;
                return;
            case 'failed':
                failOpening(message.text);
                return;
            case 'view': {
                const wasReading = viewMode === 'reading';
                viewMode = message.mode;
                document.body.classList.toggle('forest-book-backdrop', viewMode === 'reading');
                if (viewMode !== 'forest') {
                    clearTimeout(openingTimer);
                    ++journey;
                    traveling = false;
                    selecting = false;
                    clearApproach();
                    veil.classList.remove('covered');
                    closeCatalog();
                    closeMenu();
                    closeSigns();
                    if (placing) stopPlacement(false);
                } else if (wasReading) {
                    closeCatalog();
                    camera.reset(340);
                    readingPlant = null;
                }
                lockScene();
                syncMotion();
                return;
            }
        }
    });
    const paper = new Image();
    paper.onload = () => document.documentElement.style.setProperty('--forest-panel-paper', `url("${paper.src}")`);
    ForestMedia.useImage(paper, 'reading-paper-edge.png', 'reading-paper-edge.webp');
    showLocation(place);
    write('ready');
    sendWeather();
})();
