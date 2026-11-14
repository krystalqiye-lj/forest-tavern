const zhouWidget = '#zxw-pixel-sphere';
const knownWidgets = `#divine8-root, #divine8-screen, #divine-st-hub, #xhs-float-btn, #xhs-fab, #ins-persistent-audio-v2, ${zhouWidget}`;
const excluded = '#sheld, #top-settings-holder, #forest-tavern-frame, #options, #toast-container, dialog.popup, #shadow_popup, #character_popup, .select2-container, .ui-widget-overlay';

export function installForestChatWidgets() {
    const floatingPanels = document.getElementById('movingDivs');
    const persistent = new WeakSet([
        ...document.documentElement.children, ...document.body.children, ...(floatingPanels?.children ?? []),
    ]);
    const owners = new WeakMap();
    const hiddenDisplays = new WeakMap();
    const detachedPlayers = new WeakMap();
    let lastCard, currentCard, loading = false;

    function stopMedia(root) {
        if (root instanceof HTMLMediaElement && !root.paused) root.pause();
        for (const player of root.querySelectorAll('audio, video')) {
            if (!player.paused) player.pause();
        }
        const frames = root instanceof HTMLIFrameElement ? [root] : root.querySelectorAll('iframe');
        for (const frame of frames) {
            if (frame.contentDocument) stopMedia(frame.contentDocument);
        }
        if (root instanceof Element && root.shadowRoot) stopMedia(root.shadowRoot);
    }

    function hideInlineDisplay(element) {
        if (getComputedStyle(element).display === 'none') return;
        const { style } = element;
        hiddenDisplays.set(element, [style.getPropertyValue('display'), style.getPropertyPriority('display')]);
        style.setProperty('display', 'none', 'important');
    }

    const widgetStyles = new MutationObserver(records => {
        for (const { target } of records) {
            if (target.hasAttribute('data-forest-widget-inactive')) hideInlineDisplay(target);
        }
    });

    function widgetIsActive(element) {
        return element.isConnected && owners.get(element) === currentCard &&
            document.body.classList.contains('forest-tavern-reading');
    }

    function syncDetachedPlayer(widget, visible) {
        // This card creates an Audio object without inserting it into the document.
        if (!widget.matches(zhouWidget)) return;
        const player = window._wiz_shared_audio_stream;
        if (!(player instanceof HTMLMediaElement)) return;
        if (!detachedPlayers.has(player)) {
            player.addEventListener('play', () => {
                if (!widgetIsActive(detachedPlayers.get(player))) player.pause();
            });
        }
        detachedPlayers.set(player, widget);
        if (!visible && !player.paused) player.pause();
    }

    function showWidget(element) {
        const visible = widgetIsActive(element);
        element.toggleAttribute('data-forest-widget-inactive', !visible);
        syncDetachedPlayer(element, visible);
        if (visible) {
            const previous = hiddenDisplays.get(element);
            if (previous) {
                if (element.style.getPropertyValue('display') === 'none') element.style.setProperty('display', ...previous);
                hiddenDisplays.delete(element);
            }
            return;
        }
        // Some card scripts give a launcher an inline !important display, above the theme's CSS.
        hideInlineDisplay(element);
        stopMedia(element);
        if (element instanceof HTMLDialogElement && element.open) element.close();
        for (const dialog of element.querySelectorAll('dialog[open]')) dialog.close();
    }

    function trackWidget(element) {
        if (!owners.has(element)) {
            owners.set(element, lastCard);
            element.setAttribute('data-forest-chat-widget', '');
            widgetStyles.observe(element, { attributes: true, attributeFilter: ['style'] });
        }
        showWidget(element);
    }

    function track(element) {
        if (!(element instanceof HTMLElement) || element.closest(excluded)) return;
        if (element.matches('style, link, script, template')) return;
        const external = element.closest(knownWidgets);
        if (external) {
            trackWidget(external);
            return;
        }
        let root = element;
        while (root.parentElement && root.parentElement !== document.documentElement &&
            root.parentElement !== document.body && root.parentElement !== floatingPanels) {
            if (persistent.has(root.parentElement)) break;
            root = root.parentElement;
        }
        if (persistent.has(root) || root.closest('[data-forest-chat-widget]')) return;
        const candidates = [root, ...root.querySelectorAll('audio, iframe, [style], [id], [class]')];
        if (!root.shadowRoot && !candidates.some(node =>
            node.matches('audio, iframe, dialog') || getComputedStyle(node).position === 'fixed')) return;
        trackWidget(root);
    }

    const pageWidgets = new MutationObserver(records => {
        if (!lastCard) return;
        const inForest = document.body.classList.contains('forest-tavern-active');
        for (const record of records) {
            if (record.target instanceof Element && record.target.closest(excluded)) continue;
            if (record.target instanceof HTMLDialogElement && record.target.open) {
                track(record.target);
                if (record.target.closest('[data-forest-widget-inactive]')) record.target.close();
            }
            for (const node of record.addedNodes) {
                track(node);
                if (inForest && !loading && node instanceof Element) {
                    const widget = node.closest('[data-forest-chat-widget]');
                    if (widget) stopMedia(widget);
                }
            }
        }
    });
    pageWidgets.observe(document.body, { childList: true, attributes: true, attributeFilter: ['open'], subtree: true });
    pageWidgets.observe(document.documentElement, { childList: true });

    document.addEventListener('play', event => {
        if (!(event.target instanceof HTMLMediaElement)) return;
        if (event.target.closest('[data-forest-widget-inactive]') || document.body.classList.contains('forest-tavern-active') &&
            event.target.closest(`${knownWidgets}, [data-forest-chat-widget], #sheld`)) event.target.pause();
    }, true);

    return {
        open(card) {
            lastCard = currentCard = card;
            loading = true;
            for (const element of document.querySelectorAll('[data-forest-chat-widget]')) showWidget(element);
        },
        finish() {
            loading = false;
            for (const element of document.querySelectorAll('[data-forest-chat-widget]')) showWidget(element);
        },
        close() {
            loading = false;
            if (!lastCard) return;
            currentCard = undefined;
            for (const element of document.querySelectorAll(knownWidgets)) trackWidget(element);
            for (const element of document.querySelectorAll('[data-forest-chat-widget]')) showWidget(element);
            const chat = document.querySelector('#sheld #chat');
            if (chat) stopMedia(chat);
        },
    };
}
