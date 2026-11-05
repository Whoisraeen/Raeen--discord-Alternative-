import { useState } from 'react';
import { BookOpen, Trash2 } from 'lucide-react';
import { importIdentity } from '../../identity';
import * as E from './guide-ui';
import { Panel, art, type WorkspaceProps, useLocal } from './shared';
export default function Guide(p: WorkspaceProps) {
  const [tour, setTour] = useState(false),
    [passphrase, setPassphrase] = useState(''),
    [verified, setVerified] = useState(false),
    [checking, setChecking] = useState(false),
    [code, setCode] = useState('');
  const [checked, setChecked] = useLocal(`raeen-backup-checklist:${p.boot.user.id}`, false),
    [note, setNote] = useLocal(`raeen-private-note:${p.boot.node.id}`, '');
  const [draft, setDraft] = useState(note);
  const checksum = String([...p.boot.user.public_key].reduce((sum, c) => sum * 31 + c.charCodeAt(0), 0) >>> 0)
    .slice(-6)
    .padStart(6, '0');
  const cards = [
    {
      id: 'identity',
      title: 'Your identity goes with you.',
      description: 'One signing key can join multiple nodes. Export an encrypted backup in Settings.',
      image: art[2],
      imageAlt: 'Abstract orbital community artwork',
    },
    {
      id: 'community',
      title: 'The community owns its node.',
      description: 'Messages live with the node operator. Choose an operator you trust.',
      image: art[0],
      imageAlt: 'Abstract community garden artwork',
    },
    {
      id: 'voice',
      title: 'A room for real conversation.',
      description: 'LiveKit powers voice when configured by your node operator.',
      image: art[1],
      imageAlt: 'Abstract shapes representing people building together',
    },
  ];
  const sections = [
    { id: 'guide-start', label: 'Start here' },
    { id: 'guide-keys', label: 'Your identity' },
    { id: 'guide-backup', label: 'Backup check' },
    { id: 'guide-help', label: 'Questions' },
  ];
  const jump = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        block: 'start',
      });
  return (
    <div className="hub-page">
      <div className="hub-title-row">
        <div>
          <span className="hub-eyebrow">A FIELD GUIDE TO YOUR NEW HOME</span>
          <h1>Good things start with a little curiosity.</h1>
          <p>A few things to know about your community and portable identity.</p>
        </div>
        <E.Button onClick={() => setTour(true)}>
          <BookOpen size={15} /> Take a short tour
        </E.Button>
      </div>
      <E.ScrollProgressNav
        sections={sections}
        mode="inline"
        containerRef={{ current: document.getElementById('hub-scroll') }}
        onSectionClick={jump}
      />
      <E.MorphingMegaMenu
        items={[
          {
            id: 'identity',
            label: 'Your identity',
            content: (
              <div className="hub-menu-content">
                <p>Your signing key is stored on this device.</p>
                <E.Button onClick={() => jump('guide-keys')}>Inspect public identity</E.Button>
                <E.Button variant="ghost" onClick={p.onSettings}>
                  Export encrypted backup
                </E.Button>
              </div>
            ),
          },
          {
            id: 'community',
            label: 'Your community',
            content: (
              <div className="hub-menu-content">
                <p>Bring your people into {p.boot.node.name}.</p>
                <E.Button onClick={p.onInvite}>Open invite</E.Button>
                <E.Button variant="ghost" onClick={p.onReturn}>
                  Return to chat
                </E.Button>
              </div>
            ),
          },
        ]}
      />
      <section id="guide-start">
        <E.StoryCards
          cards={cards}
          title="A quieter corner of the internet"
          subtitle="Three things worth knowing."
          autoPlay={false}
          enableWheelScroll={false}
        />
      </section>
      <Panel title="Your community, connected">
        <E.CircularOrbit
          title={p.boot.node.name}
          radius={120}
          speed={0.00006}
          items={p.boot.channels
            .slice(0, 5)
            .map((c, i) => ({ id: c.id, src: art[i % art.length], alt: c.name, size: 60 }))}
        />
        <E.DepthCorridor
          enableParallax={false}
          layers={[
            {
              id: 'identity',
              title: 'Your identity',
              subtitle: p.boot.user.name,
              content: <p>A signing key on this device. The node sees your public key.</p>,
            },
            {
              id: 'node',
              title: 'Your community node',
              subtitle: p.boot.node.name,
              content: <p className="hub-mono">{p.nodeUrl}</p>,
            },
            {
              id: 'history',
              title: 'Shared history',
              subtitle: `${p.boot.message_count} messages`,
              content: <p>Your community operator stores and backs up the node database.</p>,
            },
          ]}
        />
      </Panel>
      <section id="guide-keys">
        <Panel
          title="Your public identity"
          note="This is public information. Never share your private key or backup passphrase."
        >
          <div className="hub-grid two">
            <div className="hub-form-stack">
              <E.LockInput
                label="Public signing key"
                description="Read-only Ed25519 public key"
                value={p.boot.user.public_key}
                readOnly
              />
              <E.LockInput label="Member ID" value={p.boot.user.id} readOnly />
              <div className="hub-action-row">
                <E.ThinkingOrb state="breathing" size={32} aria-label="Portable identity" />
                <p>No email address or central account is required.</p>
              </div>
              <E.Button onClick={p.onSettings}>Manage identity & export backup</E.Button>
            </div>
            <E.PackageBox
              maxWidth={320}
              label="IDENTITY CHECKLIST"
              slip={{
                eyebrow: 'RAEEN · PUBLIC IDENTITY',
                title: p.boot.user.name,
                subtitle: p.boot.node.name,
                reference: p.boot.user.id.slice(0, 8),
                recipient: 'You control your signing key',
                items: [
                  { name: 'Export encrypted backup' },
                  { name: 'Store the passphrase separately' },
                  { name: 'Keep a copy off this device' },
                ],
                total: 'Your identity, your responsibility',
                stamp: 'PORTABLE',
              }}
            />
          </div>
          <E.SmoothAccordion
            items={[
              {
                id: 'verify',
                title: 'Compare an identity check code',
                subtitle: 'A short visual aid, not a security verification',
                content: (
                  <div className="hub-form-stack">
                    <p>
                      Current key check code: <b className="hub-mono">{checksum}</b>. Compare this alongside
                      the full public key. Six digits alone do not establish identity.
                    </p>
                    <E.OTPInput
                      value={code}
                      onChange={setCode}
                      length={6}
                      aria-label="Public key comparison code"
                    />
                    {code.length === 6 && (
                      <p role="status">
                        {code === checksum
                          ? 'Code matches this device’s public identity.'
                          : 'That code does not match.'}
                      </p>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Panel>
      </section>
      <section id="guide-backup">
        <Panel
          title="Check an encrypted backup"
          note="Decrypt a backup locally and check that its public key matches your current identity. This does not replace your keys or contact a server."
        >
          <E.LockInput
            label="Backup passphrase"
            aria-label="Backup check passphrase"
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setVerified(false);
            }}
          />
          <E.AnimatedFileUpload
            accept=".json"
            multiple={false}
            maxFiles={1}
            maxSize={512000}
            dropTitle="Choose your encrypted identity backup"
            dropSubtitle="JSON · checked on this device only"
            disabled={!passphrase || checking}
            uploadHandler={async (file, progress) => {
              if (!file.rawFile) throw Error('Choose a backup file.');
              setChecking(true);
              setVerified(false);
              try {
                progress(20);
                const identity = await importIdentity(file.rawFile, passphrase);
                if (identity.public_key !== p.boot.user.public_key)
                  throw Error('This backup belongs to a different identity.');
                progress(100);
                setVerified(true);
              } finally {
                setChecking(false);
              }
            }}
          />
          {checking && <E.MorphingShapeLoader size={30} label="Decrypting backup" />}
          {verified && (
            <E.Alert tone="success">
              <E.AlertTitle>Backup matches your current identity</E.AlertTitle>
              <E.AlertDescription>
                Decryption succeeded locally. Keep your backup and passphrase safe.
              </E.AlertDescription>
            </E.Alert>
          )}
          <div className="hub-form-stack">
            <p className="hub-description">
              After saving a backup somewhere safe, mark your personal checklist.
            </p>
            <E.DragToConfirm
              label="Slide to mark backup stored safely"
              confirmedLabel="Backup checklist complete"
              isConfirmed={checked}
              onConfirm={() => setChecked(true)}
              onReset={() => setChecked(false)}
              autoResetDelay={0}
              actionType="confirm"
            />
            <E.Button variant="ghost" onClick={() => setChecked(!checked)}>
              {checked ? 'Reset personal checklist' : 'Mark checklist complete with keyboard'}
            </E.Button>
          </div>
        </Panel>
      </section>
      <Panel title="A private scratchpad" note="A small reminder for you. Stored only on this device.">
        <div className="hub-action-row">
          <E.Input
            aria-label="Private reminder"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Something worth remembering…"
            maxLength={300}
          />
          <E.Button onClick={() => setNote(draft.trim())}>Save note</E.Button>
        </div>
        {note && (
          <E.ParticleDeleteContainer
            key={note}
            onDelete={() => {
              setNote('');
              setDraft('');
            }}
            options={{ maxParticles: 100, duration: 650 }}
          >
            {({ handleDelete, isDeleting }) => (
              <div className="hub-private-note">
                <p>{note}</p>
                <E.Button
                  variant="ghost"
                  disabled={isDeleting}
                  aria-label="Delete private reminder"
                  onClick={handleDelete}
                >
                  <Trash2 size={15} />
                </E.Button>
              </div>
            )}
          </E.ParticleDeleteContainer>
        )}
      </Panel>
      <div className="hub-grid two">
        <Panel title="The essentials, filed away">
          <E.MacOSFolderCards
            folderTitle="Community field notes"
            folderCategory="YOUR NODE"
            items={[
              { id: 'node', title: p.boot.node.name, description: p.nodeUrl, meta: 'Community node' },
              {
                id: 'identity',
                title: p.boot.user.name,
                description: 'Portable Ed25519 identity',
                meta: p.boot.user.role,
              },
              {
                id: 'voice',
                title: 'Voice setup',
                description: p.boot.node.voice_enabled
                  ? 'LiveKit is configured'
                  : 'Ask your node owner to configure LiveKit',
                meta: 'Node capability',
              },
            ]}
          />
        </Panel>
        <Panel title="Postcards from your channels">
          <E.PhotoBox
            title="A few corners of your community"
            prints={p.boot.channels
              .slice(0, 3)
              .map((c, i) => ({
                id: c.id,
                title: c.name,
                caption: c.topic || `${c.kind} channel in ${p.boot.node.name}`,
                src: art[i],
                alt: `Abstract artwork for ${c.name}`,
              }))}
          />
        </Panel>
      </div>
      <section id="guide-help">
        <Panel title="A few good questions">
          <E.FAQ
            searchable
            showCategories
            items={[
              {
                id: 'encryption',
                question: 'Are messages end-to-end encrypted?',
                answer:
                  'Not in this MVP. Remote connections require HTTPS. Your node operator can read stored messages.',
                category: 'Privacy',
              },
              {
                id: 'identity',
                question: 'Can I use my identity on another node?',
                answer:
                  'Yes. Export an encrypted backup from Settings and import it on another device, or connect to another node from this device. The same signing identity can authenticate there.',
                category: 'Identity',
              },
              {
                id: 'federation',
                question: 'Do nodes federate?',
                answer:
                  'Not yet. Each node is independent. Portable sign-in works across nodes; cross-node room federation does not.',
                category: 'Nodes',
              },
              {
                id: 'voice',
                question: 'Why is voice unavailable?',
                answer:
                  'The node operator must configure LiveKit, its API credentials, and reachable network ports. See the repository README for setup.',
                category: 'Voice',
              },
              {
                id: 'local',
                question: 'Are plans and budget records shared?',
                answer:
                  'No. These tools use local browser storage. Export records if you want to keep a separate copy. They are not synced or encrypted.',
                category: 'Privacy',
              },
            ]}
          />
        </Panel>
      </section>
      <Panel title="A community you can make your own">
        <E.StickyPages
          pageHeight="260px"
          topOffset={0}
          pages={[
            {
              id: 'invite',
              title: 'Bring your people.',
              subtitle: 'The network starts with your group.',
              content: <E.Button onClick={p.onInvite}>Invite a friend</E.Button>,
              bg: '#22372a',
            },
            {
              id: 'conversation',
              title: 'Make room for conversation.',
              subtitle: 'Find your people in a text or voice channel.',
              content: <E.Button onClick={p.onReturn}>Back to chat</E.Button>,
              bg: '#2d2b3c',
            },
          ]}
        />
      </Panel>
      <E.StackedCards
        cards={cards}
        title="Open by design"
        subtitle="Your keys. Your community. Your conversations."
      />
      <E.ProductTour
        open={tour}
        onClose={() => setTour(false)}
        steps={[
          {
            target: '#guide-keys',
            title: 'Your portable identity',
            body: 'Your public key identifies you. Your private key stays on your device.',
          },
          {
            target: '#guide-backup',
            title: 'Keep a backup',
            body: 'Export an encrypted identity backup in Settings. You can check it here without replacing your keys.',
          },
          {
            target: '#guide-help',
            title: 'Know the current limits',
            body: 'This MVP has independent nodes. Chat is not end-to-end encrypted, and federation is not implemented.',
          },
        ]}
      />
    </div>
  );
}
