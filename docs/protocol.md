# Raeen protocol 0.1

Status: draft, implemented in `server/src/main.rs`. This document describes this MVP’s actual behavior. It makes no interoperability claim with Matrix, Discord, ActivityPub, or other protocols. `GET /api/node` advertises `raeen/0.1`.

## Transport and identity

REST uses JSON over HTTPS (HTTP allowed on loopback). Authenticated endpoints require `Authorization: Bearer <session-token>`. A browser WebSocket connects to `/ws`, then authenticates in its first text frame within five seconds. CORS and WebSocket Origin validation use the node’s exact origin allowlist. Nonbrowser clients may connect without an Origin header.

An identity is an Ed25519 key pair. Public keys and signatures use unpadded base64url. Public keys are 32 bytes, signatures 64 bytes. The node stores the public key and node-local user ID. Nodes never receive the private key. Display names are not unique handles.

### Sign-in

1. Read `GET /api/node` for the node UUID.
2. `POST /api/auth/challenge` with `{ "public_key": "..." }`.
3. Validate and sign the exact UTF-8 `message` from the challenge using Ed25519. The message is:

```text
Raeen sign-in v1
Node: <node UUID>
Key: <public key>
Nonce: <two concatenated UUIDv4 strings>
Expires: <Unix milliseconds>
```

4. `POST /api/auth/verify` with `{ "challenge_id": "...", "signature": "...", "name": "Avery" }`.
5. Receive `{ "token": "...", "user": { ... }, "expires_at": 1793822400000 }`.

Challenges expire after 60 seconds and are single-use, including failed verification attempts. Sessions expire after seven days or a node restart. A client with a stored key can prove its identity again without asking for a password. Verification creates the membership if necessary and updates the display name. Names have 2–32 characters and cannot contain control characters.

The first identity becomes owner unless `RAEEN_OWNER_KEY` reserves that role. Public registration remains open in 0.1. Possession of one key on multiple nodes is portable identity; user IDs, roles, and memberships are local to each node.

## Resources

`User`: `id`, `name`, `role`, `public_key`. Roles are `owner`, `moderator`, `member`.

`Channel`: `id`, `name`, `topic`, `kind` (`text` or `voice`), `position`.

`Message`: `id`, `seq`, `channel_id`, `content`, `created_at`, `edited_at` (nullable), `author` (User), `reply` (nullable), `reactions`.

`reply`: `id`, `content`, `author` (display name). A reply references a live message in the same channel. Deleting the target clears the reference.

`Reaction`: `emoji`, `count`, `users` (comma-separated node-local user UUIDs). The client can detect its own reaction. This representation is provisional and should become a typed array in a future protocol version.

All timestamps are Unix milliseconds except standard JWT timestamps, which are Unix seconds. Message order uses `seq`, not timestamps. Author details reflect the current node profile when history is fetched; existing cached messages refresh on history reload.

## REST endpoints

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Public liveness and app version |
| GET | `/api/node` | Public name, ID, protocol, voice capability, encryption and registration status |
| POST | `/api/auth/challenge` | Create a signed-login challenge |
| POST | `/api/auth/verify` | Prove identity and create a session |
| POST | `/api/auth/logout` | Revoke the supplied session; 204 |
| GET | `/api/bootstrap` | Current user, channels, members, online user IDs, message count and node metadata |
| PATCH | `/api/profile` | `{ "name": "..." }`, returns User |
| POST | `/api/channels` | `{ "name": "...", "topic": "...", "kind": "text" }`, returns Channel; owner/moderator |
| GET | `/api/channels/{id}/messages` | Last 60 messages in ascending sequence order |
| GET | `/api/channels/{id}/messages?before=123` | Up to 60 messages strictly before this sequence |
| POST | `/api/channels/{id}/messages` | Send to text channel; returns Message |
| PATCH | `/api/messages/{id}` | `{ "content": "..." }`; author only; returns Message |
| DELETE | `/api/messages/{id}` | Author, moderator, or owner; 204 |
| POST | `/api/messages/{id}/reactions` | `{ "emoji": "🎉" }`; toggle caller’s reaction; returns Message |
| GET | `/api/search?q=hello&channel=optional-id` | Literal terms combined with AND, newest first, up to 50 messages |
| PATCH | `/api/members/{id}/role` | `{ "role": "moderator" }` or `member`; owner only; 204 |
| POST | `/api/voice/token` | `{ "channel_id": "..." }`; returns LiveKit URL, join JWT, and `e2ee: false` |

