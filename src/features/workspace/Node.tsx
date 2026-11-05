import { useCallback, useMemo, useState } from 'react';
import * as E from './node-ui';
import { Panel, loadedMessages, type WorkspaceProps } from './shared';
export default function Node(p: WorkspaceProps) {
  const messages = loadedMessages(p),
    [probe, setProbe] = useState<{ ms: number; at: string } | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  const measure = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      setFailure('');
      try {
        const start = performance.now();
        const response = await fetch(`${p.nodeUrl}/api/node`, {
          cache: 'no-store',
          signal: signal ?? AbortSignal.timeout(8000),
        });
        if (!response.ok) throw Error(`Node returned ${response.status}`);
        await response.json();
        const result = { ms: Math.round(performance.now() - start), at: new Date().toISOString() };
        setProbe(result);
        return result.ms;
      } catch (error) {
        if (!signal?.aborted)
          setFailure(error instanceof Error ? error.message : 'Node could not be reached.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [p.nodeUrl],
  );
  const source = useCallback(
    (push: (value: number) => void) => {
      const controller = new AbortController();
      const poll = () => {
        void measure(controller.signal).then((n) => {
          if (n !== null && !controller.signal.aborted) push(n);
        });
      };
      poll();
      const timer = setInterval(poll, 10000);
      return () => {
        controller.abort();
        clearInterval(timer);
      };
    },
    [measure],
  );
  const daily = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - 13 + i);
        const key = d.toLocaleDateString('en-CA');
        return {
          date: key,
          value: messages.filter((m) => new Date(m.created_at).toLocaleDateString('en-CA') === key).length,
        };
      }),
    [messages],
  );
  const counts = p.boot.channels.map((c) => ({
    label: c.name,
    messages: messages.filter((m) => m.channel_id === c.id).length,
  }));
  const report = `# ${p.boot.node.name}\n\nConnection: ${p.connection}.\n\n- ${p.boot.members.length} members (${p.boot.online.length} connected)\n- ${p.boot.channels.length} channels\n- ${p.boot.message_count} messages reported by the node\n- ${messages.length} messages loaded on this device\n- Voice ${p.boot.node.voice_enabled ? 'configured' : 'not configured'}\n\nThis report is assembled locally from node metadata. Chat is not end-to-end encrypted.`;
  const metrics = [
    {
      id: 'loaded',
      label: 'Loaded messages',
      value: String(messages.length),
      delta: { value: 'Current snapshot', trend: 'neutral' as const },
      timeSeries: { Now: [messages.length, messages.length] },
      description: 'History loaded by channels opened on this device.',
    },
    {
      id: 'members',
      label: 'Connected members',
      value: String(p.boot.online.length),
      delta: { value: 'Current snapshot', trend: 'neutral' as const },
      timeSeries: { Now: [p.boot.online.length, p.boot.online.length] },
      description: 'Current node presence.',
    },
  ];
  return (
    <div className="hub-page">
      <div className="hub-title-row">
        <div>
          <span className="hub-eyebrow">SOVEREIGN BY DESIGN</span>
          <h1>Your little corner of the network.</h1>
          <p>Real node metadata, connection checks, and the history loaded on this device.</p>
        </div>
        <E.NeonEdgeButton onClick={() => void measure()} disabled={busy}>
          Check connection
        </E.NeonEdgeButton>
      </div>
      <E.Alert tone={failure ? 'warning' : 'info'}>
        <E.AlertTitle>{failure || 'About these numbers'}</E.AlertTitle>
        <E.AlertDescription>
          Message charts include loaded channel history only. They are not server-wide analytics or resource
          monitoring.
        </E.AlertDescription>
      </E.Alert>
      <E.PullToRefresh
        className="hub-full"
        onRefresh={async () => {
          await measure();
        }}
      >
        <E.MetricHUD metrics={metrics} timeRanges={['Now']} defaultTimeRange="Now" />
      </E.PullToRefresh>
      <div className="hub-grid two">
        <Panel
          title="Node request time"
          note="HTTP round trip to /api/node, checked every 10 seconds while this screen is open."
        >
          <E.LiveLineChart
            source={source}
            intervalMs={10000}
            windowSeconds={120}
            unit="ms"
            ariaLabel="Node HTTP request duration"
            height={180}
          />
          {busy && (
            <div className="hub-action-row">
              <E.OrbitalLoadingRing size={28} label="Checking node" />
              <span>Checking your node…</span>
            </div>
          )}
          {probe && (
            <p className="hub-caption">
              Last response: {probe.ms} ms · {new Date(probe.at).toLocaleTimeString()}
            </p>
          )}
        </Panel>
        <Panel title="A direct connection" note="Your identity connects to this community’s node.">
          <E.DependencyTrace
            nodes={[
              { id: 'you', label: p.boot.user.name, type: 'client', x: 15, y: 50 },
              { id: 'node', label: p.boot.node.name, type: 'service', x: 50, y: 50 },
              { id: 'data', label: 'Node history', type: 'database', x: 85, y: 50 },
            ]}
            connections={[
              { from: 'you', to: 'node', label: 'Signed identity' },
              { from: 'node', to: 'data', label: 'SQLite' },
            ]}
            onNodeSelect={(id) =>
              p.notify(
                id === 'you'
                  ? 'Your private key stays on your device.'
                  : id === 'node'
                    ? p.nodeUrl
                    : 'Message history is stored by this community node.',
              )
            }
          />
        </Panel>
      </div>
      <Panel title="A fortnight of conversations" note="Counts by local calendar day, from loaded messages.">
        <E.ActivityHeatmap data={daily} weeks={2} unit="messages" color="#b5f0c8" />
        <E.InteractiveAreaChart
          title="Loaded messages per day"
          data={{
            '14D': daily.map((d) => ({ date: new Date(`${d.date}T12:00:00`).getTime(), value: d.value })),
          }}
          defaultRange="14D"
          height={220}
        />
      </Panel>
      <div className="hub-grid two">
        <Panel title="Where the conversations happen">
          <E.BarChart
            data={counts}
            series={[{ key: 'messages', label: 'Loaded messages', color: '#b5f0c8' }]}
            height={220}
          />
        </Panel>
        <Panel title="Members by role">
          <E.DonutChart
            data={['owner', 'moderator', 'member'].map((r, i) => ({
              label: r,
              value: p.boot.members.filter((m) => m.role === r).length,
              color: ['#b5f0c8', '#c7b6f0', '#e9ce9f'][i],
            }))}
            centerLabel="Members"
            size={220}
          />
        </Panel>
      </div>
      <Panel title="From the community to this device" note="A coverage view, not a conversion funnel.">
        <E.FunnelChart
          showSummary={false}
          stages={[
            { label: 'Messages reported by node', value: p.boot.message_count },
            { label: 'Messages loaded here', value: messages.length },
            {
              label: 'Your loaded messages',
              value: messages.filter((m) => m.author.id === p.boot.user.id).length,
            },
          ]}
        />
      </Panel>
      <Panel title="Connection trace">
        <E.AIAgentActivity
          title="Current connection state"
          agentName="Raeen node"
          isRunning={p.connection === 'connecting'}
          activities={[
            {
              id: 'identity',
              type: 'completed',
              title: 'Portable identity available',
              status: 'success',
              description: p.boot.user.name,
            },
            {
              id: 'metadata',
              type: 'api_request',
              title: 'Node metadata loaded',
              status: 'success',
              description: p.boot.node.name,
            },
            {
              id: 'socket',
              type: p.connection === 'online' ? 'completed' : 'api_request',
              title: `Realtime connection: ${p.connection}`,
              status:
                p.connection === 'online' ? 'success' : p.connection === 'connecting' ? 'running' : 'error',
            },
            {
              id: 'probe',
              type: 'api_request',
              title: probe ? `HTTP request: ${probe.ms} ms` : 'Checking node response',
              status: failure ? 'error' : probe ? 'success' : 'running',
              description: failure || probe?.at,
            },
          ]}
        />
      </Panel>
      <E.AIResponse content={report} status="complete" modelName="Local metadata">
        <E.AIResponseHeader title="Node report" modelBadge="Assembled locally · no AI" />
        <E.AIResponseContent />
        <E.AIResponseActions />
      </E.AIResponse>
      <Panel
        title="Self-hosting notes"
        note="Run these commands in your Raeen repository checkout. Configure LiveKit separately for voice."
      >
        <E.CodeSnippetDeck
          snippets={[
            {
              language: 'bash',
              label: 'Docker',
              filename: 'terminal',
              code: 'cp .env.example .env\ndocker compose up --build -d',
            },
            {
              language: 'sh',
              label: 'Native',
              filename: 'terminal',
              code: 'cargo run --release -p raeen-node',
            },
          ]}
        />
      </Panel>
      <E.InteractiveTimeline
        items={messages
          .slice(-5)
          .reverse()
          .map((m) => ({
            id: m.id,
            title: `${m.author.name} in #${p.boot.channels.find((c) => c.id === m.channel_id)?.name}`,
            description: m.content,
            timestamp: new Date(m.created_at).toLocaleString(),
            status: 'completed',
            author: { name: m.author.name },
          }))}
      />
    </div>
  );
}
