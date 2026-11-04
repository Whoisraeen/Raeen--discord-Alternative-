import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  Hash,
  Pencil,
  Send,
  SmilePlus,
  Trash2,
  X,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Channel, Message, User } from './types';

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export function Avatar({
  user,
  size = '',
  online,
}: {
  user: Pick<User, 'name' | 'id'>;
  size?: string;
  online?: boolean;
}) {
  const color = [...user.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 5;
  return (
    <span className={`avatar color-${color} ${size}`} aria-label={user.name}>
      {initials(user.name)}
      {online !== undefined && <i className={online ? 'online' : ''} />}
    </span>
  );
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'small' : ''}`} aria-label="Raeen">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M7 24V8h10c8 0 10 10 3 13l5 3h-8l-7-8h7c3 0 3-4 0-4h-4v12z" fill="currentColor" />
      </svg>
    </span>
  );
}
export function Modal({
  title,
  eyebrow,
  children,
  close,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  close?: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focus = () =>
      (
        dialog.current?.querySelector<HTMLElement>('input,textarea,select') ??
        dialog.current?.querySelector<HTMLElement>('button')
      )?.focus();
    focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && close) close();
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,a[href]',
        ) ?? [],
      );
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close?.();
      }}
    >
      <div
        ref={dialog}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-top">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          {close && (
            <button className="icon-btn modal-close" onClick={close} aria-label="Close dialog">
              <X size={19} />
            </button>
          )}
        </div>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="subtle-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : label}
    </button>
  );
}
function Inline({ text }: { text: string }) {
  const pieces = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|https?:\/\/[^\s<>]+)/g);
  return (
    <>
      {pieces.map((part, index) =>
        part.startsWith('`') ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : part.startsWith('**') ? (
          <strong key={index}>{part.slice(2, -2)}</strong>
        ) : /^https?:\/\//.test(part) ? (
          <a key={index} href={part} target="_blank" rel="noreferrer">
            {part}
            <ArrowUpRight size={11} />
          </a>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
export function MessageText({ text }: { text: string }) {
  return (
    <div className="message-text">
      {text.split(/(```[\s\S]*?```)/g).map((part, index) =>
        part.startsWith('```') ? (
          <pre key={index}>
            <code>{part.slice(3, -3).replace(/^[a-z]+\n/, '')}</code>
          </pre>
        ) : (
          <Inline key={index} text={part} />
        ),
      )}
    </div>
  );
}

