(() => {
    const ROWS = 24;
    const TAU = 2 * Math.PI;
    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

    function point(x, y, left, top, width, height, plant, t, strength, phase) {
        const heightAboveRoot = plant.rootY - y;
        const flexible = Math.max(0, heightAboveRoot);
        const distance = x - plant.rootX;
        const phaseAtHeight = t * TAU * plant.frequency - flexible * plant.lag + phase;
        const gust = Math.sin(phaseAtHeight) * .52
            + Math.sin(t * 1.76 - flexible * .7 + phase * .65) * .28 + .21;
        const sway = plant.bend * strength * gust;
        const displacement = sway * flexible ** plant.stiffness;
        const rotation = plant.stiffness * sway * flexible ** (plant.stiffness - 1);
        const lateral = Math.sin(t * 7.5 - flexible * 6.5 + distance * 11 + phase);
        const flutter = lateral * plant.flutter * strength * flexible ** 1.45;
        return {
            x: left + x * width + height * (displacement + flutter * (.17 + Math.abs(distance) * .72)),
            y: top + y * height + width * distance * rotation * .68 + height * flutter * .13,
        };
    }

    function triangle(ctx, image, source, target) {
        const [a, b, c] = source;
        const [A, B, C] = target;
        const ux = b.x - a.x, uy = b.y - a.y;
        const vx = c.x - a.x, vy = c.y - a.y;
        const inverse = 1 / (ux * vy - uy * vx);
        const p = ((B.x - A.x) * vy - (C.x - A.x) * uy) * inverse;
        const q = ((C.x - A.x) * ux - (B.x - A.x) * vx) * inverse;
        const r = ((B.y - A.y) * vy - (C.y - A.y) * uy) * inverse;
        const s = ((C.y - A.y) * ux - (B.y - A.y) * vx) * inverse;
        ctx.save();
        // A subpixel overlap between triangles avoids fine seams on high density screens.
        const cx = (A.x + B.x + C.x) / 3, cy = (A.y + B.y + C.y) / 3;
        ctx.beginPath();
        for (const [index, corner] of target.entries()) {
            const dx = corner.x - cx, dy = corner.y - cy;
            const scale = .58 / Math.hypot(dx, dy);
            const x = corner.x + dx * scale, y = corner.y + dy * scale;
            if (index) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.transform(p, r, q, s, A.x - p * a.x - q * a.y, A.y - r * a.x - s * a.y);
        ctx.drawImage(image, 0, 0);
        ctx.restore();
    }

    function render(ctx, image, plant, anchorX, anchorY, width, height, t, strength, phase = 0, rows = ROWS) {
        const left = anchorX - plant.rootX * width;
        const top = anchorY - plant.rootY * height;
        if (!strength) {
            ctx.drawImage(image, left, top, width, height);
            return;
        }
        const xCuts = [0, clamp(plant.rootX, .17, .83), 1];
        let previous = xCuts.map(x => point(x, 0, left, top, width, height, plant, t, strength, phase));
        for (let row = 0; row < rows; row++) {
            const y0 = row / rows, y1 = (row + 1) / rows;
            const next = xCuts.map(x => point(x, y1, left, top, width, height, plant, t, strength, phase));
            for (let col = 0; col < xCuts.length - 1; col++) {
                const x0 = image.width * xCuts[col], x1 = image.width * xCuts[col + 1];
                const a = { x: x0, y: image.height * y0 }, b = { x: x1, y: a.y };
                const c = { x: x0, y: image.height * y1 }, d = { x: x1, y: c.y };
                triangle(ctx, image, [a, b, c], [previous[col], previous[col + 1], next[col]]);
                triangle(ctx, image, [b, d, c], [previous[col + 1], next[col + 1], next[col]]);
            }
            previous = next;
        }
    }

    window.ForestPlantWind = { render, point };
})();
