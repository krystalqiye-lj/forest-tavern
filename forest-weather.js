const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const scene = document.querySelector('.scene');
const forestRain = createForestRain(document.querySelector('.weather-drops'), reduced);
const weatherNames = { breeze: '晴间微风', wind: '林间大风', rain: '小雨', storm: '雷雨' };
const weatherTracks = {
    breeze: 'forest-ambience.mp3',
    wind: 'forest-ambience.mp3',
    rain: 'rain-ambience.mp3',
    storm: 'storm-ambience.m4a?v=1.2.4',
};
// Match the sustained rain beds as well as thunder peaks; peak-only readings
// can make drizzle sound louder between thunderclaps, especially on phones.
const weatherGains = { breeze: .49, wind: .55, rain: .85, storm: .74 };
const fallsGains = { breeze: .112, wind: .105, rain: .091, storm: .064 };
const fallsWeatherGains = { breeze: 0, wind: .19, rain: .58, storm: .57 };
const volumePreference = 'forest-ambience-volume';
let weather = 'breeze';
let soundScene = 'oak';
let ambientVolume = 80;
let audio, music;
const ambience = { enabled: false, tracks: new Map(), request: null, status: '' };

try {
    const saved = localStorage.getItem(volumePreference);
    if (saved !== null && Number.isFinite(Number(saved))) {
        ambientVolume = Math.max(0, Math.min(100, Number(saved)));
    }
} catch { /* The slider still works when local storage is unavailable. */ }

async function initAudio() {
    if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) throw Error('AudioContext unavailable');
        try { audio = new Context({ sampleRate: 24000 }); }
        catch { audio = new Context(); }
    }
    if (audio.state !== 'running') await audio.resume();
}

async function loadRecording(filename, signal) {
    // A full fetch can play even when the browser cannot stream ranged media.
    const response = await fetch(filename, { signal });
    if (!response.ok) throw new Error('Recording unavailable');
    const bytes = await response.arrayBuffer();
    return new Promise((resolve, reject) => {
        audio.decodeAudioData(bytes, resolve, reject);
    });
}

function startRecording(buffer) {
    const node = audio.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, audio.currentTime);
    node.connect(gain).connect(audio.destination);
    node.onended = () => {
        node.disconnect();
        gain.disconnect();
    };
    node.start();
    return { node, gain };
}

function glide(track, target) {
    const level = track.gain.gain;
    const now = audio.currentTime;
    const previous = track.fade;
    const elapsed = previous ? Math.min(1, Math.max(0, (now - previous.at) / .24)) : 0;
    const current = previous ? previous.from + (previous.to - previous.from) * elapsed : 0;
    level.cancelScheduledValues(now);
    level.setValueAtTime(current, now);
    level.linearRampToValueAtTime(target, now + .24);
    track.fade = { at: now, from: current, to: target };
}

function desiredRecordings() {
    const atFalls = soundScene === 'falls';
    const background = atFalls ? fallsWeatherGains[weather] : weatherGains[weather];
    const result = new Map();
    if (background > 0) result.set(weatherTracks[weather], background);
    if (atFalls) result.set('waterfall-ambience.m4a', fallsGains[weather]);
    return result;
}

function applyVolume() {
    if (!ambience.enabled) return;
    const master = (ambientVolume / 100) ** 1.45;
    const levels = desiredRecordings();
    for (const [filename, track] of ambience.tracks) {
        glide(track, master * (levels.get(filename) ?? 0));
    }
}

function stopRecording(filename, track) {
    glide(track, 0);
    track.node.stop(audio.currentTime + .26);
    ambience.tracks.delete(filename);
}

function stopAmbience() {
    ambience.enabled = false;
    ambience.request?.abort();
    for (const [filename, track] of ambience.tracks) stopRecording(filename, track);
    soundStatus('');
}

function soundStatus(text) {
    ambience.status = text;
    const output = document.querySelector('output.weather-status');
    if (output) output.textContent = text;
}

async function playAmbience() {
    ambience.enabled = true;
    ambience.request?.abort();
    const controller = new AbortController();
    ambience.request = controller;
    const signal = controller.signal;
    const wanted = desiredRecordings();
    const timeout = setTimeout(() => {
        if (signal.aborted) return;
        stopAmbience();
        const input = document.getElementById('ambience');
        if (input) input.checked = false;
        soundStatus('环境音载入超时，可点一下重试。');
    }, 12000);
    try {
        // Resume in the trusted tap, before fetching or decoding a recording.
        await initAudio();
        if (signal.aborted) return;
        const missing = [...wanted.keys()].filter(filename => !ambience.tracks.has(filename));
        if (missing.length) soundStatus('正在载入环境音…');
        await Promise.all(missing.map(async filename => {
            const buffer = await loadRecording(filename, signal);
            if (!signal.aborted) ambience.tracks.set(filename, startRecording(buffer));
        }));
        if (signal.aborted) return;
        for (const [filename, track] of ambience.tracks) {
            if (!wanted.has(filename)) stopRecording(filename, track);
        }
        applyVolume();
        soundStatus('');
    } catch (error) {
        if (signal.aborted) return;
        stopAmbience();
        const input = document.getElementById('ambience');
        if (input) input.checked = false;
        soundStatus(error.name === 'NotAllowedError' ? '请再点一次环境音以开始播放。' : '环境音未能加载，可点一下重试。');
    } finally {
        clearTimeout(timeout);
    }
}