const emojis = ['👍', '❤️', '🔥', '🎉', '👀', '✅'];
export function MessageCard({
  message,
  me,
  compact,
  onReply,
  onEdit,
  onDelete,
  onReact,
  highlight,
}: {
  message: Message;
  me: User;
  compact?: boolean;
  onReply: (m: Message) => void;
  onEdit: (m: Message, content: string) => Promise<void>;
  onDelete: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  highlight?: boolean;
}) {
  const [reactions, setReactions] = useState(false),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(message.content),
    [saving, setSaving] = useState(false);
  const isOwn = message.author.id === me.id;
  return (
    <article
      className={`message ${compact ? 'compact-message' : ''} ${highlight ? 'highlight' : ''}`}
      data-message-id={message.id}
    >
      <Avatar user={message.author} />
      <div className="message-body">
        {message.reply && (
          <div className="reply-quote">
            <CornerUpLeft size={13} />
            <b>{message.reply.author}</b>
            <span>{message.reply.content.slice(0, 140)}</span>
          </div>
        )}
        <div className="message-meta">
          <b>{message.author.name}</b>
          {message.author.role === 'owner' && <span className="role-tag">owner</span>}
          <time
            dateTime={new Date(message.created_at).toISOString()}
            title={new Date(message.created_at).toLocaleString()}
          >
            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
          {message.edited_at && <span className="edited">edited</span>}
        </div>
        {editing ? (
          <form
            className="edit-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaving(true);
              try {
                await onEdit(message, draft);
                setEditing(false);
              } catch {
                /* The app shows the error; preserve the edit for retry. */
              } finally {
                setSaving(false);
              }
            }}
          >
            <textarea
              autoFocus
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Edit message"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
              }}
            />
            <div>
              <button type="button" className="subtle-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="subtle-btn accent-text" disabled={saving || !draft.trim()}>
                Save changes
              </button>
            </div>
          </form>
        ) : (
          <MessageText text={message.content} />
        )}
        {message.reactions.length > 0 && (
          <div className="reactions">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                className={reaction.users.split(',').includes(me.id) ? 'selected' : ''}
                onClick={() => onReact(message, reaction.emoji)}
                aria-label={`${reaction.emoji} reaction, ${reaction.count}`}
                aria-pressed={reaction.users.split(',').includes(me.id)}
              >
                {reaction.emoji}
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {!editing && (
        <div className="message-tools">
          <button
            className="icon-btn"
            title="Add reaction"
            aria-label="Add reaction"
            onClick={() => setReactions(!reactions)}
          >
            <SmilePlus size={16} />
          </button>
          <button className="icon-btn" title="Reply" aria-label="Reply" onClick={() => onReply(message)}>
            <CornerUpLeft size={16} />
          </button>
          {isOwn && (
            <button
              className="icon-btn"
              title="Edit message"
              aria-label="Edit message"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            >
              <Pencil size={15} />
            </button>
          )}
          {(isOwn || me.role !== 'member') && (
            <button
              className="icon-btn danger"
              title="Delete message"
              aria-label="Delete message"
              onClick={() => onDelete(message)}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
      {reactions && (
        <div className="emoji-popover">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              aria-label={`React ${emoji}`}
              onClick={() => {
                onReact(message, emoji);
                setReactions(false);
              }}
            >
              {emoji}
            </button>
          ))}
          <button aria-label="Close reactions" onClick={() => setReactions(false)}>
            <X size={13} />
          </button>
        </div>
      )}
    </article>
  );
}

export function ChatHistory({
  channel,
  messages,
  me,
  compact,
  hasMore,
  loading,
  loadMore,
  onReply,
  onEdit,
  onDelete,
  onReact,
}: {
  channel: Channel;
  messages: Message[];
  me: User;
  compact: boolean;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => Promise<void>;
  onReply: (m: Message) => void;
  onEdit: (m: Message, content: string) => Promise<void>;
  onDelete: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null),
    atBottom = useRef(true),
    previousCount = useRef(0),
    previousChannel = useRef('');
  const [jump, setJump] = useState(false);
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compact ? 64 : 86),
    overscan: 10,
    getItemKey: (index) => messages[index].id,
  });
  useEffect(() => {
    const changedChannel = previousChannel.current !== channel.id;
    const grew = messages.length > previousCount.current;
    if ((changedChannel || atBottom.current) && (grew || changedChannel)) {
      requestAnimationFrame(() => {
        const scroll = scrollRef.current;
        if (scroll) scroll.scrollTop = scroll.scrollHeight;
      });
    } else if (grew) setJump(true);
    previousCount.current = messages.length;
    previousChannel.current = channel.id;
  }, [messages, channel.id]);
  const jumpToBottom = () => {
    if (scrollRef.current)
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setJump(false);
  };
  return (
    <div className="history-wrap">
      <div
        className="chat-history"
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (el) {
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
            if (atBottom.current) setJump(false);
          }
        }}
      >
        <div className="channel-welcome">
          <span className="channel-large-icon">
            <Hash size={31} strokeWidth={1.7} />
          </span>
          <span className="eyebrow">THE START OF SOMETHING GOOD</span>
          <h1>Welcome to #{channel.name}</h1>
          <p>{channel.topic}</p>
          <div className="welcome-chips">
            <span>
              <CheckCheck size={13} />
              Your node. Your history.
            </span>
            <span>No algorithms. Just people.</span>
          </div>
          <div className="welcome-orbit" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>✳</span>
          </div>
        </div>
        <div className="date-divider">
          <span>
            {messages.length
              ? new Date(messages[0].created_at).toLocaleDateString([], {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'A fresh start'}
          </span>
        </div>
        {hasMore && (
          <button
            className="load-more"
            disabled={loading}
            onClick={async () => {
              const el = scrollRef.current;
              const height = el?.scrollHeight ?? 0;
              const top = el?.scrollTop ?? 0;
              await loadMore();
              requestAnimationFrame(() => {
                if (el) el.scrollTop = top + el.scrollHeight - height;
              });
            }}
          >
            Load earlier messages
          </button>
        )}
        {!messages.length && (
          <div className="empty-conversation">
            <span className="small-spark">✳</span>
            <div>
              <b>{loading ? 'Getting the conversation…' : 'Every community starts with a hello.'}</b>
              <p>
                {loading
                  ? 'Fetching saved messages from your node.'
                  : 'Send the first message. Invite your people. Make this place yours.'}
              </p>
            </div>
          </div>
        )}
        <div className="virtual-messages" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
            >
              <MessageCard
                message={messages[item.index]}
                me={me}
                compact={compact}
                onReply={onReply}
                onEdit={onEdit}
                onDelete={onDelete}
                onReact={onReact}
              />
            </div>
          ))}
        </div>
      </div>
      {jump && (
        <button className="jump-button" onClick={jumpToBottom}>
          <ArrowDown size={14} />
          New messages
        </button>
      )}
    </div>
  );
}

