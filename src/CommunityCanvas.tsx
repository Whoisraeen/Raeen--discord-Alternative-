import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Hash, Move, RotateCcw, Sparkles, Volume2 } from 'lucide-react';
import { Modal } from './components';
import PhantomInfiniteGallery, { type GalleryItem } from './ui/phantom-infinite-gallery';
import type { Channel } from './types';
import './community-canvas.css';

const artwork = [
  '/canvas/commons.svg',
  '/canvas/orbit.svg',
  '/canvas/build.svg',
  '/canvas/lounge.svg',
  '/canvas/coop.svg',
];

function Typewriter({ text }: { text: string }) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLength(text.length);
      return;
    }
    setLength(0);
    const timer = setInterval(
      () =>
        setLength((length) => {
          if (length >= text.length) clearInterval(timer);
          return Math.min(text.length, length + 2);
        }),
      18,
    );
    return () => clearInterval(timer);
  }, [text]);
  return (
    <p className="canvas-focus-description">
      <span className="canvas-sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, length)}
        {length < text.length && <i className="canvas-caret" />}
      </span>
    </p>
  );
}

export default function CommunityCanvas({
  channels,
  name,
  onOpen,
  onReturn,
}: {
  channels: Channel[];
  name: string;
  onOpen: (channel: Channel) => void;
  onReturn: () => void;
}) {
  const [focused, setFocused] = useState<GalleryItem | null>(null),
    [resetKey, setResetKey] = useState(0);
  const items = useMemo(
    () =>
      channels.map((channel, index) => ({
        id: channel.id,
        title: channel.kind === 'text' ? `#${channel.name}` : channel.name,
        src: artwork[index % artwork.length],
        label: channel.kind === 'text' ? 'TEXT CHANNEL' : 'VOICE CHANNEL',
        description:
          channel.topic ||
          (channel.kind === 'voice'
            ? 'A room for your next conversation.'
            : 'A little space to make your own.'),
      })),
    [channels],
  );
  const closeFocus = useCallback(() => setFocused(null), []);
  useEffect(() => {
    if (focused && !channels.some((channel) => channel.id === focused.id)) setFocused(null);
  }, [channels, focused]);

  return (
    <div className="community-canvas">
      <div className="canvas-world" inert={!!focused}>
        <PhantomInfiniteGallery items={items} onFocus={setFocused} paused={!!focused} resetKey={resetKey} />
        <header className="canvas-heading">
          <span className="canvas-kicker">
            <Sparkles size={12} />
            {name} / COMMUNITY CANVAS
          </span>
          <h1>
            A little space.
            <br />
            <em>Endless possibilities.</em>
          </h1>
          <p>
            Different rooms. The same good people.
            <br />
            Find a conversation to fall into.
          </p>
        </header>
        <button className="canvas-return" onClick={onReturn} aria-label="Back to conversation">
          <ArrowLeft size={14} />
          <span>Back to conversation</span>
        </button>
        <footer className="canvas-footer">
          <div className="canvas-instructions" id="canvas-instructions">
            <Move size={15} />
            <span>Drag to wander. Select a card to explore.</span>
            <button
              onClick={() => setResetKey((key) => key + 1)}
              aria-label="Recenter canvas"
              title="Recenter canvas"
            >
              <RotateCcw size={14} />
            </button>
          </div>
          <nav className="canvas-channel-links" aria-label="Canvas channels">
            {items.map((item, index) => (
              <button key={item.id} onClick={() => setFocused(item)} aria-label={`Preview ${item.title}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item.title}
              </button>
            ))}
          </nav>
          <div className="canvas-colophon">
            <span>{channels.length} ROOMS. ONE COMMUNITY.</span>
            <span>MADE FOR YOUR PEOPLE. ✳</span>
          </div>
        </footer>
      </div>
      {focused && (
        <Modal title={focused.title} eyebrow={focused.label} close={closeFocus}>
          <div
            className="canvas-focus-poster"
            onPointerMove={(event) => {
              if (event.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches)
                return;
              const rect = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty(
                '--tilt-x',
                `${(-(event.clientY - rect.top - rect.height / 2) / rect.height) * 7}deg`,
              );
              event.currentTarget.style.setProperty(
                '--tilt-y',
                `${((event.clientX - rect.left - rect.width / 2) / rect.width) * 7}deg`,
              );
            }}
            onPointerLeave={(event) => {
              event.currentTarget.style.setProperty('--tilt-x', '0deg');
              event.currentTarget.style.setProperty('--tilt-y', '0deg');
            }}
          >
            <img src={focused.src} alt="" />
            <span>
              {name} <span>✳</span>
            </span>
          </div>
          <Typewriter key={focused.id} text={focused.description} />
          <button
            className="primary-btn full-width"
            onClick={() => {
              const channel = channels.find((channel) => channel.id === focused.id);
              if (channel) onOpen(channel);
            }}
          >
            {focused.label === 'VOICE CHANNEL' ? <Volume2 size={16} /> : <Hash size={16} />}Open channel
            <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
