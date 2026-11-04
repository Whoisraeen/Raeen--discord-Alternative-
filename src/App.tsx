import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Download,
  ExternalLink,
  Globe2,
  Hash,
  KeyRound,
  LogOut,
  Menu,
  Mic,
  MicOff,
  Network,
  Plus,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  Users,
  Volume2,
  WifiOff,
  X,
} from 'lucide-react';
import { NodeClient, defaultNode, normalizeNode } from './api';
import { createIdentity, exportIdentity, importIdentity, loadIdentity, saveIdentity } from './identity';
import { Avatar, ChatHistory, Composer, CopyButton, Logo, MessageText, Modal } from './components';
import { useVoice, VoiceView } from './voice';
import type { Bootstrap, Channel, Identity, Message, NodeEvent } from './types';

type Dialog = 'none' | 'node' | 'settings' | 'create-channel' | 'search' | 'invite' | 'about';
type SavedNode = { url: string; name: string };
type Preferences = { accent: 'mint' | 'lilac' | 'sand'; compact: boolean; members: boolean };
function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
}
function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message === 'Failed to fetch'
      ? 'Could not reach this node. Check its address and make sure it is running.'
      : error.message
    : 'Something went wrong. Please try again.';
}
function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const map = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => map.set(message.id, message));
  return [...map.values()].sort((a, b) => a.seq - b.seq);
}

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(null),
    [client, setClient] = useState<NodeClient | null>(null),
    [boot, setBoot] = useState<Bootstrap | null>(null);
  const [starting, setStarting] = useState(true),
    [connecting, setConnecting] = useState(false),
    [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [nodeUrl, setNodeUrl] = useState(() => readLocal('raeen-node', defaultNode)),
    [nodes, setNodes] = useState<SavedNode[]>(() => readLocal('raeen-nodes', []));
  const [active, setActive] = useState(''),
    [histories, setHistories] = useState<Record<string, Message[]>>({}),
    [hasMore, setHasMore] = useState<Record<string, boolean>>({}),
    [loading, setLoading] = useState<Record<string, boolean>>({}),
    [unread, setUnread] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<Dialog>('none'),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [reply, setReply] = useState<Message | null>(null),
    [sidebarOpen, setSidebarOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(() =>
    readLocal('raeen-preferences', { accent: 'mint', compact: false, members: true }),
  );
  const [typers, setTypers] = useState<Record<string, { name: string; channel: string; expires: number }>>(
    {},
  );
  const activeRef = useRef(active),
    clientRef = useRef(client),
    identityRef = useRef(identity),
    historiesRef = useRef(histories),
    socketRef = useRef<WebSocket | null>(null),
    connectGeneration = useRef(0);
  const revision = useRef(0),
    eventLog = useRef<{ revision: number; event: NodeEvent }[]>([]),
    historyRequests = useRef<Record<string, number>>({});
  activeRef.current = active;
  clientRef.current = client;
  identityRef.current = identity;
  historiesRef.current = histories;
  const report = useCallback((message: string) => setError(message), []);
  const voice = useVoice(client, report);
  const closeDialog = useCallback(() => setDialog('none'), []);
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    localStorage.setItem('raeen-preferences', JSON.stringify(preferences));
    document.documentElement.dataset.accent = preferences.accent;
  }, [preferences]);

  const connect = async (url: string, key: Identity) => {
    const generation = ++connectGeneration.current;
    setConnecting(true);
    setError('');
    try {
      const normalized = normalizeNode(url);
      const nextClient = new NodeClient(normalized);
      await nextClient.signIn(key);
      const next = await nextClient.request<Bootstrap>('/api/bootstrap');
      if (generation !== connectGeneration.current) return;
      setIdentity(key);
      setClient(nextClient);
      setBoot(next);
      setHistories({});
      setHasMore({});
      setLoading({});
      setUnread({});
      setReply(null);
      setTypers({});
      revision.current = 0;
      eventLog.current = [];
      historyRequests.current = {};
      const last = readLocal<string>(`raeen-channel:${next.node.id}`, '');
      setActive(
        next.channels.find((channel) => channel.id === last)?.id ??
          next.channels.find((channel) => channel.kind === 'text')?.id ??
          next.channels[0]?.id ??
          '',
      );
      setNodeUrl(normalized);
      localStorage.setItem('raeen-node', JSON.stringify(normalized));
      setNodes((previous) => {
        const updated = [
          ...previous.filter((node) => node.url !== normalized),
          { url: normalized, name: next.node.name },
        ];
        localStorage.setItem('raeen-nodes', JSON.stringify(updated));
        return updated;
      });
      setDialog('none');
      setConnection('connecting');
    } catch (error) {
      if (generation === connectGeneration.current) setError(errorMessage(error));
    } finally {
      if (generation === connectGeneration.current) {
        setConnecting(false);
        setStarting(false);
      }
    }
  };
  useEffect(() => {
    void loadIdentity()
      .then((key) => {
        setIdentity(key);
        if (key) return connect(nodeUrl, key);
        setStarting(false);
      })
      .catch((error) => {
        setError(errorMessage(error));
        setStarting(false);
      });
  }, []);

  const refresh = useCallback(async () => {
    if (!client) return;
    const data = await client.request<Bootstrap>('/api/bootstrap');
    if (clientRef.current === client) setBoot(data);
  }, [client]);
  const loadHistory = useCallback(
    async (channelId: string, before?: number, older = false) => {
      if (!client) return;
      const startedAt = revision.current;
      const requestId = (historyRequests.current[channelId] ?? 0) + 1;
      historyRequests.current[channelId] = requestId;
      setLoading((previous) => ({ ...previous, [channelId]: true }));
      try {
        const messages = await client.request<Message[]>(
          `/api/channels/${encodeURIComponent(channelId)}/messages${before ? `?before=${before}` : ''}`,
        );
        if (clientRef.current !== client || historyRequests.current[channelId] !== requestId) return;
        // Replay events received while the REST snapshot was in flight, so an older
        // response cannot resurrect a deletion or erase a just-delivered message.
        const snapshot = new Map(messages.map((message) => [message.id, message]));
        for (const entry of eventLog.current.filter((entry) => entry.revision > startedAt)) {
          const event = entry.event;
          if (event.type === 'message_deleted' && event.channel_id === channelId && event.id)
            snapshot.delete(event.id);
          if (
            event.message?.channel_id === channelId &&
            (event.type === 'message_created' || snapshot.has(event.message.id))
          )
            snapshot.set(event.message.id, event.message);
        }
        const current = [...snapshot.values()].sort((a, b) => a.seq - b.seq);
        setHistories((previous) => ({
          ...previous,
          [channelId]: older ? mergeMessages(previous[channelId] ?? [], current) : current,
        }));
        setHasMore((previous) => ({ ...previous, [channelId]: messages.length === 60 }));
      } catch (error) {
        if (clientRef.current === client) setError(errorMessage(error));
      } finally {
        if (clientRef.current === client && historyRequests.current[channelId] === requestId)
          setLoading((previous) => ({ ...previous, [channelId]: false }));
      }
    },
    [client],
  );
  useEffect(() => {
    if (!client || !boot?.user.id) return;
    let cancelled = false,
      retry: ReturnType<typeof setTimeout> | undefined,
      attempts = 0;
    let socket: WebSocket | null = null;
    const open = async () => {
      if (cancelled) return;
      setConnection('connecting');
      try {
        if (attempts > 0 && identityRef.current) await client.signIn(identityRef.current);
        if (cancelled) return;
        socket = client.socket();
        socketRef.current = socket;
        socket.onopen = () => socket?.send(JSON.stringify({ type: 'authenticate', token: client.token }));
        socket.onmessage = (event) => {
          let data: NodeEvent;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          if (['message_created', 'message_updated', 'message_deleted'].includes(data.type)) {
            eventLog.current.push({ revision: ++revision.current, event: data });
            if (eventLog.current.length > 2048) eventLog.current.splice(0, 1024);
          }
          if (data.type === 'ready') {
            attempts = 0;
            setConnection('online');
            void refresh().catch((error) => report(errorMessage(error)));
            if (activeRef.current) void loadHistory(activeRef.current);
          }
          if (data.type === 'presence')
            setBoot((previous) => (previous ? { ...previous, online: data.online ?? [] } : null));
          if (data.type === 'members_changed' || data.type === 'channels_changed' || data.type === 'resync') {
            void refresh().catch((error) => report(errorMessage(error)));
            if (data.type === 'resync') void loadHistory(activeRef.current);
          }
          if ((data.type === 'message_created' || data.type === 'message_updated') && data.message) {
            const message = data.message;
            setHistories((previous) => ({
              ...previous,
              [message.channel_id]: mergeMessages(previous[message.channel_id] ?? [], [message]),
            }));
            if (data.type === 'message_created') {
              setBoot((previous) =>
                previous ? { ...previous, message_count: previous.message_count + 1 } : null,
              );
              setTypers((previous) => {
                const next = { ...previous };
                delete next[message.author.id];
                return next;
              });
              if (message.channel_id !== activeRef.current && message.author.id !== boot.user.id)
                setUnread((previous) => ({
                  ...previous,
                  [message.channel_id]: (previous[message.channel_id] ?? 0) + 1,
                }));
            }
          }
          if (data.type === 'message_deleted') {
            setHistories((previous) =>
              Object.fromEntries(
                Object.entries(previous).map(([id, messages]) => [
                  id,
                  messages.filter((message) => message.id !== data.id),
                ]),
              ),
            );
            setBoot((previous) =>
              previous ? { ...previous, message_count: Math.max(0, previous.message_count - 1) } : null,
            );
          }
          if (data.type === 'history_changed' && data.channel_id && data.channel_id === activeRef.current)
            void loadHistory(data.channel_id);
          if (data.type === 'typing' && data.user_id && data.user_id !== boot.user.id && data.channel_id)
            setTypers((previous) => ({
              ...previous,
              [data.user_id!]: {
                name: data.name ?? 'Someone',
                channel: data.channel_id!,
                expires: Date.now() + 4500,
              },
            }));
        };
        socket.onclose = () => {
          if (cancelled) return;
          setConnection('offline');
          attempts++;
          retry = setTimeout(
            () => {
              void open();
            },
            Math.min(1000 * 2 ** Math.min(attempts - 1, 4), 15000),
          );
        };
        socket.onerror = () => socket?.close();
      } catch {
        if (cancelled) return;
        setConnection('offline');
        attempts++;
        retry = setTimeout(
          () => {
            void open();
          },
          Math.min(1000 * 2 ** Math.min(attempts - 1, 4), 15000),
        );
      }
    };
    void open();
    const expire = setInterval(
      () =>
        setTypers((previous) =>
          Object.fromEntries(Object.entries(previous).filter(([, value]) => value.expires > Date.now())),
        ),
      2000,
    );
    return () => {
      cancelled = true;
      clearTimeout(retry);
      clearInterval(expire);
      socket?.close();
      socketRef.current = null;
    };
  }, [client, boot?.user.id, loadHistory, refresh, report]);
  useEffect(() => {
    if (!active || !client) return;
    setReply(null);
    setSidebarOpen(false);
    setUnread((previous) => ({ ...previous, [active]: 0 }));
    if (boot) localStorage.setItem(`raeen-channel:${boot.node.id}`, JSON.stringify(active));
    if (boot?.channels.find((channel) => channel.id === active)?.kind === 'text') void loadHistory(active);
  }, [active, client, loadHistory]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && boot) {
        event.preventDefault();
        setDialog('search');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [!!boot]);
  const channel = boot?.channels.find((channel) => channel.id === active);
  const currentMessages = histories[active] ?? [];
  const mutate = async <T,>(path: string, method: string, body?: unknown): Promise<T | undefined> => {
    if (!client) return;
    try {
      return await client.request<T>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (error) {
      setError(errorMessage(error));
    }
  };
  const pendingMessage = useRef<{ text: string; channel: string; reply: string | null; id: string } | null>(
    null,
  );
  const sendMessage = async (text: string): Promise<boolean> => {
    if (!client || !channel) return false;
    const replyId = reply?.id ?? null;
    if (
      !pendingMessage.current ||
      pendingMessage.current.text !== text ||
      pendingMessage.current.channel !== channel.id ||
      pendingMessage.current.reply !== replyId
    )
      pendingMessage.current = { text, channel: channel.id, reply: replyId, id: crypto.randomUUID() };
    try {
      const message = await client.post<Message>(`/api/channels/${channel.id}/messages`, {
        content: text,
        reply_to: replyId,
        client_id: pendingMessage.current.id,
      });
      setHistories((previous) => ({
        ...previous,
        [message.channel_id]: mergeMessages(previous[message.channel_id] ?? [], [message]),
      }));
      pendingMessage.current = null;
      return true;
    } catch (error) {
      setError(errorMessage(error));
      return false;
    }
  };
  const onEdit = async (message: Message, text: string) => {
    const updated = await mutate<Message>(`/api/messages/${message.id}`, 'PATCH', { content: text });
    if (!updated) throw new Error('Could not save message.');
    setHistories((previous) => ({
      ...previous,
      [message.channel_id]: mergeMessages(previous[message.channel_id] ?? [], [updated]),
    }));
  };
  const onDelete = (message: Message) => {
    if (confirm('Delete this message? This removes it from this node’s history.'))
      void mutate(`/api/messages/${message.id}`, 'DELETE');
  };
  const onReact = (message: Message, emoji: string) => {
    void mutate(`/api/messages/${message.id}/reactions`, 'POST', { emoji });
  };
  const selectChannel = (next: Channel) => setActive(next.id);
  const canManage = boot?.user.role !== 'member';
  const switchNode = async (url: string) => {
    if (identity) await connect(url, identity);
  };
  const signOut = async () => {
    await voice.leave();
    if (client) await client.request('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setClient(null);
    setBoot(null);
    setDialog('none');
  };

  return (
    <div className={`app ${preferences.compact ? 'compact' : ''}`}>
      <div className="app-chrome" inert={!boot || dialog !== 'none'}>
        <div className="brand-word">
          <Logo small />
          raeen<span className="beta-tag">preview</span>
        </div>
        <span className="chrome-center">
          <span className="tiny-dot" />a home for your people
        </span>
        <button onClick={() => setDialog('about')} className="chrome-link">
          Open by design
          <ArrowUpRightIcon />
        </button>
      </div>
      <div className="workspace" inert={!boot || dialog !== 'none'}>
        <nav className="server-rail" aria-label="Communities">
          <button className="rail-home" title="About Raeen" onClick={() => setDialog('about')}>
            <Logo />
          </button>
          <div className="rail-divider" />
          {nodes.length ? (
            nodes.map((node) => (
              <button
                key={node.url}
                className={`server-button ${node.url === client?.base ? 'selected' : ''}`}
                title={`${node.name} · ${node.url}`}
                aria-label={`Open ${node.name}`}
                onClick={() => void switchNode(node.url)}
                disabled={connecting}
              >
                <span>
                  {node.name
                    .split(' ')
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()}
                </span>
                {node.url === client?.base && <i />}
              </button>
            ))
          ) : (
            <button
              className="server-button selected"
              aria-label="Your community"
              onClick={() => setDialog('node')}
            >
              <span>TC</span>
              <i />
            </button>
          )}
          <button
            className="rail-add"
            aria-label="Connect to a community"
            title="Connect to a community"
            onClick={() => setDialog('node')}
          >
            <Plus size={23} />
          </button>
          <div className="rail-spacer" />
          <button className="rail-bottom" onClick={() => setDialog('about')} aria-label="About open nodes">
            <Globe2 size={22} />
          </button>
          <button className="rail-bottom" onClick={() => setDialog('settings')} aria-label="Settings">
            <SlidersHorizontal size={21} />
          </button>
        </nav>
        {sidebarOpen && (
          <button
            className="sidebar-scrim"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close channels"
          />
        )}
        <aside className={`channel-sidebar ${sidebarOpen ? 'mobile-open' : ''}`} aria-label="Channels">
          <button className="community-heading" onClick={() => setDialog('settings')}>
            <span className="community-symbol">✳</span>
            <span>
              <b>{boot?.node.name ?? 'The Commons'}</b>
              <small>
                <span className="tiny-dot" />
                community-owned
              </small>
            </span>
            <ChevronDown size={16} />
          </button>
          <button className="quick-search" onClick={() => setDialog('search')}>
            <Search size={15} />
            <span>Find a conversation</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="channel-scroll">
            <div className="community-section-label">
              YOUR COMMUNITY<span>{boot?.members.length ?? 0}</span>
            </div>
            <button className="sidebar-item overview-link" onClick={() => setDialog('about')}>
              <BookOpen size={18} />
              <span>Community guide</span>
              <span className="new-badge">new</span>
            </button>
            <div className="channel-category">
              <span>TEXT CHANNELS</span>
              {canManage && boot && (
                <button
                  aria-label="Create text channel"
                  title="Create channel"
                  onClick={() => setDialog('create-channel')}
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
            {(
              boot?.channels ?? [
                { id: 'default-0', name: 'general', kind: 'text', topic: '', position: 0 },
                { id: 'default-1', name: 'introductions', kind: 'text', topic: '', position: 1 },
                { id: 'default-2', name: 'build-log', kind: 'text', topic: '', position: 2 },
              ]
            )
              .filter((channel) => channel.kind === 'text')
              .map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-item channel-item ${active === item.id || (!boot && item.id === 'default-0') ? 'active' : ''}`}
                  onClick={() => selectChannel(item)}
                >
                  <Hash size={19} />
                  <span>{item.name}</span>
                  {unread[item.id] > 0 && <span className="unread-badge">{unread[item.id]}</span>}
                </button>
              ))}
            <div className="channel-category voice-category">
              <span>VOICE CHANNELS</span>
              {boot && (
                <span
                  className="voice-dot"
                  title={boot.node.voice_enabled ? 'Voice configured' : 'Voice setup required'}
                />
              )}
            </div>
            {(
              boot?.channels ?? [
                { id: 'default-3', name: 'The Lounge', kind: 'voice', topic: '', position: 3 },
                { id: 'default-4', name: 'Co-op room', kind: 'voice', topic: '', position: 4 },
              ]
            )
              .filter((channel) => channel.kind === 'voice')
              .map((item) => (
                <button
                  key={item.id}
                  className={`sidebar-item channel-item ${active === item.id ? 'active' : ''} ${voice.channel?.id === item.id ? 'in-voice' : ''}`}
                  onClick={() => selectChannel(item)}
                >
                  <Volume2 size={18} />
                  <span>{item.name}</span>
                  {voice.channel?.id === item.id && <span className="voice-dot" />}
                </button>
              ))}
            <div className="sidebar-invite">
              <div className="invite-spark">✳</div>
              <b>Better with your people.</b>
              <p>
                Good communities start small.
                <br />
                Bring someone along.
              </p>
              <button onClick={() => setDialog('invite')}>
                Invite a friend
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          {voice.channel && (
            <div className="voice-status">
              <button onClick={() => setActive(voice.channel!.id)}>
                <Activity size={16} />
                <span>
                  <b>Voice connected</b>
                  <small>{voice.channel.name}</small>
                </span>
              </button>
              <button className="icon-btn danger" aria-label="Disconnect voice" onClick={voice.leave}>
                <LogOut size={16} />
              </button>
            </div>
          )}
          <div className="node-status">
            <span className={`status-dot ${connection === 'online' && boot ? 'connected' : ''}`} />
            <span>
              {boot
                ? connection === 'online'
                  ? 'Connected to your node'
                  : connection === 'offline'
                    ? 'Reconnecting to node…'
                    : 'Connecting…'
                : 'Your node. Your rules.'}
            </span>
            <ShieldCheck size={13} />
          </div>
          <div className="user-panel">
            {boot ? (
              <Avatar user={boot.user} size="small-avatar" online={connection === 'online'} />
            ) : (
              <span className="avatar small-avatar color-0">?</span>
            )}
            <button className="user-name" onClick={() => setDialog('settings')}>
              <b>{boot?.user.name ?? 'Make yourself at home'}</b>
              <small>{boot?.user.role ?? 'Your identity, everywhere'}</small>
            </button>
            <button
              className={`icon-btn ${voice.muted ? 'danger' : ''}`}
              title={voice.channel ? 'Toggle microphone' : 'Join a voice channel to use your microphone'}
              aria-label="Toggle microphone"
              onClick={() =>
                voice.channel
                  ? void voice.toggleMute()
                  : notify('Choose a voice channel to connect your microphone.')
              }
            >
              {voice.muted ? <MicOff size={17} /> : <Mic size={17} />}
            </button>
            <button
              className="icon-btn"
              aria-label="Open settings"
              title="Settings"
              onClick={() => setDialog('settings')}
            >
              <Settings2 size={17} />
            </button>
          </div>
        </aside>
        <main className="main-panel">
          <header className="channel-header">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Show channels"
            >
              <Menu size={20} />
            </button>
            <span className="header-channel-icon">
              {channel?.kind === 'voice' ? <Volume2 size={23} /> : <Hash size={24} />}
            </span>
            <b>{channel?.name ?? 'general'}</b>
            <span className="header-divider" />
            <span className="channel-topic">
              {channel?.topic ?? 'A little bit of everything. Make yourself at home.'}
            </span>
            <div className="header-actions">
              <span className="node-badge">
                <span className="tiny-dot" />
                self-hosted
              </span>
              <button
                className="icon-btn"
                aria-label="Search messages"
                title="Search (⌘K)"
                onClick={() => setDialog('search')}
              >
                <Search size={19} />
              </button>
              <button
                className={`icon-btn ${preferences.members ? 'selected-icon' : ''}`}
                aria-label="Toggle member list"
                title="Member list"
                onClick={() => setPreferences((previous) => ({ ...previous, members: !previous.members }))}
              >
                <Users size={19} />
              </button>
              <button
                className="icon-btn help-button"
                aria-label="Community guide"
                onClick={() => setDialog('about')}
              >
                <CircleHelp size={19} />
              </button>
            </div>
          </header>
          {error && (
            <div className="error-banner" role="alert">
              <WifiOff size={16} />
              <span>{error}</span>
              <button className="icon-btn" aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {boot && connection === 'offline' && (
            <div className="offline-banner">
              <WifiOff size={14} />
              The node is offline. Your draft is safe. Raeen will reconnect automatically.
            </div>
          )}
          <div className="main-content">
            <section className="conversation" aria-label="Conversation">
              {boot && channel ? (
                channel.kind === 'text' ? (
                  <>
                    <ChatHistory
                      channel={channel}
                      messages={currentMessages}
                      me={boot.user}
                      compact={preferences.compact}
                      hasMore={hasMore[active] ?? false}
                      loading={loading[active] ?? false}
                      loadMore={() => loadHistory(active, currentMessages[0]?.seq, true)}
                      onReply={setReply}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onReact={onReact}
                    />
                    <Composer
                      channel={channel}
                      send={sendMessage}
                      reply={reply}
                      clearReply={() => setReply(null)}
                      onTyping={() => {
                        if (socketRef.current?.readyState === WebSocket.OPEN)
                          socketRef.current.send(JSON.stringify({ type: 'typing', channel_id: active }));
                      }}
                      disabled={connection !== 'online'}
                      typing={Object.values(typers)
                        .filter((typer) => typer.channel === active)
                        .map((typer) => typer.name)}
                    />
                  </>
                ) : (
                  <VoiceView
                    channel={channel}
                    voice={voice}
                    enabled={boot.node.voice_enabled}
                    openSettings={() => setDialog('settings')}
                  />
                )
              ) : (
                <div className="app-placeholder">
                  <Logo />
                  <h1>Your people, your place.</h1>
                  <p>A quieter corner of the internet.</p>
                </div>
              )}
            </section>
            {preferences.members && boot && (
              <aside className="members-sidebar" aria-label="Members">
                <div className="members-heading">
                  <span>THE PEOPLE HERE</span>
                  <span>{boot.members.length}</span>
                </div>
                <div className="online-label">
                  <span className="tiny-dot" />
                  ONLINE — {boot.members.filter((member) => boot.online.includes(member.id)).length}
                </div>
                <div className="member-list">
                  {[true, false].map((online) => (
                    <div key={String(online)}>
                      {!online && boot.members.some((member) => !boot.online.includes(member.id)) && (
                        <div className="offline-label">OFFLINE</div>
                      )}
                      {boot.members
                        .filter((member) => boot.online.includes(member.id) === online)
                        .map((member) => (
                          <div key={member.id} className={`member-row ${online ? '' : 'member-offline'}`}>
                            <Avatar user={member} size="small-avatar" online={online} />
                            <div>
                              <b>
                                {member.name}
                                {member.id === boot.user.id && <span className="you-tag">you</span>}
                              </b>
                              <small>
                                {member.role === 'owner'
                                  ? 'Community owner'
                                  : member.role === 'moderator'
                                    ? 'Moderator'
                                    : online
                                      ? 'Around and about'
                                      : 'Taking a break'}
                              </small>
                            </div>
                            {member.role === 'owner' && <Shield size={13} className="owner-shield" />}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
                <div className="node-card">
                  <div className="node-card-icon">
                    <Network size={18} />
                  </div>
                  <span className="eyebrow">A DIFFERENT KIND OF HOME</span>
                  <h3>
                    Owned by the
                    <br />
                    people in it.
                  </h3>
                  <p>This conversation lives on your community’s node.</p>
                  <button onClick={() => setDialog('settings')}>
                    Meet your node
                    <ArrowRight size={13} />
                  </button>
                  <div className="node-card-footer">
                    <Server size={12} />
                    <span>{boot.members.length} members</span>
                    <span>·</span>
                    <span>{boot.channels.length} channels</span>
                  </div>
                </div>
                <span className="members-bottom">
                  Built for people. Open by design.<span>raeen / 0.1</span>
                </span>
              </aside>
            )}
          </div>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {!boot && !starting && (
        <Welcome
          identity={identity}
          setIdentity={setIdentity}
          nodeUrl={nodeUrl}
          connecting={connecting}
          error={error}
          connect={connect}
        />
      )}
      {starting && (
        <div className="startup-overlay">
          <Logo />
          <span>Finding your people…</span>
        </div>
      )}
      {boot && dialog === 'node' && (
        <NodeDialog
          current={nodeUrl}
          connect={switchNode}
          connecting={connecting}
          close={closeDialog}
          error={error}
        />
      )}
      {boot && client && identity && dialog === 'settings' && (
        <SettingsDialog
          client={client}
          boot={boot}
          identity={identity}
          preferences={preferences}
          setPreferences={setPreferences}
          updateIdentity={async (next) => {
            await saveIdentity(next);
            setIdentity(next);
            await refresh();
          }}
          refresh={refresh}
          notify={notify}
          close={closeDialog}
          signOut={signOut}
        />
      )}
      {boot && client && dialog === 'create-channel' && (
        <CreateChannelDialog
          client={client}
          close={closeDialog}
          created={async (next) => {
            await refresh();
            setActive(next.id);
            closeDialog();
          }}
        />
      )}
      {boot && client && dialog === 'search' && (
        <SearchDialog
          client={client}
          channels={boot.channels}
          close={closeDialog}
          open={async (message) => {
            setActive(message.channel_id);
            closeDialog();
            await loadHistory(message.channel_id, message.seq + 1);
          }}
        />
      )}
      {dialog === 'invite' && (
        <Modal title="Bring your people." eyebrow="GROW SOMETHING GOOD" close={closeDialog}>
          <p className="modal-description">
            Share this node’s address. Your friend can create an identity and join your community.
          </p>
          <div className="copy-field">
            <code>{client?.base ?? nodeUrl}</code>
            <CopyButton text={client?.base ?? nodeUrl} />
          </div>
          {/localhost|127\.0\.0\.1/.test(client?.base ?? nodeUrl) && (
            <div className="info-box">
              <Server size={18} />
              <span>
                This node is running locally. To invite someone on another device, deploy it with a public
                HTTPS address and set RAEEN_ORIGINS.
              </span>
            </div>
          )}
          <div className="privacy-note">
            <ShieldCheck size={15} />
            Open registration is enabled on this MVP node.
          </div>
        </Modal>
      )}
      {dialog === 'about' && (
        <Modal title="A home for your people." eyebrow="THIS IS RAEEN" close={closeDialog}>
          <p className="modal-description">
            The best parts of the internet have always been the people. Raeen gives small communities a place
            to talk, build, and hang out on infrastructure they control.
          </p>
          <div className="about-features">
            <div>
              <Server size={20} />
              <span>
                <b>Your community, your node.</b>
                <small>Chat history stays in your SQLite database.</small>
              </span>
            </div>
            <div>
              <KeyRound size={20} />
              <span>
                <b>One identity. More places.</b>
                <small>Use the same signing key on independent Raeen nodes.</small>
              </span>
            </div>
            <div>
              <Sparkles size={20} />
              <span>
                <b>A little less noise.</b>
                <small>No ads, engagement feeds, or paid chat features.</small>
              </span>
            </div>
          </div>
          <div className="info-box">
            <Shield size={18} />
            <span>
              This is an early working MVP. Text and voice are not end-to-end encrypted. Nodes are
              independent; server-to-server federation and bridges are future work.
            </span>
          </div>
          <button className="primary-btn full-width" onClick={closeDialog}>
            Make yourself at home
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ExternalLink size={11} />;
}

function Welcome({
  identity,
  setIdentity,
  nodeUrl,
  connecting,
  error,
  connect,
}: {
  identity: Identity | null;
  setIdentity: (identity: Identity) => void;
  nodeUrl: string;
  connecting: boolean;
  error: string;
  connect: (url: string, identity: Identity) => Promise<void>;
}) {
  const [name, setName] = useState(identity?.name ?? ''),
    [url, setUrl] = useState(nodeUrl),
    [importing, setImporting] = useState(false),
    [password, setPassword] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [localError, setLocalError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <div className="welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="onboarding-layout">
        <div className="onboarding-card">
          <div className="onboarding-brand">
            <Logo />
            <span>raeen</span>
            <span className="beta-tag">preview</span>
          </div>
          <span className="eyebrow">LESS PLATFORM. MORE PLACE.</span>
          <h1 id="welcome-title">
            Your people.
            <br />
            <em>Your place.</em>
          </h1>
          <p>
            A home for good conversations.
            <br />
            Built around your community. Owned by you.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setLocalError('');
              setBusy(true);
              try {
                let key: Identity;
                if (importing) {
                  if (!file) throw new Error('Choose your encrypted identity backup.');
                  key = await importIdentity(file, password);
                  setName(key.name);
                } else {
                  key = identity ? { ...identity, name: name.trim() } : await createIdentity(name.trim());
                  await saveIdentity(key);
                }
                setIdentity(key);
                await connect(url, key);
              } catch (error) {
                setLocalError(errorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            {importing ? (
              <>
                <label>
                  Identity backup
                  <input
                    type="file"
                    accept=".json"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    required
                  />
                </label>
                <label>
                  Backup passphrase
                  <input
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </label>
              </>
            ) : (
              <label>
                What should we call you?
                <input
                  placeholder="Your display name"
                  autoComplete="nickname"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={32}
                  required
                />
              </label>
            )}
            <label>
              Community node
              <span className="input-with-icon">
                <Globe2 size={16} />
                <input
                  aria-label="Community node"
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  required
                />
              </span>
            </label>
            {(localError || error) && (
              <div className="form-error" role="alert">
                {localError || error}
              </div>
            )}
            <button className="primary-btn full-width" disabled={connecting || busy}>
              {connecting || busy
                ? 'Connecting to your community…'
                : identity && !importing
                  ? 'Welcome back'
                  : 'Make yourself at home'}
              <ArrowRight size={17} />
            </button>
          </form>
          <button
            className="import-link"
            onClick={() => {
              setImporting(!importing);
              setLocalError('');
            }}
          >
            {importing ? 'Create an identity instead' : 'Already have an identity? Import it'}
            {!importing && <Upload size={13} />}
          </button>
          <div className="onboarding-footer">
            <KeyRound size={14} />
            <span>
              Your identity is a key, not another password.
              <br />
              Back it up in Settings after joining.
            </span>
          </div>
        </div>
        <div className="onboarding-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-orbit orbit-three" />
          <div className="art-flower">✳</div>
          <span>
            good things
            <br />
            grow together.
          </span>
          <small>COMMUNITY, ON YOUR TERMS.</small>
        </div>
      </div>
    </div>
  );
}
function NodeDialog({
  current,
  connect,
  connecting,
  close,
  error,
}: {
  current: string;
  connect: (url: string) => Promise<void>;
  connecting: boolean;
  close: () => void;
  error: string;
}) {
  const [url, setUrl] = useState(current);
  return (
    <Modal title="Find your next place." eyebrow="CONNECT TO A COMMUNITY" close={close}>
      <p className="modal-description">
        Enter a Raeen node address. Your existing identity comes with you; each node keeps its own history and
        membership.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void connect(url);
        }}
      >
        <label>
          Node address
          <input
            type="url"
            placeholder="https://chat.your-community.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-btn full-width" disabled={connecting}>
          {connecting ? 'Connecting…' : 'Connect to node'}
          <ArrowRight size={16} />
        </button>
      </form>
    </Modal>
  );
}
function CreateChannelDialog({
  client,
  close,
  created,
}: {
  client: NodeClient;
  close: () => void;
  created: (channel: Channel) => Promise<void>;
}) {
  const [name, setName] = useState(''),
    [topic, setTopic] = useState(''),
    [kind, setKind] = useState<'text' | 'voice'>('text'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Room for something new." eyebrow="CREATE A CHANNEL" close={close}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            const channel = await client.post<Channel>('/api/channels', { name, topic, kind });
            await created(channel);
          } catch (error) {
            setError(errorMessage(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="segmented">
          <button type="button" className={kind === 'text' ? 'active' : ''} onClick={() => setKind('text')}>
            <Hash size={16} />
            Text
          </button>
          <button type="button" className={kind === 'voice' ? 'active' : ''} onClick={() => setKind('voice')}>
            <Volume2 size={16} />
            Voice
          </button>
        </div>
        <label>
          Channel name
          <input
            value={name}
            onChange={(event) =>
              setName(
                kind === 'text' ? event.target.value.toLowerCase().replaceAll(' ', '-') : event.target.value,
              )
            }
            placeholder={kind === 'text' ? 'the-next-big-thing' : 'A room to hang out'}
            maxLength={32}
            required
          />
        </label>
        <label>
          Topic <span className="optional">optional</span>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={160}
            placeholder="What’s this space for?"
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-btn full-width" disabled={busy}>
          {busy ? 'Creating…' : 'Create channel'}
          <Plus size={16} />
        </button>
      </form>
    </Modal>
  );
}
function SearchDialog({
  client,
  channels,
  close,
  open,
}: {
  client: NodeClient;
  channels: Channel[];
  close: () => void;
  open: (message: Message) => void;
}) {
  const [query, setQuery] = useState(''),
    [scope, setScope] = useState(''),
    [results, setResults] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await client.request<Message[]>(
          `/api/search?q=${encodeURIComponent(query)}${scope ? `&channel=${scope}` : ''}`,
          { signal: controller.signal },
        );
        setResults(result);
        setError('');
      } catch (error) {
        if (!controller.signal.aborted) setError(errorMessage(error));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, scope, client]);
  return (
    <Modal title="Find that conversation." eyebrow="SEARCH YOUR COMMUNITY" close={close} wide>
      <div className="search-input">
        <Search size={20} />
        <input
          aria-label="Search message history"
          placeholder="A phrase, a project, a very good idea…"
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        <kbd>esc</kbd>
      </div>
      <div className="search-filters">
        <select aria-label="Search channel" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="">All text channels</option>
          {channels
            .filter((channel) => channel.kind === 'text')
            .map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
        </select>
        <span>SQLite full-text search · on your node</span>
      </div>
      <div className="search-results">
        {error && <div className="form-error">{error}</div>}
        {busy ? (
          <div className="search-empty">Searching your history…</div>
        ) : !results.length ? (
          <div className="search-empty">
            <Search size={27} />
            <b>{query.trim() ? 'No conversations found.' : 'Good things are worth finding.'}</b>
            <p>
              {query.trim()
                ? 'Try a different word or search all channels.'
                : 'Search messages stored on this community’s node.'}
            </p>
          </div>
        ) : (
          <>
            <div className="results-label">
              {results.length}
              {results.length === 50 ? '+' : ''} results
            </div>
            {results.map((message) => (
              <button className="search-result" key={message.id} onClick={() => open(message)}>
                <div>
                  <Hash size={13} />
                  <b>{channels.find((channel) => channel.id === message.channel_id)?.name}</b>
                  <time>{new Date(message.created_at).toLocaleDateString()}</time>
                </div>
                <span className="search-result-author">{message.author.name}</span>
                <MessageText text={message.content} />
                <span className="search-result-open">
                  Open conversation
                  <ChevronRight size={13} />
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </Modal>
  );
}
function SettingsDialog({
  client,
  boot,
  identity,
  preferences,
  setPreferences,
  updateIdentity,
  refresh,
  notify,
  close,
  signOut,
}: {
  client: NodeClient;
  boot: Bootstrap;
  identity: Identity;
  preferences: Preferences;
  setPreferences: (preferences: Preferences) => void;
  updateIdentity: (identity: Identity) => Promise<void>;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  close: () => void;
  signOut: () => void;
}) {
  const [tab, setTab] = useState('you'),
    [name, setName] = useState(identity.name),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const action = async (work: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Make it feel like home." eyebrow="YOUR RAEEN" close={close} wide>
      <div className="settings-tabs">
        {[
          ['you', 'Your identity'],
          ['appearance', 'Appearance'],
          ['node', 'Community node'],
          ...(boot.user.role === 'owner' ? [['members', 'Roles']] : []),
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              setError('');
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'you' && (
        <div className="settings-page">
          <div className="profile-preview">
            <Avatar user={boot.user} />
            <div>
              <b>{boot.user.name}</b>
              <span>{boot.user.role} · portable identity</span>
            </div>
            <KeyRound size={23} />
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                await client.request('/api/profile', { method: 'PATCH', body: JSON.stringify({ name }) });
                await updateIdentity({ ...identity, name });
                notify('Your profile is updated.');
              });
            }}
          >
            <label>
              Display name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={32}
                required
              />
            </label>
            <button className="secondary-btn" disabled={busy}>
              Save profile
            </button>
          </form>
          <div className="settings-divider" />
          <h3>Keep a key to your home.</h3>
          <p className="settings-copy">
            Your signing key lives in this device’s IndexedDB. Download an encrypted backup to use the same
            identity elsewhere. Losing every copy means losing this identity.
          </p>
          <label>
            Backup passphrase
            <input
              type="password"
              autoComplete="new-password"
              placeholder="At least 10 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={10}
            />
          </label>
          <button
            className="secondary-btn"
            disabled={busy || password.length < 10}
            onClick={() =>
              void action(async () => {
                await exportIdentity(identity, password);
                setPassword('');
                notify('Encrypted identity backup downloaded.');
              })
            }
          >
            <Download size={16} />
            Download encrypted backup
          </button>
          <div className="public-key">
            <span>PUBLIC IDENTITY KEY</span>
            <code>{identity.public_key}</code>
            <CopyButton text={identity.public_key} />
          </div>
          <button className="signout-button" onClick={signOut}>
            <LogOut size={15} />
            Disconnect from this node
          </button>
        </div>
      )}
      {tab === 'appearance' && (
        <div className="settings-page">
          <h3>A little more you.</h3>
          <p className="settings-copy">These preferences stay on this device.</p>
          <label>Accent color</label>
          <div className="accent-options">
            {(['mint', 'lilac', 'sand'] as const).map((accent) => (
              <button
                key={accent}
                className={`accent-swatch swatch-${accent} ${preferences.accent === accent ? 'chosen' : ''}`}
                onClick={() => setPreferences({ ...preferences, accent })}
              >
                {preferences.accent === accent && <Check size={17} />}
                <span>{accent}</span>
              </button>
            ))}
          </div>
          <label className="toggle-label">
            <span>
              <b>Compact conversations</b>
              <small>A little less space between messages.</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.compact}
              onChange={(event) => setPreferences({ ...preferences, compact: event.target.checked })}
            />
          </label>
          <label className="toggle-label">
            <span>
              <b>Show community members</b>
              <small>Keep your people within view.</small>
            </span>
            <input
              type="checkbox"
              checked={preferences.members}
              onChange={(event) => setPreferences({ ...preferences, members: event.target.checked })}
            />
          </label>
        </div>
      )}
      {tab === 'node' && (
        <div className="settings-page">
          <div className="node-detail-heading">
            <span className="node-card-icon">
              <Server size={24} />
            </span>
            <div>
              <h3>{boot.node.name}</h3>
              <span>{client.base}</span>
            </div>
            <span className="pill">raeen/0.1</span>
          </div>
          <dl className="node-details">
            <div>
              <dt>Storage</dt>
              <dd>SQLite · WAL mode</dd>
            </div>
            <div>
              <dt>Messages stored</dt>
              <dd>{boot.message_count.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Members</dt>
              <dd>{boot.members.length}</dd>
            </div>
            <div>
              <dt>Voice relay</dt>
              <dd>{boot.node.voice_enabled ? 'LiveKit configured' : 'Awaiting setup'}</dd>
            </div>
            <div>
              <dt>Message encryption</dt>
              <dd>Transport only · no E2EE</dd>
            </div>
            <div>
              <dt>Registration</dt>
              <dd>Open</dd>
            </div>
          </dl>
          <h3>Connect your voice server.</h3>
          <p className="settings-copy">
            Set these on the node, then restart it. Use a LiveKit server you host or a managed LiveKit
            project. The client connects directly to the voice relay.
          </p>
          <pre className="setup-code">
            LIVEKIT_URL=wss://voice.example.com{'\n'}LIVEKIT_API_KEY=your-api-key{'\n'}
            LIVEKIT_API_SECRET=your-api-secret
          </pre>
          <div className="privacy-note">
            <Shield size={15} />
            Voice and text E2EE are not implemented in this MVP.
          </div>
          <div className="public-key">
            <span>NODE ID</span>
            <code>{boot.node.id}</code>
            <CopyButton text={boot.node.id} />
          </div>
        </div>
      )}
      {tab === 'members' && (
        <div className="settings-page">
          <h3>A little help keeping the place.</h3>
          <p className="settings-copy">
            Moderators can create channels and remove messages. Members can chat and react. The owner role
            stays with the node’s original owner.
          </p>
          <div className="role-members">
            {boot.members.map((member) => (
              <div key={member.id}>
                <Avatar user={member} size="small-avatar" />
                <b>{member.name}</b>
                {member.role === 'owner' ? (
                  <span className="pill">owner</span>
                ) : (
                  <select
                    aria-label={`Role for ${member.name}`}
                    value={member.role}
                    disabled={busy}
                    onChange={(event) => {
                      const role = event.target.value;
                      void action(async () => {
                        await client.request(`/api/members/${member.id}/role`, {
                          method: 'PATCH',
                          body: JSON.stringify({ role }),
                        });
                        await refresh();
                        notify('Community role updated.');
                      });
                    }}
                  >
                    <option value="member">Member</option>
                    <option value="moderator">Moderator</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}