export function Composer({
  channel,
  send,
  reply,
  clearReply,
  onTyping,
  disabled,
  typing,
}: {
  channel: Channel;
  send: (content: string) => Promise<boolean>;
  reply: Message | null;
  clearReply: () => void;
  onTyping: () => void;
  disabled: boolean;
  typing: string[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({}),
    [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const draft = drafts[channel.id] ?? '';
  useEffect(() => {
    input.current?.focus();
  }, [channel.id, reply]);
  const setDraft = (value: string) => setDrafts((prev) => ({ ...prev, [channel.id]: value }));
  const submit = async () => {
    if (!draft.trim() || sending || disabled) return;
    const channelId = channel.id;
    setSending(true);
    try {
      if (await send(draft)) {
        setDrafts((prev) => ({ ...prev, [channelId]: '' }));
        clearReply();
      }
    } finally {
      setSending(false);
      input.current?.focus();
    }
  };
  return (
    <div className="composer-wrap">
      {reply && (
        <div className="reply-bar">
          <CornerUpLeft size={14} />
          <span>
            Replying to <b>{reply.author.name}</b>
          </span>
          <button className="icon-btn" onClick={clearReply} aria-label="Cancel reply">
            <X size={15} />
          </button>
        </div>
      )}
      <form
        className={`composer ${reply ? 'with-reply' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="composer-hash">
          <Hash size={21} />
        </span>
        <textarea
          ref={input}
          aria-label={`Message #${channel.name}`}
          placeholder={`Message #${channel.name}`}
          value={draft}
          maxLength={4000}
          rows={1}
          onChange={(e) => {
            setDraft(e.target.value);
            onTyping();
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
            if (e.key === 'Escape') clearReply();
          }}
        />
        <button
          type="button"
          className="icon-btn composer-emoji"
          title="Add a wave"
          aria-label="Add a wave"
          onClick={() => {
            setDraft(`${draft} 👋`);
            input.current?.focus();
          }}
        >
          <SmilePlus size={19} />
        </button>
        <button
          className="send-button"
          disabled={disabled || sending || !draft.trim()}
          aria-label="Send message"
          title="Send message"
        >
          <Send size={17} />
        </button>
      </form>
      <div className="composer-foot">
        <span>
          {typing.length ? (
            `${typing.join(', ')} ${typing.length > 1 ? 'are' : 'is'} typing…`
          ) : (
            <>
              <span className="tiny-dot" />A little more human. A little less noise.
            </>
          )}
        </span>
        <span>
          {draft.length > 3500 && `${draft.length}/4000 · `}
          <kbd>↵</kbd> to send <span className="foot-separator">·</span> <kbd>shift ↵</kbd> for a new line
        </span>
      </div>
    </div>
  );
}