Except the first four public endpoints, endpoints require a session. Mutations return 200 with JSON unless marked 204. Errors return `{ "error": "Human-readable explanation" }` with HTTP 400, 401, 403, 404, 409, 429, 500, or 503 as appropriate. Voice returns 503 when unconfigured.

Sending a message:

```json
{
  "content": "A good place to start.",
  "client_id": "b4e6fba1-dc74-4c36-8007-e80ce352b180",
  "reply_to": null
}
```

`client_id` must be a UUID generated by the sending client. Repeating the same ID for the same user and channel returns the existing message without another event. Do not reuse it for a different message. Messages contain 1–4,000 characters after trimming. The node accepts plain text; markdown rendering is a client feature. Supported reactions: 👍 ❤️ 🔥 🎉 👀 ✅.

## Permissions

| Bit | Capability | Member | Moderator | Owner |
| --- | --- | --- | --- | --- |
| 1 | Read channels/history | yes | yes | yes |
| 2 | Send messages | yes | yes | yes |
| 4 | Create channels | no | yes | yes |
| 8 | Delete another member’s message | no | yes | yes |
| 16 | Assign moderator/member roles | no | no | yes |

No role may edit another identity’s message. The owner cannot be demoted via this API. There are no channel-specific access rules in 0.1.

## WebSocket

First client frame:

```json
{ "type": "authenticate", "token": "<session token>" }
```

Successful authentication receives `{ "type": "ready" }`. Invalid or missing first-frame authentication closes the socket. Authentication is rechecked during the heartbeat; revocation/expiration closes an existing socket by its next 25-second heartbeat. Socket frames are limited to 8 KiB. Ping/pong is used for connection liveness.

Client typing frame:

```json
{ "type": "typing", "channel_id": "default-0" }
```

The server throttles typing to approximately one event per identity connection every two seconds. Clients expire typing indicators locally after about five seconds.

| Server event | Fields | Meaning |
| --- | --- | --- |
| `ready` | none | Authentication accepted; fetch current state |
| `presence` | `online: string[]` | Current connected user IDs |
| `message_created` | `message` | New persisted message |
| `message_updated` | `message` | Content or reactions changed |
| `message_deleted` | `id`, `channel_id` | Message removed |
| `history_changed` | `channel_id` | Reload visible history, e.g. changed reply quote |
| `members_changed` | none | Reload bootstrap/profile/roles |
| `channels_changed` | none | Reload bootstrap/channels |
| `typing` | `channel_id`, `user_id`, `name` | Temporary typing indicator |
| `resync` | none | Receiver fell behind the event buffer; fetch current state |

Events are node-wide because every registered member has the same read boundary. Delivery is ephemeral and has no durable cursor, offline mailbox, or read receipt. On reconnect, the client proves identity again if needed, opens a new socket, fetches bootstrap, and fetches active-channel history. REST and WebSocket message copies must be deduplicated by message UUID.

## Voice and confidentiality

The node issues LiveKit HS256 tokens scoped to `node_id:channel_id`, with participant identity and name, publish/subscribe/data grants, a five-second clock allowance, and a five-minute admission window. Tokens do not expire an established call. Only voice channel IDs are accepted. The LiveKit secret stays on the node.

Chat and search indexes are plaintext at rest. Media uses ordinary WebRTC transport encryption with the configured SFU. Neither text nor voice is end-to-end encrypted in 0.1. Bridges, federation, attachments, private channels, and native audio processing are not part of this protocol version.
