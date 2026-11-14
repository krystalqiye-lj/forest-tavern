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
let audio, ambience, music;

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
        audio = new Context();
    }
    if (audio.state !== 'running') await audio.resume();
}

function makeTrack() {
    const element = new Audio();
    element.preload = 'none';
    element.loop = true;
    const gain = audio.createGain();
    gain.gain.value = 0;
    audio.createMediaElementSource(element).connect(gain).connect(audio.destination);
    return { element, gain, stopTimer: 0 };
}

function glide(track, target) {
    const level = track.gain.gain;
    const now = audio.currentTime;
    if (level.cancelAndHoldAtTime) level.cancelAndHoldAtTime(now);
    else {
        const current = level.value;
        level.cancelScheduledValues(now);
        level.setValueAtTime(current, now);
    }
    level.linearRampToValueAtTime(target, now + .24);
}

function applyVolume() {
    if (!ambience?.enabled) return;
    const master = (ambientVolume / 100) ** 1.45;
    const atFalls = soundScene === 'falls';
    glide(ambience.recording, master * (atFalls ? fallsWeatherGains[weather] : weatherGains[weather]));
    glide(ambience.falls, master * (atFalls ? fallsGains[weather] : 0));
}

function cue(track, filename, playing) {
    clearTimeout(track.stopTimer);
    const player = track.element;
    if (playing) {
        if (player.getAttribute('src') !== filename) player.src = filename;
        return player.paused ? player.play() : Promise.resolve();
    }
    track.stopTimer = setTimeout(() => player.pause(), 290);
    return Promise.resolve();
}

async function playAmbience() {
    await initAudio();
    if (!document.getElementById('ambience')?.checked) return;
    if (!ambience) {
        ambience = { recording: makeTrack(), falls: makeTrack(), enabled: true };
    }
    ambience.enabled = true;
    const atFalls = soundScene === 'falls';
    applyVolume();
    await Promise.all([
        cue(ambience.recording, weatherTracks[weather], !atFalls || fallsWeatherGains[weather] > 0),
        cue(ambience.falls, 'waterfall-ambience.m4a', atFalls),
    ]);
}

function stopAmbience() {
    if (!ambience) return;
    ambience.enabled = false;
    for (const track of [ambience.recording, ambience.falls]) {
        glide(track, 0);
        cue(track, '', false);
    }
}

function reportAudioError(error) {
    if (error?.name === 'AbortError') return;
    stopAmbience();
    const input = document.getElementById('ambience');
    if (input) input.checked = false;
    const message = document.querySelector('output.weather-status');
    if (message) message.textContent = '暂时无法播放这段环境音';
}

function setWeatherScene(next) {
    if (soundScene !== next) {
        soundScene = next;
        if (ambience?.enabled) playAmbience().catch(reportAudioError);
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
    if (ambience?.enabled) playAmbience().catch(reportAudioError);
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
    sound.checked = Boolean(ambience?.enabled);
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
        if (sound.checked) playAmbience().catch(reportAudioError);
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
