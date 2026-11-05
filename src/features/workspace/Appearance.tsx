import { useState } from 'react';
import * as E from './appearance-ui';
import { Ambience, effects } from './Ambience';
import { Panel, type WorkspaceProps, useLocal } from './shared';
import { defaultAppearance, type AppearanceSettings } from './appearance-settings';
type Revision = { id: string; at: string; value: AppearanceSettings };
export default function Appearance(p: WorkspaceProps) {
  const [prefs, setPrefs] = useLocal<AppearanceSettings>(
      `raeen-appearance:${p.boot.node.id}`,
      defaultAppearance,
    ),
    [revisions, setRevisions] = useLocal<Revision[]>(`raeen-appearance-history:${p.boot.node.id}`, []);
  const [saved, setSaved] = useState(false),
    [intro, setIntro] = useState(false);
  const update = (next: Partial<AppearanceSettings>) => {
    setPrefs({ ...prefs, ...next });
    setSaved(false);
  };
  const save = () => {
    setRevisions(
      [{ id: crypto.randomUUID(), at: new Date().toISOString(), value: prefs }, ...revisions].slice(0, 8),
    );
    setSaved(true);
  };
  return (
    <div className={`hub-page ${prefs.compact ? 'hub-compact' : ''}`}>
      <div className="hub-title-row">
        <div>
          <span className="hub-eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>A space that feels like you.</h1>
          <p>Personal settings for this device. Ambient effects also appear on your community overview.</p>
        </div>
        <E.MorphingButton
          status={saved ? 'success' : 'idle'}
          idleText="Save a restore point"
          successText="Restore point saved"
          onClick={save}
        />
      </div>
      <div className="hub-grid main-side">
        <Panel
          title="Your community backdrop"
          note="Effects run only while visible. Reduced-motion preferences show static artwork."
        >
          <div className="hub-ambience-preview">
            <Ambience effect={prefs.enabled ? prefs.effect : 'None'} intensity={prefs.intensity} />
            <div className="hub-ambient-caption">
              <E.GlitchText text={p.boot.node.name} trigger="hover" intensity="low" />
              <E.TextScrambleDecoder text="a place for your people" trigger="hover" />
            </div>
          </div>
          <div className="hub-action-row">
            <E.GooeyMenu
              options={effects}
              value={prefs.effect}
              width={260}
              onSelect={(effect) => update({ effect, enabled: true })}
            />
            <E.LiquidToggle
              value={prefs.enabled}
              onChange={(enabled) => update({ enabled })}
              offLabel="Enable ambience"
              onLabel="Disable ambience"
              accentColor="#b5f0c8"
            />
          </div>
        </Panel>
        <Panel title="Find your balance">
          <E.TorqueDial
            label="Ambient intensity"
            value={prefs.intensity}
            min={5}
            max={80}
            step={5}
            onChange={(intensity) => update({ intensity })}
            size={135}
            unit="%"
          />
          <E.StretchSwitch
            checked={prefs.compact}
            onChange={(compact) => update({ compact })}
            label="Compact workspace spacing"
            description="Applies to the appearance workspace."
          />
          <E.Button variant="outline" onClick={p.onSettings}>
            Chat density & accent settings
          </E.Button>
        </Panel>
      </div>
      <Panel title="A small personal touch">
        <div className="hub-grid two">
          <div className="hub-type-card">
            <E.ScrollVelocityText
              text="good things grow together."
              scrollContainerRef={{ current: document.getElementById('hub-scroll') }}
              intensity={0.2}
              maxScale={1.03}
              maxLetterSpacing={0.02}
              fadeStart={1}
            />
            <p>Scroll to give your community’s motto a little breathing room.</p>
          </div>
          <E.GravityParticleBurst className="hub-burst" label="Send some good energy" particleCount={24}>
            <span>✳</span>
          </E.GravityParticleBurst>
        </div>
      </Panel>
      <Panel title="A familiar welcome">
        <p className="hub-description">
          Replay a short welcome, or head back to the conversation with a flourish.
        </p>
        {intro ? (
          <E.IntroLoader
            fullScreen={false}
            greetings={[`Hello, ${p.boot.user.name}.`, 'Your people.', 'Your place.']}
            intervalMs={700}
            onComplete={() => setIntro(false)}
          />
        ) : (
          <E.TypewriterButton onClick={() => setIntro(true)} charDuration={35}>
            Replay your welcome
          </E.TypewriterButton>
        )}
        <E.CarSmokePageTransition smokeDensity="low" carSize="sm" onTransitionComplete={p.onReturn}>
          <E.Button variant="ghost">Cruise back to chat →</E.Button>
        </E.CarSmokePageTransition>
      </Panel>
      <Panel
        title="Appearance restore points"
        note="Save a point above before experimenting. Only your local appearance preferences are restored."
      >
        <E.RecoveryLedger
          entries={revisions.map((r) => ({
            id: r.id,
            timestamp: r.at,
            action: 'Appearance saved',
            description: `${r.value.effect} · intensity ${r.value.intensity}%`,
            author: p.boot.user.name,
            restorable: true,
            details: { preview: JSON.stringify(r.value, null, 2) },
          }))}
          currentEntryId={revisions.find((r) => JSON.stringify(r.value) === JSON.stringify(prefs))?.id}
          onRestore={(id) => {
            const r = revisions.find((x) => x.id === id);
            if (r) {
              setPrefs(r.value);
              p.notify('Appearance restored on this device.');
            }
          }}
        />
        {!revisions.length && <p className="hub-empty">No restore points yet. Save your first one above.</p>}
      </Panel>
    </div>
  );
}
