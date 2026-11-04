import { base64url } from './identity';
import type { Identity, NodeInfo, User } from './types';

export const defaultNode =
  import.meta.env.VITE_NODE_URL ||
  (location.protocol.startsWith('http') && !location.hostname.includes('tauri.localhost')
    ? location.origin
    : 'http://127.0.0.1:3001');
export function normalizeNode(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    throw new Error('Use the node’s root URL, such as https://chat.example.com.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Remote nodes must use HTTPS to protect your session and messages.');
  return url.origin;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export class NodeClient {
  token = '';
  constructor(public base: string) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ApiError(body.error || `The node returned an error (${response.status}).`, response.status);
    }
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  post<T>(path: string, body: unknown): Promise<T> {
    return this.request(path, { method: 'POST', body: JSON.stringify(body) });
  }
  async signIn(identity: Identity): Promise<User> {
    const node = await this.request<NodeInfo>('/api/node');
    const challenge = await this.post<{ id: string; message: string }>('/api/auth/challenge', {
      public_key: identity.public_key,
    });
    const expected = `Raeen sign-in v1\nNode: ${node.id}\nKey: ${identity.public_key}\nNonce: `;
    if (
      !challenge.message.startsWith(expected) ||
      !/^.{72}\nExpires: \d{13}$/.test(challenge.message.slice(expected.length))
    )
      throw new Error('The node returned an invalid identity challenge.');
    const signature = base64url(
      await crypto.subtle.sign('Ed25519', identity.privateKey, new TextEncoder().encode(challenge.message)),
    );
    const session = await this.post<{ token: string; user: User }>('/api/auth/verify', {
      challenge_id: challenge.id,
      signature,
      name: identity.name,
    });
    this.token = session.token;
    return session.user;
  }
  socket(): WebSocket {
    const url = new URL('/ws', this.base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return new WebSocket(url);
  }
}
