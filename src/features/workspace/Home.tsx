import { useState } from 'react';
import { Hash, Mic, Settings, UserPlus } from 'lucide-react';
import * as E from './home-ui';
import { Ambience } from './Ambience';
import { defaultAppearance, type AppearanceSettings } from './appearance-settings';
import { Panel, loadedMessages, type WorkspaceProps, useLocal } from './shared';
export default function Home(p: WorkspaceProps) {
  const [appearance] = useLocal<AppearanceSettings>(`raeen-appearance:${p.boot.node.id}`, defaultAppearance);
  const messages = loadedMessages(p),
    recent = messages.slice(-6).reverse();
  const [kind, setKind] = useState('all'),
    [query, setQuery] = useState('');
  const [read, setRead] = useLocal<string[]>(`raeen-notifications:${p.boot.node.id}`, []);
  const notifications = recent.map((m) => ({
    id: m.id,
    message: `${m.author.name}: ${m.content.slice(0, 100)}`,
    timestamp: new Date(m.created_at),
    read: read.includes(m.id),
    action: () => p.onChannel(p.boot.channels.find((c) => c.id === m.channel_id)!),
  }));
  const channels = p.boot.channels.filter(
    (c) => (kind === 'all' || c.kind === kind) && c.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="hub-page">
      <div className="hub-title-row">
        <div>
          <span className="hub-eyebrow">A PLACE TO BELONG</span>
          <h1>Good to see you, {p.boot.user.name}.</h1>
          <p>Your community, at a glance. Pick up where you left off.</p>
        </div>
        <E.NotificationBell
          notifications={notifications}
          onMarkAsRead={(id) => setRead([...read, id])}
          onMarkAllAsRead={() => setRead(recent.map((m) => m.id))}
        />
      </div>
      <div className="hub-hero">
        <div>
          <E.Badge tone={p.connection === 'online' ? 'success' : 'warning'} dot>
            {p.connection}
          </E.Badge>
          <h2>
            A little space.
            <br />
            <em>A lot of possibility.</em>
          </h2>
          <p>{p.boot.node.name} belongs to the people here.</p>
          <div className="hub-action-row">
            <E.RainbowButton onClick={p.onInvite}>
              Bring your people <UserPlus size={15} />
            </E.RainbowButton>
            <E.BookCallButton
              onClick={() => {
                const c = p.boot.channels.find((c) => c.kind === 'voice');
                if (c) p.onChannel(c);
              }}
            >
              Find your voice room
            </E.BookCallButton>
          </div>
        </div>
        <div className="hub-hero-art">
          <Ambience
            effect={appearance.enabled ? appearance.effect : 'None'}
            intensity={appearance.intensity}
          />
          <E.AvatarStack
            avatars={p.boot.members.map((u) => ({ id: u.id, name: u.name, fallback: u.name.slice(0, 2) }))}
            max={5}
          />
          <div className="hub-online-count">
            <E.AnimatedNumber value={p.boot.online.length} />
            <span>people connected</span>
          </div>
        </div>
      </div>
      <div className="hub-grid three">
        <E.StatCard
          label="Community members"
          value={p.boot.members.length}
          trend={[p.boot.members.length]}
          format={(n) => Math.round(n).toLocaleString()}
          period="Current membership"
        />
        <E.StatCard
          label="Conversations"
          value={p.boot.channels.filter((c) => c.kind === 'text').length}
          trend={[p.boot.channels.filter((c) => c.kind === 'text').length]}
          format={(n) => Math.round(n).toLocaleString()}
          period="Text channels on this node"
        />
        <E.StatCard
          label="Messages on node"
          value={p.boot.message_count}
          trend={[p.boot.message_count]}
          format={(n) => Math.round(n).toLocaleString()}
          period="Total reported by node"
        />
      </div>
      <div className="hub-grid main-side">
        <Panel title="Find your corner" note="Every channel is a small invitation.">
          <div className="hub-action-row">
            <E.PillNavigation
              items={[
                { id: 'all', label: 'All' },
                { id: 'text', label: 'Text' },
                { id: 'voice', label: 'Voice' },
              ]}
              defaultValue={kind}
              onChange={setKind}
            />
            <E.ExpandableSearch placeholder="Filter channels" onSearch={setQuery} />
          </div>
          <div className="hub-channel-grid">
            {channels.map((c) => (
              <E.SpotlightCard key={c.id} className="hub-channel-card">
                <E.PeekCard
                  data={{
                    title: c.name,
                    subtitle: c.topic,
                    status: c.kind,
                    actions: [{ label: 'Open channel', onClick: () => p.onChannel(c) }],
                  }}
                >
                  <span className="hub-channel-glyph">{c.kind === 'text' ? <Hash /> : <Mic />}</span>
                </E.PeekCard>
                <h3>{c.name}</h3>
                <p>{c.topic || 'Make this space your own.'}</p>
                <E.Button size="sm" variant="ghost" onClick={() => p.onChannel(c)}>
                  Open channel →
                </E.Button>
              </E.SpotlightCard>
            ))}
          </div>
          {!channels.length && <p className="hub-empty">No channels match your search.</p>}
        </Panel>
        <Panel title="Your place in the community">
          <E.DynamicIsland
            name={p.boot.user.name}
            role={p.boot.user.role}
            avatar="/canvas/orbit.svg"
            greeting="Your community identity"
            description="An Ed25519 identity stored on this device."
            statusText={p.connection}
            socials={[]}
            metadata={[
              { label: 'Node', value: p.boot.node.name },
              { label: 'Members', value: String(p.boot.members.length) },
            ]}
            profileContent={<p>Manage your identity and encrypted backup in Settings.</p>}
            shareContent={<E.Button onClick={p.onInvite}>Open community invite</E.Button>}
          />
          <E.MorphingDialog
            title="Your community node"
            subtitle={p.boot.node.name}
            trigger={(open) => (
              <E.MagneticButton variant="outline" onClick={open}>
                Connection details
              </E.MagneticButton>
            )}
          >
            <p className="hub-mono">{p.nodeUrl}</p>
            <p>Chat history is stored by this community node. Identity keys remain on your device.</p>
            <E.Button onClick={p.onSettings}>Open settings</E.Button>
          </E.MorphingDialog>
        </Panel>
      </div>
      <Panel
        title="Community pulse"
        note="Recent messages loaded on this device. Open more channels to include their history."
      >
        {recent.length ? (
          <E.ActivityFeed
            enableLiveSimulation={false}
            events={recent.map((m) => ({
              id: m.id,
              type: 'system',
              status: 'info',
              title: `${m.author.name} · #${p.boot.channels.find((c) => c.id === m.channel_id)?.name}`,
              description: m.content,
              timestamp: new Date(m.created_at).toLocaleTimeString(),
              isoTimestamp: new Date(m.created_at).toISOString(),
              actor: { name: m.author.name },
            }))}
          />
        ) : (
          <p className="hub-empty">Your next conversation starts in chat.</p>
        )}
        <E.NotificationStack
          key={recent.map((m) => m.id).join(',')}
          initialNotifications={recent.map((m) => ({
            id: m.id,
            title: m.author.name,
            description: m.content.slice(0, 120),
            type: 'info',
            time: new Date(m.created_at).toLocaleTimeString(),
          }))}
          maxVisible={3}
        />
      </Panel>
      <Panel title="Make room for good conversations">
        <E.FocusMode
          items={p.boot.channels.slice(0, 3).map((c) => ({
            id: c.id,
            title: c.name,
            category: c.kind,
            content: (
              <>
                <p>{c.topic || 'A shared space for your people.'}</p>
                <E.Button onClick={() => p.onChannel(c)}>Join the conversation</E.Button>
              </>
            ),
          }))}
        />
      </Panel>
      <E.UnfoldAccordion
        items={[
          {
            id: 'ownership',
            title: 'Your node. Your rules.',
            subtitle: 'A note about ownership',
            content: (
              <p>
                Community owners operate the server and control its data. Your identity can join another node
                using the same key. Federation and end-to-end encrypted chat are not yet implemented.
              </p>
            ),
          },
        ]}
      />
      <div className="hub-bottom-row">
        <E.FloatingActionDock
          items={[
            { id: 'chat', label: 'Back to chat', icon: <Hash />, onClick: p.onReturn },
            { id: 'invite', label: 'Invite friends', icon: <UserPlus />, onClick: p.onInvite },
            { id: 'settings', label: 'Settings', icon: <Settings />, onClick: p.onSettings },
          ]}
        />
        <E.RocketPartyPopper
          className="hub-celebrate"
          title="A community starts with you"
          description="Celebrate the people making this place their own."
          metric={`${p.boot.members.length} members`}
          triggerLabel="Celebrate your community"
          confettiCount={30}
        />
      </div>
    </div>
  );
}
