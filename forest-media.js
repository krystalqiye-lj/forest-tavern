(() => {
    function useImage(image, ...sources) {
        const urls = [...new Set(sources.filter(Boolean))];
        const next = () => {
            const url = urls.shift();
            if (!url) { image.onerror = null; return; }
            image.src = url;
        };
        image.onerror = next;
        next();
    }

    function sceneMotion(still, video) {
        let place, file, preload, timeout, objectUrl;
        let triedWholeFile = false, triedDirect = false, enabled = false;
        // Fetch the compact loop in one request on phones where media range
        // requests through embedded browsers or proxies can be unreliable.
        const wholeFileFirst = matchMedia('(pointer: coarse)').matches || /Android/i.test(navigator.userAgent);
        const reveal = () => {
            if (!enabled || video.paused || video.readyState < 2) return;
            clearTimeout(timeout);
            video.classList.add('is-playing');
        };
        video.addEventListener('playing', reveal);
        video.addEventListener('error', () => {
            video.classList.remove('is-playing');
            fallback();
        });

        function play() {
            const activeFile = file;
            video.play().then(reveal).catch(error => {
                if (file === activeFile && error.name !== 'AbortError' && error.name !== 'NotAllowedError') fallback();
            });
        }

        function fallback() {
            if (!enabled || !file || preload) return;
            if (!triedWholeFile) void playWholeFile();
            else if (!triedDirect) playDirect();
        }

        function playDirect() {
            triedDirect = true;
            video.src = file;
            play();
            if (!triedWholeFile) {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    if (enabled && video.readyState < 2) fallback();
                }, 4200);
            }
        }

        async function playWholeFile() {
            triedWholeFile = true;
            clearTimeout(timeout);
            const controller = new AbortController();
            preload = controller;
            const deadline = setTimeout(() => controller.abort(), 12000);
            let loaded = false;
            try {
                const response = await fetch(file, { signal: controller.signal });
                if (!response.ok) return;
                const bytes = await response.arrayBuffer();
                if (controller.signal.aborted) return;
                objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
                video.src = objectUrl;
                loaded = true;
                if (enabled) play();
            } catch {
                // The independent JPEG stays visible if the video cannot play.
            } finally {
                clearTimeout(deadline);
                if (preload === controller) {
                    preload = undefined;
                    if (!loaded) fallback();
                }
            }
        }

        return {
            update(next, { paused, rate }) {
                enabled = !paused;
                if (place !== next) {
                    place = next;
                    still.src = `${place}-path.jpg${place === 'falls' ? '?v=1.3.1' : ''}`;
                    file = `${place}-breeze.mp4?v=${place === 'falls' ? '1.3.1' : '1.1.1'}`;
                    clearTimeout(timeout);
                    preload?.abort();
                    preload = undefined;
                    video.classList.remove('is-playing');
                    video.pause();
                    if (video.hasAttribute('src')) {
                        video.removeAttribute('src');
                        video.load();
                    }
                    if (objectUrl) URL.revokeObjectURL(objectUrl);
                    objectUrl = undefined;
                    triedWholeFile = false;
                    triedDirect = false;
                }
                if (paused) {
                    clearTimeout(timeout);
                    video.pause();
                    video.classList.remove('is-playing');
                    return;
                }
                video.playbackRate = rate;
                if (preload) return;
                if (!video.hasAttribute('src')) {
                    if (!triedWholeFile && wholeFileFirst) void playWholeFile();
                    else if (!triedDirect) playDirect();
                    return;
                }
                play();
                if (triedDirect && !triedWholeFile && video.readyState < 2) {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        if (enabled && video.readyState < 2) fallback();
                    }, 4200);
                }
            },
        };
    }

    window.ForestMedia = { useImage, sceneMotion };
})();
