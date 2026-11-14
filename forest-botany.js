(() => {
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const horizon = { oak: .50, creek: .45, lake: .60, falls: .73 };
    const lighting = {
        oak: [[.40,.49,.34,.28],[.60,.66,.28,.28],[.80,.75,.37,.20]],
        creek: [[.39,.44,.29,.38],[.52,.59,.27,.22],[.83,.87,.42,.24]],
        lake: [[.33,.64,.29,.29],[.51,.75,.31,.24]],
        falls: [[.58,.66,.34,.34],[.47,.90,.35,.31]],
    };

    function measure(card, sceneHeight) {
        const { plant, spot } = card;
        const { width, height } = plant.model ?? plant;
        // Match the original path artwork: about one eighth of the scene
        // at the middle of the path, and a bit taller in the foreground.
        const foreground = clamp((spot.y - .43) / .43, 0, 1);
        const lowGrowth = plant.habit === 'low' || plant.habit === 'stout';
        const tall = sceneHeight * (.08 + .076 * foreground) * (lowGrowth ? .92 : 1);
        return { height: tall, width: tall * (width / height) };
    }

    function lightAt(spot, weather) {
        const depth = clamp((spot.y - .43) / .52, 0, 1);
        const isWet = weather === 'rain' || weather === 'storm';
        const shaft = Math.max(...(lighting[spot.scene] ?? []).map(([x, y, span, strength]) =>
            strength * Math.exp(-(((spot.x - x) / span) ** 2 + ((spot.y - y) / .24) ** 2))), 0);
        const sunshine = isWet ? shaft * .34 : shaft;
        return {
            depth,
            intensity: .61 + sunshine + depth * .045,
            saturation: (isWet ? .63 : .69) + sunshine * .32,
            warmth: isWet ? 0 : 4 + sunshine * 19,
            rooted: spot.y >= (horizon[spot.scene] ?? .52),
        };
    }

    function shadeSprite(image, { intensity, saturation, warmth, depth, rooted }, model, size) {
        const sprite = document.createElement('canvas');
        sprite.width = Math.max(10, Math.round(size.width));
        sprite.height = Math.max(10, Math.round(size.height));
        const shade = sprite.getContext('2d', { willReadFrequently: true });
        shade.imageSmoothingQuality = 'high';
        shade.drawImage(image, 0, 0, sprite.width, sprite.height);
        const frame = shade.getImageData(0, 0, sprite.width, sprite.height);
        const haze = 8 * (1 - depth);
        for (let y = 0; y < sprite.height; y++) {
            const v = y / sprite.height;
            const lowerStem = clamp((v - .68) / .33, 0, 1);
            for (let x = 0; x < sprite.width; x++) {
                const i = (y * sprite.width + x) * 4;
                if (!frame.data[i + 3]) continue;
                const r = frame.data[i], g = frame.data[i + 1], b = frame.data[i + 2];
                const luminance = .23 * r + .67 * g + .1 * b;
                const force = intensity * (1 - .30 * lowerStem) * (.97 + .058 * (1 - x / sprite.width));
                const hue = g > r * .92 && g > b * 1.1 ? .72 : 1;
                frame.data[i] = (luminance + (r - luminance) * saturation * hue) * force + warmth + haze;
                frame.data[i + 1] = (luminance + (g - luminance) * saturation * hue) * force + warmth * .59 + haze;
                frame.data[i + 2] = (luminance + (b - luminance) * saturation * hue) * force + haze * .77;
                if (rooted && v > model.rootY - .15) {
                    // Irregular feathering lets grass or dirt show through the last few pixels of stem.
                    const edge = model.rootY - .10 + .034 * Math.sin(x * 1.43) + .022 * Math.cos(x * .65);
                    frame.data[i + 3] *= clamp((edge + .09 - v) / .11, 0, 1);
                }
            }
        }
        shade.putImageData(frame, 0, 0);
        return sprite;
    }

    function groundShadow(ctx, x, y, width, height, strength) {
        ctx.save();
        ctx.translate(x + width * .072, y - height * .021);
        ctx.scale(Math.max(3, width * .34), Math.max(1.6, height * .084));
        const shadow = ctx.createRadialGradient(-.12, -.08, 0, 0, 0, 1);
        shadow.addColorStop(0, 'rgba(25, 28, 15, ' + strength + ')');
        shadow.addColorStop(.48, 'rgba(25, 28, 15, ' + strength * .49 + ')');
        shadow.addColorStop(1, '#20271800');
        ctx.fillStyle = shadow;
        ctx.fillRect(-1.1, -1.1, 2.2, 2.2);
        ctx.restore();
    }

    function createForestBotany(canvas, reduced, { wind, visible, weather }) {
        const context = canvas.getContext('2d', { alpha: true });
        const pictures = new Map();
        const shades = new Map();
        let current = [];
        let request = 0, last = -Infinity, needsDraw = true;

        function invalidate() {
            needsDraw = true;
            if (!request && !document.hidden) request = requestAnimationFrame(frame);
        }

        function prepare(plant) {
            let entry = pictures.get(plant.id);
            if (entry) return entry;
            const img = new Image();
            const model = plant.model ?? plant;
            entry = { img, model };
            img.decoding = 'async';
            img.onload = invalidate;
            img.onerror = () => {
                img.onerror = null;
                entry.model = plant;
                img.src = plant.src;
            };
            img.src = model.src;
            pictures.set(plant.id, entry);
            return entry;
        }

        function setCards(cards) {
            current = cards.slice().sort((a, b) => a.spot.y - b.spot.y || a.id.localeCompare(b.id));
            shades.clear();
            for (const { plant } of current) prepare(plant);
            invalidate();
        }

        function frame(time) {
            request = 0;
            if (document.hidden || !visible()) return;
            const interval = current.length > 28 ? 55 : 39;
            if ((needsDraw || (!reduced.matches && time - last >= interval)) && canvas.offsetWidth && canvas.offsetHeight) {
                draw(time);
                last = time;
                needsDraw = false;
            }
            if (!reduced.matches && current.length) request = requestAnimationFrame(frame);
        }

        function draw(time) {
            const layerWidth = canvas.offsetWidth, layerHeight = canvas.offsetHeight;
            const resolution = Math.min(devicePixelRatio, 1.35, 1900 / layerWidth);
            const w = Math.round(layerWidth * resolution), h = Math.round(layerHeight * resolution);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                shades.clear();
            }
            const bounds = canvas.getBoundingClientRect();
            const scale = bounds.width / layerWidth;
            const left = -bounds.left / scale;
            const right = (innerWidth - bounds.left) / scale;
            const top = -bounds.top / scale;
            const bottom = (innerHeight - bounds.top) / scale;
            context.setTransform(w / layerWidth, 0, 0, h / layerHeight, 0, 0);
            context.clearRect(0, 0, layerWidth, layerHeight);
            const sway = reduced.matches ? 0 : wind();
            const mesh = current.length > 35 ? 5 : current.length > 15 ? 7 : 10;
            const state = weather();
            for (const [index, card] of current.entries()) {
                const x = card.spot.x * layerWidth, y = card.spot.y * layerHeight;
                const size = measure(card, layerHeight);
                if (x + size.width < left || x - size.width > right ||
                    y + size.height < top || y - size.height > bottom) continue;
                const { img, model } = prepare(card.plant);
                if (!img.complete || !img.naturalWidth) continue;
                const material = lightAt(card.spot, state);
                let shaded = shades.get(card.id);
                if (!shaded || shaded.weather !== state) {
                    // Keep enough pixels for the close-up, without sharpening the distant foliage.
                    const quality = Math.min(2.4, 1.43 + material.depth * .65);
                    const pixels = { width: size.width * quality, height: size.height * quality };
                    shaded = {
                        weather: state,
                        sprite: shadeSprite(img, material, model, pixels, layerHeight),
                        windPlant: { ...card.plant, rootX: model.rootX, rootY: model.rootY },
                    };
                    shades.set(card.id, shaded);
                }
                if (material.rooted) groundShadow(context, x, y, size.width, size.height, .26 + material.depth * .23);
                ForestPlantWind.render(context, shaded.sprite, shaded.windPlant, x, y, size.width, size.height,
                    time / 1000, sway, index * 1.62 + card.plant.id * .31, mesh);
            }
        }

        window.addEventListener('resize', invalidate);
        document.addEventListener('visibilitychange', invalidate);
        reduced.addEventListener('change', invalidate);
        return { setCards, invalidate };
    }

    window.ForestBotany = { create: createForestBotany, measure };
})();
