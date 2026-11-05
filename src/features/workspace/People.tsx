import { useState } from 'react';
import { Copy, Signal, SignalZero } from 'lucide-react';
import * as E from './people-ui';
import { Panel, loadedMessages, type WorkspaceProps } from './shared';
export default function People(p: WorkspaceProps) {
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState(p.boot.user.id),
    [page, setPage] = useState(1);
  const messages = loadedMessages(p),
    member = p.boot.members.find((m) => m.id === selected) ?? p.boot.user;
  const members = p.boot.members.filter((m) => m.name.toLowerCase().includes(query.toLowerCase()));
  const copy = (key: string) => {
    void navigator.clipboard
      .writeText(key)
      .then(() => p.notify('Public key copied.'))
      .catch(() => p.notify('Clipboard unavailable. Select the key to copy it.'));
  };
  return (
    <div className="hub-page">
      <div className="hub-title-row">
        <div>
          <span className="hub-eyebrow">THE PEOPLE MAKE THE PLACE</span>
          <h1>A familiar face. A new friend.</h1>
          <p>
            {p.boot.members.length} members · {p.boot.online.length} connected
          </p>
        </div>
        <E.IOSSearchBar
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Find a member"
          collapsedWidth={220}
          expandedWidth={260}
        />
      </div>
      <div className="hub-grid main-side">
        <Panel title="Member directory">
          <E.AdvancedDataTable
            data={members}
            getRowId={(m) => m.id}
            title="Community members"
            defaultPageSize={10}
            columns={[
              {
                id: 'name',
                header: 'Name',
                accessorKey: 'name',
                sortable: true,
                cell: ({ row }) => (
                  <button onClick={() => setSelected(row.id)} className="hub-link">
                    {row.name}
                  </button>
                ),
              },
              {
                id: 'role',
                header: 'Role',
                accessorKey: 'role',
                sortable: true,
                filterable: true,
                filterOptions: ['owner', 'moderator', 'member'].map((r) => ({ label: r, value: r })),
              },
              {
                id: 'presence',
                header: 'Presence',
                accessorFn: (m) => (p.boot.online.includes(m.id) ? 'Online' : 'Offline'),
                sortable: true,
              },
            ]}
          />
        </Panel>
        <div className="hub-profile">
          <E.Combobox
            aria-label="Select community member"
            options={p.boot.members.map((m) => ({ value: m.id, label: m.name, description: m.role }))}
            value={selected}
            onValueChange={(v) => {
              if (v) setSelected(v);
            }}
            placeholder="Choose a member"
          />
          <E.ProfileCard
            name={member.name}
            username={member.id.slice(0, 16)}
            description="A portable public identity in this community."
            followers={member.role}
            posts={String(messages.filter((m) => m.author.id === member.id).length)}
            website=""
            actionLabel="Copy public key"
            onAction={() => copy(member.public_key)}
          />
          <div className="hub-action-row">
            <E.MorphingIcon
              from={<SignalZero />}
              to={<Signal />}
              active={p.boot.online.includes(member.id)}
            />
            <span>{p.boot.online.includes(member.id) ? 'Connected now' : 'Offline'}</span>
            <E.OriginDropdown
              placeholder="Member actions"
              items={[
                {
                  id: 'copy',
                  label: 'Copy public key',
                  icon: <Copy />,
                  onSelect: () => copy(member.public_key),
                },
                { id: 'id', label: 'Copy member ID', onSelect: () => copy(member.id) },
              ]}
            />
          </div>
        </div>
      </div>
      <Panel
        title="Identity, in plain sight"
        note="Public keys identify members. They are safe to share; private keys stay on each device."
      >
        <div className="hub-grid two">
          <E.RevealCard
            revealContent={
              <div className="hub-key">
                <b>{member.name}'s public key</b>
                <p>{member.public_key}</p>
                <E.Button onClick={() => copy(member.public_key)}>Copy key</E.Button>
              </div>
            }
          >
            <div className="hub-key">
              <h3>{member.name}</h3>
              <p>Hover or focus to inspect this member’s public identity.</p>
              <button onClick={() => copy(member.public_key)}>Copy public key</button>
            </div>
          </E.RevealCard>
          <E.DensityLens lensSize={110} zoomScale={1.3}>
            <div className="hub-fingerprint">{member.public_key.match(/.{1,4}/g)?.join(' ')}</div>
          </E.DensityLens>
        </div>
      </Panel>
      <Panel title="Roles in this community">
        <E.StackUnfoldPanel
          cards={['owner', 'moderator', 'member'].map((role) => ({
            id: role,
            title: role,
            badge: String(p.boot.members.filter((m) => m.role === role).length),
            content: (
              <p>
                {role === 'owner'
                  ? 'Owners can configure the node, manage channels, moderate messages, and assign roles.'
                  : role === 'moderator'
                    ? 'Moderators can manage channels and moderate messages.'
                    : 'Members can read, write, react, and join voice.'}
              </p>
            ),
          }))}
        />
      </Panel>
      <Panel
        title="Public identity records"
        note="Live presence and counts from messages loaded on this device."
      >
        <E.ExpandableDataRow
          items={members
            .slice((page - 1) * 6, page * 6)
            .map((m) => ({
              id: m.id,
              user: { name: m.name, email: m.public_key, role: m.role },
              status: p.boot.online.includes(m.id) ? 'active' : 'paused',
              revenue: messages.filter((msg) => msg.author.id === m.id).length,
              date: 'Current membership',
              metadata: {
                plan: m.role,
                location: p.boot.node.name,
                billingMethod: 'Ed25519',
                lastActive: p.boot.online.includes(m.id) ? 'Connected now' : 'Offline',
              },
            }))}
          onRowAction={(action, row) => (action === 'profile' ? setSelected(row.id) : copy(row.user.email))}
        />
        <E.SlidePagination
          pageCount={Math.max(1, Math.ceil(members.length / 6))}
          page={page}
          onChange={setPage}
        />
      </Panel>
      {!members.length && (
        <E.NotFound
          errorCode="0"
          badgeLabel="Directory search"
          title="No familiar faces yet"
          description="Try another name or clear your search."
          actionLabel="Show everyone"
          onAction={() => setQuery('')}
          showBack={false}
          suggestions={[]}
          path={null}
          includeDocumentMetadata={false}
          footer={null}
        />
      )}
    </div>
  );
}
