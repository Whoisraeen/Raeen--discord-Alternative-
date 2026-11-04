export type User = { id: string; name: string; role: 'owner' | 'moderator' | 'member'; public_key: string };
export type Channel = { id: string; name: string; topic: string; kind: 'text' | 'voice'; position: number };
export type Reaction = { emoji: string; count: number; users: string };
export type Message = {
  seq: number;
  id: string;
  channel_id: string;
  content: string;
  created_at: number;
  edited_at: number | null;
  author: User;
  reply: { id: string; content: string; author: string } | null;
  reactions: Reaction[];
};
export type NodeInfo = { id: string; name: string; voice_enabled: boolean };
export type Bootstrap = {
  user: User;
  channels: Channel[];
  members: User[];
  online: string[];
  message_count: number;
  node: NodeInfo;
};
export type Identity = { privateKey: CryptoKey; publicKey: CryptoKey; public_key: string; name: string };
export type NodeEvent = {
  type: string;
  message?: Message;
  id?: string;
  channel_id?: string;
  online?: string[];
  user_id?: string;
  name?: string;
};
