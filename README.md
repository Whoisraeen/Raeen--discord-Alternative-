# Raeen

Your people, your place. A working, self-hostable community chat MVP with a React client, Rust node, and Tauri desktop shell.

## Run locally

Tested with Node.js 24, npm 11, and Rust 1.99 on macOS (Apple Silicon).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The first Rust build takes a little longer. Create your identity and join the local node. The first identity to register becomes its owner unless `RAEEN_OWNER_KEY` is set. Another browser profile can join as a second member.

The dev command starts the node on port 3001 and Vite on port 5173, and stops both on exit. Chat data lives in `data/raeen.db`. Identity keys live in the client’s IndexedDB. Back up your identity from **Settings → Your identity**; the backup uses a passphrase, PBKDF2-SHA256, and AES-256-GCM.

For the built client served directly by the Rust node:

```sh
npm run build
npm start
# Open http://127.0.0.1:3001
```

These are different browser origins: import your encrypted identity backup if you want to use the same identity in both. The server must run with the project root as its working directory so it can find `dist/`.

## What works

- Portable Ed25519 identity: local key generation, one-use signed challenges, and encrypted import/export. A node never receives the private key.
- Persistent channels and chat in SQLite WAL mode, with cursor pagination and a virtualized message list.
- Live message delivery, online presence, typing, unread counts, reconnect, and session recovery after a node restart.
- Per-channel drafts, retry-safe sends, replies, edits, deletes, six reactions, inline code, fenced code, bold text, and links.
- SQLite FTS5 search across the node’s history or one channel.
- Owner, moderator, and member roles, with server-enforced bitwise permissions and owner-managed role changes.
- Responsive layout, three accent themes, compact mode, and a collapsible member list.
- LiveKit integration: node-issued room-scoped tokens, microphone, mute/deafen, remote audio, and browser screen sharing when a relay is configured.
- A Tauri v2 shell, Docker build, persistent Compose volume, and a documented draft protocol.

The UI has no fake users, fake chat, or simulated connection metrics. Fonts are bundled locally. No analytics or external font requests are included.

## Desktop

```sh
npm run desktop
```

This starts the local node and Vite as well as the Tauri shell. Stop an existing `npm run dev` first so the ports are available.

```sh
npm run desktop:build -- --bundles app
```

On macOS the unsigned application is produced at `src-tauri/target/release/bundle/macos/Raeen.app`. A packaged client connects to `http://127.0.0.1:3001` by default; start a node separately or enter a public HTTPS node URL at sign-in. The node is separate from the desktop app. Windows/Linux need Tauri’s platform prerequisites. Native DSP, global push-to-talk, OS audio loopback, and rich presence are future work; current voice uses the webview/browser’s WebRTC stack.

## Configure the node

The Rust binary reads environment variables; it does **not** automatically load `.env`. Compose does load `.env` for interpolation. See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `RAEEN_BIND` | `127.0.0.1:3001` | Listen address |
| `RAEEN_DATABASE` | `data/raeen.db` | SQLite path |
| `RAEEN_NAME` | `The Commons` | Community name |
| `RAEEN_OWNER_KEY` | unset | Reserve ownership for this public key on initial registration |
| `RAEEN_ORIGINS` | local dev and Tauri origins | Comma-separated, exact allowed browser origins; no wildcard |
| `LIVEKIT_URL` | unset | Browser-reachable LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | unset | LiveKit API key |
| `LIVEKIT_API_SECRET` | unset | LiveKit API secret, held only by the node |

Example public deployment, behind a TLS reverse proxy:

```sh
export RAEEN_BIND=0.0.0.0:3001
export RAEEN_NAME='Your Community'
export RAEEN_ORIGINS='https://chat.example.com,tauri://localhost,http://tauri.localhost,https://tauri.localhost'
export RAEEN_OWNER_KEY='your-public-identity-key-from-settings'
npm start
```

Set the owner key **before** making a fresh node publicly reachable. Setting it later does not transfer ownership away from an existing owner. The MVP has open registration, and every registered member can read all text channels. It is intended for small, trusted communities; private/invite-only channels, bans, and production abuse controls are not implemented. Remote node URLs in the client require HTTPS; loopback HTTP is allowed for development.

The reverse proxy must forward WebSocket upgrades for `/ws`, preserve `Authorization`, and provide HTTPS. Allowed origins are exact, including the scheme and port. Do not expose the local development LiveKit credentials publicly.

## Voice

Run your own LiveKit server or use a managed LiveKit project. Export its URL, key, and secret before starting the Raeen node. Restart the node after configuration changes. The UI then enables **Join voice channel**. Media goes directly between the client and LiveKit; the Rust chat node only issues scoped, five-minute join tokens. Those tokens limit admission time, not the duration of an established call.

Optional **local-only** Compose relay:

```sh
LIVEKIT_URL=ws://localhost:7880 \
LIVEKIT_API_KEY=devkey \
LIVEKIT_API_SECRET=secret \
docker compose --profile voice up --build
```

Open http://localhost:3001. `--dev` LiveKit credentials are for local testing. Public hosting needs a real LiveKit deployment with TLS, appropriate UDP/TCP/TURN ports, and a browser-reachable advertised address. Screen capture, application audio, and codecs depend on the browser/OS; microphone permissions are requested when joining.

**Encryption:** this MVP provides transport encryption when deployed behind HTTPS/WSS and WebRTC’s normal transport protection. Text is plaintext in the node’s database. Voice does not enable LiveKit E2EE. The current search is **node-side FTS5**, not local-first encrypted search.

## Docker

```sh
docker compose up --build
# Open http://localhost:3001
```

The container runs as a non-root user, binds the host port to loopback, and saves SQLite in the `raeen-data` volume. Place a TLS reverse proxy in front for public use and set `RAEEN_ORIGINS`. Back up the database with SQLite’s online backup command, or stop the node before copying the database and its WAL files. Docker is not installed in the development environment, so the image and Compose definitions have not been executed here.

## Verification

```sh
npm run build
cargo test -p raeen-node
npm test
npx playwright install chromium
npm run test:ui
cargo check --manifest-path src-tauri/Cargo.toml
```

Protocol integration tests run a real node against a temporary database and cover forged/replayed signatures, two-client live delivery, idempotency, permissions and role revocation, reply boundaries, FTS edit/delete consistency, token scoping, and restart persistence. Browser tests run the production client against another isolated temporary node and cover chat, replies, reactions, editing, channels, search, theme preferences, encrypted identity recovery, and mobile layout. Test data does not enter your development database.

LiveKit token generation and the unconfigured voice UI are tested. A real media call and cross-platform native media capture still need verification with a running relay. RAM, CPU, throughput, and voice latency claims need benchmarks; this project does not assert the estimates in the original proposal.

## Protocol and next steps

See [docs/protocol.md](docs/protocol.md) for `raeen/0.1` and [docs/architecture.md](docs/architecture.md) for trust boundaries and remaining work. This is a custom, draft client/node protocol, not a Matrix-compatible implementation. Clients can reuse an identity across independent nodes; nodes do not federate or replicate history with one another.

Priority next work: invite-only onboarding and moderation; a reviewed device/recovery model and standard E2EE implementation; durable event replay and read state; local encrypted search; attachments with quotas; hardened and measured voice across platforms; federation and bridges.

## License

AGPL-3.0-only. Third-party dependencies and bundled fonts retain their respective licenses.
