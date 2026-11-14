(() => {
    const narrow = matchMedia('(max-width: 800px)');
    const clamp = (value, min, max) => min <= max
        ? Math.min(max, Math.max(min, value))
        : (min + max) / 2;

    window.createForestCamera = function (view, camera, layer, reduced, { canPan, onPan }) {
        const positions = new Map();
        let scene = 'oak';
        let animation;
        let gesture;
        let ignoreClickUntil = 0;

        function bounds(scale, x, y) {
            const cx = view.clientWidth / 2;
            const cy = view.clientHeight / 2;
            const left = layer.offsetLeft - layer.offsetWidth / 2;
            const anchor = narrow.matches || matchMedia('(max-aspect-ratio: 4/9)').matches ? .5 : .55;
            const top = layer.offsetTop - layer.offsetHeight * anchor;
            return {
                x: clamp(x, cx - (left + layer.offsetWidth - cx) * scale, -cx - (left - cx) * scale),
                y: clamp(y, cy - (top + layer.offsetHeight - cy) * scale, -cy - (top - cy) * scale),
            };
        }

        function restingX() {
            if (!narrow.matches) return 0;
            const defaultPosition = { oak: .49, creek: .415, lake: .50, falls: .38 }[scene] ?? .5;
            const center = positions.get(scene) ?? defaultPosition;
            const left = layer.offsetLeft - layer.offsetWidth / 2;
            return bounds(1, view.clientWidth / 2 - left - layer.offsetWidth * center, 0).x;
        }

        function move(target, duration) {
            const animate = duration > 0 && !reduced.matches;
            const current = animate ? getComputedStyle(camera).transform : '';
            animation?.cancel();
            camera.style.transform = target;
            if (!animate) return Promise.resolve();
            const pending = camera.animate([{ transform: current }, { transform: target }], {
                duration, easing: 'cubic-bezier(.32,.12,.22,1)',
            });
            animation = pending;
            return pending.finished.catch(() => {});
        }

        function reset(duration = 0) {
            const x = restingX();
            return move(x ? `translateX(${x}px)` : 'none', duration);
        }

        function approach(plant, scale = 1.85, duration = 850) {
            const cx = view.clientWidth / 2;
            const cy = view.clientHeight / 2;
            const left = layer.offsetLeft - layer.offsetWidth / 2;
            const anchor = narrow.matches || matchMedia('(max-aspect-ratio: 4/9)').matches ? .5 : .55;
            const top = layer.offsetTop - layer.offsetHeight * anchor;
            const desiredX = -(left + plant.offsetLeft - cx) * scale;
            const desiredY = view.clientHeight * .54 - cy - (top + plant.offsetTop - cy) * scale;
            const { x, y } = bounds(scale, desiredX, desiredY);
            return move(`translate(${x}px,${y}px) scale(${scale})`, duration);
        }

        function panTo(offset) {
            const x = bounds(1, offset, 0).x;
            const left = layer.offsetLeft - layer.offsetWidth / 2;
            if (layer.offsetWidth > view.clientWidth) {
                positions.set(scene, (view.clientWidth / 2 - left - x) / layer.offsetWidth);
            }
            reset();
        }

        view.addEventListener('pointerdown', event => {
            if (!narrow.matches || !canPan() || !event.isPrimary || event.button !== 0 ||
                event.defaultPrevented || layer.offsetWidth <= view.clientWidth + 2) return;
            // A fresh pointer down is a new tap or pan. Only suppress the click
            // synthesized for the previous captured swipe.
            ignoreClickUntil = 0;
            const visible = new DOMMatrixReadOnly(getComputedStyle(camera).transform);
            const offset = visible.a > 1.001 ? restingX() : bounds(1, visible.m41, 0).x;
            gesture = { id: event.pointerId, startX: event.clientX, startY: event.clientY, offset, panning: false };
        });
        view.addEventListener('pointermove', event => {
            if (gesture?.id !== event.pointerId) return;
            const dx = event.clientX - gesture.startX;
            const dy = event.clientY - gesture.startY;
            if (!gesture.panning) {
                if (Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(dy) * 1.12) return;
                gesture.panning = true;
                view.setPointerCapture(event.pointerId);
                onPan();
            }
            panTo(gesture.offset + dx);
        });
        function finish(event) {
            if (gesture?.id !== event.pointerId) return;
            if (gesture.panning) ignoreClickUntil = performance.now() + 280;
            gesture = undefined;
        }
        view.addEventListener('pointerup', finish);
        view.addEventListener('pointercancel', finish);
        view.addEventListener('lostpointercapture', event => {
            if (event.target === view) finish(event);
        });
        view.addEventListener('click', event => {
            if (event.detail && performance.now() < ignoreClickUntil) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
        view.addEventListener('keydown', event => {
            if (!narrow.matches || !canPan() || !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
                layer.offsetWidth <= view.clientWidth + 2) return;
            event.preventDefault();
            panTo(restingX() + (event.key === 'ArrowLeft' ? 1 : -1) * view.clientWidth * .28);
            onPan();
        });
        window.addEventListener('resize', () => {
            if (canPan()) reset();
        });
        return { approach, reset, setScene(next) { scene = next; } };
    };
})();
