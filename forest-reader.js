const fonts = {
    round: '林间圆体',
    wenkai: '林间文楷',
    serif: '林间宋体',
    sans: '林间黑体',
};
const preference = 'forest-reading-v1';

function readPreferences() {
    try {
        return JSON.parse(localStorage.getItem(preference)) || {};
    } catch {
        return {};
    }
}

export function installForestReader(book, openDrawer, setWeather) {
    const toolbar = book.querySelector('.forest-reader-tools');
    const panel = book.querySelector('.forest-reader-panel');
    const font = panel.querySelector('#forest-reader-font');
    const size = panel.querySelector('#forest-reader-size');
    const spacing = panel.querySelector('#forest-reader-spacing');
    const weather = panel.querySelector('#forest-reader-weather');
    const sizeOutput = panel.querySelector('output[for="forest-reader-size"]');
    const spacingOutput = panel.querySelector('output[for="forest-reader-spacing"]');
    const page = book.closest('#sheld');
    const defaultSize = matchMedia('(max-width: 660px)').matches ? 17 : 18;
    const saved = readPreferences();
    const clamp = (value, min, max, fallback) => typeof value === 'number' && Number.isFinite(value)
        ? Math.min(max, Math.max(min, value)) : fallback;
    let currentPanel;

    function applyFont(save = false) {
        page.style.setProperty('--forest-reading-font', `"${fonts[font.value]}"`);
        page.style.setProperty('--forest-reading-size', `${size.valueAsNumber}px`);
        page.style.setProperty('--forest-reading-line', spacing.value);
        sizeOutput.value = `${size.value} px`;
        spacingOutput.value = `${Number(spacing.value).toFixed(1)} 倍`;
        if (!save) return;
        try {
            localStorage.setItem(preference, JSON.stringify({
                font: font.value, size: size.valueAsNumber, line: spacing.valueAsNumber,
            }));
        } catch { /* The current page still reflects the controls. */ }
    }

    font.value = Object.hasOwn(fonts, saved.font) ? saved.font : 'round';
    size.value = clamp(saved.size, 14, 26, defaultSize);
    spacing.value = clamp(saved.line, 1.4, 2.4, 1.8);
    applyFont();
    for (const input of [font, size, spacing]) input.addEventListener('input', () => applyFont(true));
    panel.querySelector('.forest-reader-reset').addEventListener('click', () => {
        font.value = 'round';
        size.value = defaultSize;
        spacing.value = 1.8;
        applyFont(true);
    });
    weather.addEventListener('change', () => setWeather(weather.value));

    function close(restoreFocus = false) {
        if (!currentPanel) return false;
        const control = toolbar.querySelector(`[data-reader-panel="${currentPanel}"]`);
        control.setAttribute('aria-expanded', 'false');
        panel.hidden = true;
        if (restoreFocus) control.focus();
        currentPanel = undefined;
        return true;
    }

    toolbar.addEventListener('click', event => {
        const next = event.target.closest('[data-reader-panel]')?.dataset.readerPanel;
        if (!next) return;
        const same = currentPanel === next;
        close();
        if (same) return;
        currentPanel = next;
        for (const section of panel.querySelectorAll('[data-reader-content]')) {
            section.hidden = section.dataset.readerContent !== next;
        }
        toolbar.querySelector(`[data-reader-panel="${next}"]`).setAttribute('aria-expanded', 'true');
        panel.hidden = false;
    });

    panel.addEventListener('click', event => {
        const drawer = event.target.closest('[data-reader-drawer]')?.dataset.readerDrawer;
        if (!drawer) return;
        close();
        openDrawer(drawer);
    });
    document.addEventListener('click', event => {
        if (!panel.contains(event.target) && !toolbar.contains(event.target)) close();
    });

    return {
        close,
        updateWeather(value) {
            if (![...weather.options].some(option => option.value === value)) return;
            weather.value = value;
            page.dataset.forestReadingWeather = value;
        },
    };
}

export function installForestMessageTools(chat) {
    let active;

    function close(restoreFocus = false) {
        if (!active) return false;
        active.removeAttribute('data-forest-message-tools');
        const button = active.querySelector('.forest-message-tools');
        button?.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button?.focus();
        active = undefined;
        return true;
    }

    function addControl(message) {
        const header = message.querySelector(':scope > .mes_block > .ch_name');
        if (!header?.querySelector('.mes_buttons') || header.querySelector('.forest-message-tools')) return;
        const name = header.querySelector('.name_text');
        if (name && message.getAttribute('is_user') === 'true') {
            const signature = document.createElement('span');
            signature.className = 'forest-user-signature';
            signature.textContent = '你';
            name.after(signature);
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'forest-message-tools';
        button.setAttribute('aria-label', '消息操作');
        button.setAttribute('aria-expanded', 'false');
        button.textContent = '⋯';
        header.append(button);
    }

    for (const item of chat.querySelectorAll(':scope > .mes')) addControl(item);
    new MutationObserver(records => {
        for (const record of records) {
            for (const item of record.addedNodes) {
                if (item instanceof HTMLElement && item.matches('.mes')) addControl(item);
            }
        }
        if (active && !active.isConnected) close();
    }).observe(chat, { childList: true });

    chat.addEventListener('click', event => {
        const button = event.target.closest('.forest-message-tools');
        if (!button) return;
        const message = button.closest('.mes');
        const alreadyOpen = message === active;
        close();
        if (alreadyOpen) return;
        active = message;
        message.setAttribute('data-forest-message-tools', '');
        button.setAttribute('aria-expanded', 'true');
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.forest-message-tools, .mes_buttons, .mes_edit_buttons')) close();
    });

    return close;
}
