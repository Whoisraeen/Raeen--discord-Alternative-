/*!
 * @license MIT
 * Adapted from Cue Foundations' Phantom Infinite Gallery (cue129).
 * Copyright (c) 2026 Alok Srivastava (Cue), MIT licensed.
 * https://kit.cuedesign.space/components/phantom-infinite-gallery
 * See public/THIRD_PARTY_NOTICES.md for the license and Raeen adaptation notes.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { useEffect, useRef } from 'react';

export type GalleryItem = {
  id: string;
  title: string;
  src: string;
  label: string;
  description: string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// The original cylindrical projection, scoped to the gallery's own viewport.
function arcTransform(centerX: number, viewportWidth: number, reducedMotion: boolean) {
  if (reducedMotion || !viewportWidth) return { z: 0, yaw: 0, edge: 0 };
  const maxAngle = ((22 * Math.PI) / 180) * 0.6;
  const dx = (centerX - viewportWidth / 2) / (viewportWidth / 2);
  const angle = dx * maxAngle;
  const radius = viewportWidth / (2 * Math.sin(maxAngle));
  return {
    z: -radius * (Math.cos(angle) - 1),
    yaw: (-angle * 180) / Math.PI,
    edge: Math.min(1, Math.abs(dx)),
  };
}

export default function PhantomInfiniteGallery({
  items,
  onFocus,
  paused = false,
  resetKey = 0,
}: {
  items: GalleryItem[];
  onFocus: (item: GalleryItem) => void;
  paused?: boolean;
  resetKey?: number;
}) {
  const stageRef = useRef<HTMLDivElement>(null),
    gridRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef(onFocus),
    pauseRef = useRef(paused),
    wakeRef = useRef<() => void>(() => {});
  focusRef.current = onFocus;
  pauseRef.current = paused;
  useEffect(() => {
    wakeRef.current();
  }, [paused]);

  useEffect(() => {
    const stage = stageRef.current,
      grid = gridRef.current;
    if (!stage || !grid || !items.length) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches,
      width = 0,
      height = 0,
      cellSize = 220;
    let offset = { x: 0, y: 0 },
      target = { x: 0, y: 0 },
      velocity = { x: 0, y: 0 };
    let parallax = { x: 0, y: 0 },
      targetParallax = { x: 0, y: 0 };
    let pointer: {
      id: number;
      x: number;
      y: number;
      lastX: number;
      lastY: number;
      lastTime: number;
      originX: number;
      originY: number;
      dragged: boolean;
    } | null = null;
    let frame = 0,
      lastTime = performance.now(),
      alive = true,
      visible = !document.hidden;
    const cells = new Map<string, HTMLButtonElement>();

    function render() {
      if (!stage || !grid || !width || !height) return;
      const gap = 18,
        startX = Math.floor((-offset.x - parallax.x) / cellSize) - 1;
      const startY = Math.floor((-offset.y - parallax.y) / cellSize) - 1;
      const columns = Math.ceil(width / cellSize) + 3,
        rows = Math.ceil(height / cellSize) + 3;
      const active = new Set<string>();
      for (let y = startY; y < startY + rows; y++) {
        for (let x = startX; x < startX + columns; x++) {
          const key = `${x}:${y}`,
            itemIndex = (((x + y * 3) % items.length) + items.length) % items.length;
          const item = items[itemIndex];
          active.add(key);
          let cell = cells.get(key);
          if (!cell) {
            cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'phantom-cell';
            cell.tabIndex = -1;
            cell.dataset.itemId = item.id;
            cell.setAttribute('aria-label', `Preview ${item.title}`);
            const image = document.createElement('img');
            image.src = item.src;
            image.alt = '';
            image.draggable = false;
            image.decoding = 'async';
            const meta = document.createElement('span');
            meta.className = 'phantom-meta';
            const title = document.createElement('b'),
              label = document.createElement('span');
            title.textContent = item.title;
            label.textContent = item.label;
            meta.append(title, label);
            cell.append(image, meta);
            grid.append(cell);
            cells.set(key, cell);
          }
          const left = x * cellSize + offset.x + parallax.x,
            top = y * cellSize + offset.y + parallax.y;
          const arc = arcTransform(left + cellSize / 2, width, reduced);
          cell.style.width = `${cellSize - gap}px`;
          cell.style.height = `${cellSize - gap}px`;
          cell.style.transform = `translate3d(${left}px,${top}px,${arc.z}px) rotateY(${arc.yaw}deg) scale(${1 - arc.edge * arc.edge * 0.12})`;
          cell.style.opacity = String(1 - arc.edge * 0.25);
        }
      }
      for (const [key, cell] of cells)
        if (!active.has(key)) {
          cell.remove();
          cells.delete(key);
        }
    }

    function tick(time: number) {
      frame = 0;
      if (!alive || !visible || pauseRef.current) return;
      const dt = Math.min(0.05, Math.max(0.001, (time - lastTime) / 1000));
      lastTime = time;
      if (!pointer) {
        const friction = Math.pow(0.91, dt * 60);
        velocity.x *= friction;
        velocity.y *= friction;
        if (Math.hypot(velocity.x, velocity.y) < 2 || reduced) velocity = { x: 0, y: 0 };
        target.x += velocity.x * dt;
        target.y += velocity.y * dt;
        const ease = reduced ? 1 : 1 - Math.pow(0.78, dt * 60);
        offset.x += (target.x - offset.x) * ease;
        offset.y += (target.y - offset.y) * ease;
      }
      parallax.x += (targetParallax.x - parallax.x) * 0.18;
      parallax.y += (targetParallax.y - parallax.y) * 0.18;
      const moving =
        Math.hypot(velocity.x, velocity.y) > 0 ||
        Math.hypot(target.x - offset.x, target.y - offset.y) > 0.1 ||
        Math.hypot(targetParallax.x - parallax.x, targetParallax.y - parallax.y) > 0.1;
      if (!moving && !pointer) {
        offset = { ...target };
        parallax = { ...targetParallax };
      }
      render();
      if (moving) frame = requestAnimationFrame(tick);
    }
    function wake() {
      if (alive && visible && !pauseRef.current && !frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(tick);
      }
    }
    wakeRef.current = wake;
    const resize = () => {
      const next = stage.getBoundingClientRect();
      if (!width) {
        offset = { x: next.width / 2 - 110, y: next.height / 2 - 110 };
        target = { ...offset };
      }
      width = next.width;
      height = next.height;
      cellSize = width < 500 ? 176 : 224;
      render();
      wake();
    };
    const local = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const down = (event: PointerEvent) => {
      if (pauseRef.current || (event.pointerType === 'mouse' && event.button !== 0) || pointer) return;
      stage.focus({ preventScroll: true });
      stage.setPointerCapture(event.pointerId);
      const point = local(event);
      pointer = {
        id: event.pointerId,
        x: point.x,
        y: point.y,
        lastX: point.x,
        lastY: point.y,
        lastTime: performance.now(),
        originX: offset.x,
        originY: offset.y,
        dragged: false,
      };
      target = { ...offset };
      velocity = { x: 0, y: 0 };
    };
    const move = (event: PointerEvent) => {
      const point = local(event);
      stage.style.setProperty('--spot-x', `${point.x}px`);
      stage.style.setProperty('--spot-y', `${point.y}px`);
      if (!pointer) {
        targetParallax = reduced
          ? { x: 0, y: 0 }
          : { x: (width / 2 - point.x) * 0.025, y: (height / 2 - point.y) * 0.025 };
        wake();
        return;
      }
      if (event.pointerId !== pointer.id) return;
      const dx = point.x - pointer.x,
        dy = point.y - pointer.y;
      if (Math.hypot(dx, dy) > 5) {
        pointer.dragged = true;
        stage.classList.add('dragging');
      }
      if (pointer.dragged) {
        const time = performance.now(),
          dt = Math.max(0.008, (time - pointer.lastTime) / 1000);
        velocity = {
          x: clamp((point.x - pointer.lastX) / dt, -2200, 2200),
          y: clamp((point.y - pointer.lastY) / dt, -2200, 2200),
        };
        pointer.lastX = point.x;
        pointer.lastY = point.y;
        pointer.lastTime = time;
        offset = { x: pointer.originX + dx, y: pointer.originY + dy };
        target = { ...offset };
        render();
      }
    };
    const up = (event: PointerEvent) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const click = !pointer.dragged && event.type === 'pointerup';
      if (performance.now() - pointer.lastTime > 100 || reduced) velocity = { x: 0, y: 0 };
      pointer = null;
      stage.classList.remove('dragging');
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      if (click) {
        const hit = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>('.phantom-cell');
        const item = items.find((item) => item.id === hit?.dataset.itemId);
        if (hit && stage.contains(hit) && item) focusRef.current(item);
      }
      wake();
    };
    const leave = () => {
      targetParallax = { x: 0, y: 0 };
      wake();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.target !== stage || pauseRef.current) return;
      const directions: Record<string, [number, number]> = {
        ArrowLeft: [1, 0],
        ArrowRight: [-1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      };
      const delta = directions[event.key];
      if (delta) {
        event.preventDefault();
        velocity = { x: 0, y: 0 };
        target.x += delta[0] * cellSize;
        target.y += delta[1] * cellSize;
        wake();
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const rect = stage.getBoundingClientRect();
        const hit = document
          .elementFromPoint(rect.left + width / 2, rect.top + height / 2)
          ?.closest<HTMLElement>('.phantom-cell');
        const item = items.find((item) => item.id === hit?.dataset.itemId);
        if (item) focusRef.current(item);
      }
    };
    const visibility = () => {
      visible = !document.hidden;
      if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
        velocity = { x: 0, y: 0 };
      } else wake();
    };
    const motion = () => {
      reduced = media.matches;
      velocity = { x: 0, y: 0 };
      targetParallax = { x: 0, y: 0 };
      wake();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('lostpointercapture', up);
    stage.addEventListener('pointerleave', leave);
    stage.addEventListener('keydown', keydown);
    document.addEventListener('visibilitychange', visibility);
    media.addEventListener('change', motion);
    resize();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      wakeRef.current = () => {};
      stage.removeEventListener('pointerdown', down);
      stage.removeEventListener('pointermove', move);
      stage.removeEventListener('pointerup', up);
      stage.removeEventListener('pointercancel', up);
      stage.removeEventListener('lostpointercapture', up);
      stage.removeEventListener('pointerleave', leave);
      stage.removeEventListener('keydown', keydown);
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', motion);
      grid.replaceChildren();
    };
  }, [items, resetKey]);

  return (
    <div
      ref={stageRef}
      className="phantom-stage"
      role="group"
      aria-label="Draggable channel gallery"
      aria-describedby="canvas-instructions"
      tabIndex={0}
      inert={paused}
    >
      <div ref={gridRef} className="phantom-grid" />
      <div className="phantom-spotlight" aria-hidden="true" />
      <div className="phantom-vignette" aria-hidden="true" />
    </div>
  );
}
