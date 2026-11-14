(() => {
    // These polygons follow the existing water and the hollows in the path.
    const surfaces = {
        oak: [
            [[.482,.755],[.526,.747],[.567,.761],[.570,.775],[.518,.790],[.478,.776]],
            [[.414,.872],[.511,.864],[.532,.879],[.517,.899],[.426,.904],[.401,.893]],
        ],
        creek: [
            [[.563,.441],[.631,.455],[.684,.488],[.769,.502],[.799,.537],[.730,.527],[.663,.497],[.591,.477]],
            [[.697,.659],[.798,.638],[.921,.648],[1,.687],[1,1],[.725,1],[.758,.898],[.706,.802],[.667,.755]],
            [[.443,.698],[.500,.676],[.554,.681],[.553,.728],[.526,.765],[.480,.757]],
        ],
        lake: [
            [[.152,.453],[.374,.442],[.747,.445],[1,.447],[1,.622],[.924,.628],[.868,.657],[.778,.634],
                [.707,.668],[.615,.654],[.552,.632],[.447,.593],[.369,.577],[.298,.555],[.216,.515]],
        ],
        falls: [
            [[.293,.766],[.389,.748],[.470,.731],[.635,.729],[.792,.744],[.963,.748],[1,.753],
                [1,.829],[.928,.830],[.836,.882],[.690,.876],[.532,.854],[.450,.834],[.381,.817],[.317,.791]],
        ],
    };

    const beams = {
        oak: [.29,.39,.25],
        creek: [.46,.43,.29],
        lake: [.39,.40,.36],
        falls: [.55,.44,.32],
    };
    const TAU = Math.PI * 2;
    const clamp = (v, low, high) => Math.min(high, Math.max(low, v));
    const modulo = (x, period) => (x % period + period) % period;

    function randomFor(key) {
        let seed = 2166136261;
        for (const letter of key) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619);
        return () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
    }

    function trace(ctx, polygon, width, height) {
        ctx.moveTo(polygon[0][0] * width, polygon[0][1] * height);
        for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i][0] * width, polygon[i][1] * height);
        ctx.closePath();
    }

    function contains(poly, x, y) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const [a, b] = poly[i], [c, d] = poly[j];
            if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
        }
        return inside;
    }

    function makeImpacts(place, rand) {
        return surfaces[place].flatMap(poly => {
            const xs = poly.map(([x]) => x), ys = poly.map(([, y]) => y);
            const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
            const impacts = [];
            const count = Math.ceil(11 + (right - left) * (bottom - top) * 321);
            for (let n = 0; n < count * 4 && impacts.length < count; n++) {
                const x = left + rand() * (right - left), y = top + rand() * (bottom - top);
                if (!contains(poly, x, y)) continue;
                impacts.push({ x, y, phase: rand() * 7, period: .88 + rand() * 2.7, radius: .7 + rand() * .67 });
            }
            return impacts;
        });
    }

    function wetPath(ctx, polygon, width, height, index) {
        const xs = polygon.map(([x]) => x), ys = polygon.map(([, y]) => y);
        const left = Math.min(...xs), right = Math.max(...xs);
        const top = Math.min(...ys), bottom = Math.max(...ys);
        const x = (left + right) * width / 2, y = (top + bottom) * height / 2;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale((right - left) * width / 2, (bottom - top) * height / 2);
        const reflection = ctx.createRadialGradient(-.13, -.16, 0, 0, 0, 1.02);
        reflection.addColorStop(0, index ? '#afc3ae49' : '#b3c8b23d');
        reflection.addColorStop(.6, '#9aafa525');
        reflection.addColorStop(1, '#b8ccbc00');
        ctx.fillStyle = reflection;
        ctx.fillRect(-1.15, -1.15, 2.3, 2.3);
        ctx.restore();
    }

    window.createForestRain = function (canvas, reduced) {
        const ctx = canvas.getContext('2d');
        let mode = 'breeze', place = 'oak', frame = 0, strikes = 8, since = 0, last = 0;
        let drops = [], impacts = [];
        const narrow = matchMedia('(max-width: 800px)');

        function drawFallers(time, visible, hard, width, height, scale, left, right) {
            const [beamX, beamY, beamWidth] = beams[place];
            for (const drop of drops) {
                const elapsed = time + drop.phase;
                const cycle = Math.floor(elapsed / drop.period);
                const progress = modulo(elapsed, drop.period) / drop.period;
                const depth = drop.depth;
                const drift = hard ? .14 + depth * .045 : .043 + depth * .023;
                const x = modulo(drop.x + cycle * drop.salt + progress * drift, 1);
                const y = progress * 1.11 - .075;

                if (x * width < left || x * width > right || y < -.035 || y > 1.06) continue;
                const light = Math.exp(-(((x - beamX) / beamWidth) ** 2 + ((y - beamY) / .43) ** 2));
                const farUnderCanopy = depth < .37 && y < .21 ? .33 : 1;
                const variation = .77 + .23 * Math.sin(time * 4 + drop.phase * 6);
                const alpha = (.10 + light * .34 + depth * .23) * farUnderCanopy * variation *
                    (hard ? 1.05 : .95) * visible;
                const size = (.008 + depth * .035) * height * drop.length;
                const thickness = clamp((.35 + depth ** 2 * 1.35) / (1 + (scale - 1) * .23), .32, 1.64);
                const ox = x * width, oy = y * height;
                const dx = (hard ? .22 : .092) * size * (.7 + drop.length * .3);
                const glint = ctx.createLinearGradient(ox, oy, ox - dx, oy - size);
                glint.addColorStop(0, '#e5eee900');
                glint.addColorStop(.19, `rgba(226, 234, 221, ${alpha})`);
                glint.addColorStop(.48, `rgba(207, 224, 219, ${alpha * .50})`);
                glint.addColorStop(1, '#c5d9d100');
                ctx.strokeStyle = glint;
                ctx.lineWidth = thickness;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(ox - dx, oy - size);
                ctx.stroke();
            }
        }

        function drawImpacts(time, hard, width, height, left, right) {
            ctx.save();
            ctx.beginPath();
            for (const region of surfaces[place]) trace(ctx, region, width, height);
            ctx.clip();
            if (place === 'oak') {
                surfaces.oak.forEach((region, index) => wetPath(ctx, region, width, height, index));
            }
            const horizon = place === 'falls' ? .71 : .44;
            for (const impact of impacts) {
                const x = impact.x * width, y = impact.y * height;
                if (x < left || x > right) continue;
                const timeSince = modulo(time + impact.phase, impact.period * (hard ? .68 : 1));
                if (timeSince > .97) continue;
                const depth = clamp((impact.y - horizon) / .43, 0, 1);
                const radius = (.55 + timeSince * (3.5 + 14.5 * depth)) * impact.radius * height / 860;
                const flatness = .19 + depth * .19;
                const tx = 2.83 + impact.phase * .07;
                const intensity = (hard ? .55 : .42) * (1 - timeSince) ** 1.5;
                ctx.lineWidth = .55 + depth * .34;
                ctx.strokeStyle = `rgba(24, 39, 38, ${intensity * .87})`;
                ctx.beginPath();
                ctx.ellipse(x, y + .66, radius, radius * flatness, 0, tx, tx + TAU);
                ctx.stroke();
                ctx.strokeStyle = `rgba(205, 223, 213, ${intensity})`;
                ctx.beginPath();
                ctx.ellipse(x, y, radius, radius * flatness, 0, tx, tx + 4.25);
                ctx.stroke();
                if (timeSince > .18 && depth > .28) {
                    const inner = radius * (.42 + .20 * timeSince);
                    ctx.strokeStyle = `rgba(212, 225, 215, ${intensity * .44})`;
                    ctx.beginPath();
                    ctx.ellipse(x, y, inner, inner * flatness, 0, tx + .37, tx + 4.5);
                    ctx.stroke();
                }
                if (timeSince < .12 && depth > .32) {
                    ctx.fillStyle = `rgba(230, 242, 231, ${(.12 - timeSince) * 4})`;
                    ctx.fillRect(x, y - (1.5 + 3 * depth) * Math.sin(timeSince * 25), 1.1, 1.3);
                }
            }
            ctx.restore();
        }

        function draw(timestamp) {
            frame = 0;
            if (document.hidden || (mode !== 'rain' && mode !== 'storm')) return;
            if (timestamp - last < 31 && !reduced.matches) {
                frame = requestAnimationFrame(draw);
                return;
            }
            last = timestamp;
            const width = canvas.offsetWidth, height = canvas.offsetHeight;
            if (!width || !height) return;
            const density = Math.min(devicePixelRatio, 1.25, 1760 / width);
            if (canvas.width !== Math.round(width * density) || canvas.height !== Math.round(height * density)) {
                canvas.width = Math.round(width * density);
                canvas.height = Math.round(height * density);
            }
            ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
            ctx.clearRect(0, 0, width, height);
            const elapsed = (timestamp - since) / 1000;
            const time = reduced.matches ? .48 : elapsed;
            const storm = mode === 'storm';
            const bounds = canvas.getBoundingClientRect();
            const scale = bounds.width / width;
            const left = (-bounds.left - 36) / scale, right = (innerWidth - bounds.left + 36) / scale;
            if (storm && !reduced.matches) {
                if (elapsed > strikes + 1.3) strikes = elapsed + 7 + Math.random() * 10;
                const after = elapsed - strikes;
                if (after >= 0 && after < .52) {
                    const pulse = .13 * Math.exp(-after * 18) + .054 * Math.exp(-(((after - .27) / .062) ** 2));
                    ctx.fillStyle = `rgba(185, 202, 218, ${pulse})`;
                    ctx.fillRect(0, 0, width, height);
                }
            }
            drawImpacts(time, storm, width, height, left, right);
            drawFallers(time, reduced.matches ? .64 : 1, storm, width, height, scale, left, right);
            if (!reduced.matches) frame = requestAnimationFrame(draw);
        }

        function start() {
            cancelAnimationFrame(frame);
            frame = 0;
            if (mode === 'rain' || mode === 'storm') {
                if (!document.hidden) frame = requestAnimationFrame(draw);
            } else {
                ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
            }
        }

        function set(next, condition) {
            if (next === place && condition === mode) return;
            mode = condition;
            place = next;
            since = performance.now();
            strikes = 4.5 + Math.random() * 6.4;
            const rand = randomFor(place + mode);
            const count = mode === 'storm' ? (narrow.matches ? 560 : 470) : (narrow.matches ? 351 : 275);
            drops = Array.from({ length: count }, () => ({
                x: rand(), depth: rand() ** 1.6, length: .52 + rand() * .99,
                phase: rand() * 5, period: .42 + rand() * .72, salt: .05 + rand() * .43,
            }));
            if (surfaces[place]) impacts = makeImpacts(place, rand);
            start();
        }

        addEventListener('resize', start);
        document.addEventListener('visibilitychange', start);
        reduced.addEventListener('change', start);
        return { set };
    };
})();
