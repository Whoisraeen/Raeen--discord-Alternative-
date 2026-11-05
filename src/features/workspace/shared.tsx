import { useEffect, useState, type ReactNode } from 'react';
import type { Bootstrap, Channel, Message } from '../../types';
export type Screen = 'home' | 'people' | 'planner' | 'node' | 'budget' | 'appearance' | 'guide';
export type WorkspaceProps = {
  boot: Bootstrap;
  histories: Record<string, Message[]>;
  nodeUrl: string;
  connection: 'connecting' | 'online' | 'offline';
  onChannel: (channel: Channel) => void;
  onInvite: () => void;
  onSettings: () => void;
  onReturn: () => void;
  notify: (message: string) => void;
};
export function useLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? 'null') ?? initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}
export function Panel({
  title,
  note,
  children,
  className = '',
}: {
  title: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`hub-panel ${className}`}>
      <div className="hub-panel-heading">
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {children}
    </section>
  );
}
export function download(name: string, value: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function loadedMessages(p: WorkspaceProps) {
  return Object.values(p.histories)
    .flat()
    .sort((a, b) => a.seq - b.seq);
}
export const art = ['/canvas/commons.svg', '/canvas/build.svg', '/canvas/lounge.svg'];