function setWeatherScene(next) {
    if (soundScene !== next) {
        soundScene = next;
        if (ambience.enabled) void playAmbience();
    }
    forestRain.set(next, weather);
}

function setForestWeather(next) {
    if (!Object.hasOwn(weatherNames, next) || next === weather) return;
    weather = next;
    scene.dataset.weather = weather;
    for (const button of document.querySelectorAll('[data-weather-option]')) {
        button.setAttribute('aria-pressed', String(weather === button.dataset.weatherOption));
    }
    forestRain.set(soundScene, weather);
    window.dispatchEvent(new Event('forest-weather-change'));
    if (ambience.enabled) void playAmbience();
}

function playPhrase() {
    const melodies = {
        breeze: [60,64,67,71,67], wind: [57,64,69,72,64],
        rain: [62,65,69,72,65], storm: [50,57,62,65,57],
    };
    melodies[weather].forEach((note, index) => {
        const oscillator = audio.createOscillator();
        const envelope = audio.createGain();
        const at = audio.currentTime + index * .64;
        oscillator.type = 'sine';
        oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
        envelope.gain.setValueAtTime(.001, at);
        envelope.gain.exponentialRampToValueAtTime(.047, at + .12);
        envelope.gain.exponentialRampToValueAtTime(.001, at + 1.7);
        oscillator.connect(envelope).connect(music.gain);
        oscillator.start(at);
        oscillator.stop(at + 1.8);
    });
}

function weatherPanel(panel) {
    panel.innerHTML = `
        <div class="weather-options" role="group" aria-label="切换天气"></div>
        <label class="weather-switch"><input type="checkbox" id="ambience"> 环境音</label>
        <label class="weather-volume">
            <span>环境音量</span><output for="ambient-volume" class="weather-volume-value"></output>
            <input type="range" id="ambient-volume" min="0" max="100" step="1">
        </label>
        <label class="weather-switch"><input type="checkbox" id="music"> 背景音乐</label>
        <output class="weather-status" aria-live="polite"></output>
    `;
    if (soundScene === 'falls') {
        const credit = document.createElement('small');
        credit.className = 'waterfall-credit';
        credit.textContent = '瀑布实录 · Benzband · CC BY-SA 3.0';
        panel.append(credit);
    }
    const options = panel.querySelector('.weather-options');
    const sound = panel.querySelector('#ambience');
    const musicToggle = panel.querySelector('#music');
    const slider = panel.querySelector('#ambient-volume');
    const readout = panel.querySelector('.weather-volume-value');
    slider.value = String(ambientVolume);
    readout.value = ambientVolume + '%';
    slider.setAttribute('aria-valuetext', readout.value);
    sound.checked = ambience.enabled;
    panel.querySelector('.weather-status').textContent = ambience.status;
    musicToggle.checked = Boolean(music);
    for (const [value, label] of Object.entries(weatherNames)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.weatherOption = value;
        button.textContent = label;
        button.setAttribute('aria-pressed', String(weather === value));
        options.append(button);
    }
    options.addEventListener('click', event => {
        const option = event.target.closest('[data-weather-option]');
        if (option) setForestWeather(option.dataset.weatherOption);
    });
    slider.addEventListener('input', () => {
        ambientVolume = slider.valueAsNumber;
        readout.value = ambientVolume + '%';
        slider.setAttribute('aria-valuetext', readout.value);
        applyVolume();
        try { localStorage.setItem(volumePreference, String(ambientVolume)); } catch { /* Browser storage is optional. */ }
    });
    sound.addEventListener('change', () => {
        if (sound.checked) void playAmbience();
        else stopAmbience();
    });
    musicToggle.addEventListener('change', async () => {
        try {
            if (musicToggle.checked) await initAudio();
            if (musicToggle.checked && !music) {
                const gain = audio.createGain();
                gain.connect(audio.destination);
                music = { gain, interval: setInterval(playPhrase, 5100) };
                playPhrase();
            } else if (!musicToggle.checked && music) {
                clearInterval(music.interval);
                music.gain.disconnect();
                music = null;
            }
        } catch {
            musicToggle.checked = false;
            panel.querySelector('.weather-status').textContent = '此浏览器无法播放背景音乐';
        }
    });
}
