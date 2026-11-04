import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

let directory,
  port,
  base,
  child,
  output = '';
const keys = () => {
  const pair = generateKeyPairSync('ed25519');
  return { ...pair, public_key: pair.publicKey.export({ format: 'jwk' }).x };
};
async function start({ database = 'test.db', ownerKey = '', voice = true } = {}) {
  child = spawn(resolve('target/debug/raeen-node'), [], {
    env: {
      ...process.env,
      RAEEN_BIND: `127.0.0.1:${port}`,
      RAEEN_DATABASE: join(directory, database),
      RAEEN_OWNER_KEY: ownerKey,
      RAEEN_ORIGINS: `http://127.0.0.1:${port},https://allowed.test`,
      LIVEKIT_URL: voice ? 'ws://127.0.0.1:7880' : '',
      LIVEKIT_API_KEY: 'test-key',
      LIVEKIT_API_SECRET: 'test-secret-for-integration-only',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(output);
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Node did not start: ${output}`);
}
async function stop() {
  if (child?.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
}
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'raeen-protocol-'));
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  base = `http://127.0.0.1:${port}`;
  await start();
});
after(async () => {
  await stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function request(path, { token, body, method = body ? 'POST' : 'GET', status = 200 } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? undefined : await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}\n${output}`);
  return data;
}
async function challenge(pair) {
  return request('/api/auth/challenge', { body: { public_key: pair.public_key } });
}
async function login(pair, name) {
  const proof = await challenge(pair);
  return request('/api/auth/verify', {
    body: {
      challenge_id: proof.id,
      signature: sign(null, Buffer.from(proof.message), pair.privateKey).toString('base64url'),
      name,
    },
  });
}
async function socket(token) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  const queue = [],
    waiters = [];
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    queue.push(data);
    for (const notify of waiters) notify();
  });
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'authenticate', token }));
  const wait = async (type, predicate = () => true) => {
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      const index = queue.findIndex((event) => event.type === type && predicate(event));
      if (index !== -1) return queue.splice(index, 1)[0];
      await Promise.race([
        new Promise((resolve) => waiters.push(resolve)),
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);
      waiters.length = 0;
    }
    throw new Error(`Missing ${type}; queue=${JSON.stringify(queue)}`);
  };
  await wait('ready');
  return { ws, wait, close: () => ws.close() };
}

test('signed identities, live chat, permissions, search, and persistence work together', async (t) => {
  const ownerKey = keys(),
    memberKey = keys();
  let owner, member, general, second, original, reply;
  await t.test('auth rejects forged signatures, replay, and unauthenticated reads', async () => {
    const proof = await challenge(ownerKey);
    const body = {
      challenge_id: proof.id,
      signature: sign(null, Buffer.from(proof.message), memberKey.privateKey).toString('base64url'),
      name: 'Owner',
    };
    await request('/api/auth/verify', { body, status: 401 });
    await request('/api/auth/verify', {
      body: {
        ...body,
        signature: sign(null, Buffer.from(proof.message), ownerKey.privateKey).toString('base64url'),
      },
      status: 401,
    });
    owner = await login(ownerKey, 'Avery');
    member = await login(memberKey, 'River');
    assert.equal(owner.user.role, 'owner');
    assert.equal(member.user.role, 'member');
    await request('/api/bootstrap', { status: 401 });
    const bootstrap = await request('/api/bootstrap', { token: owner.token });
    assert.equal(bootstrap.members.length, 2);
    general = bootstrap.channels.find((c) => c.name === 'general');
    second = bootstrap.channels.find((c) => c.name === 'build-log');
    const replay = await challenge(ownerKey);
    const verifyBody = {
      challenge_id: replay.id,
      signature: sign(null, Buffer.from(replay.message), ownerKey.privateKey).toString('base64url'),
      name: 'Avery',
    };
    await request('/api/auth/verify', { body: verifyBody });
    await request('/api/auth/verify', { body: verifyBody, status: 401 });
  });
  await t.test('broadcasts to two clients and deduplicates retried sends', async () => {
    const a = await socket(owner.token),
      b = await socket(member.token);
    try {
      await a.wait(
        'presence',
        (event) => event.online.includes(owner.user.id) && event.online.includes(member.user.id),
      );
      const body = { content: 'Shipping the prototype — **together**.', client_id: randomUUID() };
      original = await request(`/api/channels/${general.id}/messages`, { token: member.token, body });
      const event = await a.wait('message_created');
      assert.equal(event.message.id, original.id);
      await b.wait('message_created');
      const duplicate = await request(`/api/channels/${general.id}/messages`, { token: member.token, body });
      assert.equal(duplicate.id, original.id);
      const messages = await request(`/api/channels/${general.id}/messages`, { token: owner.token });
      assert.equal(messages.length, 1);
      a.ws.send(JSON.stringify({ type: 'typing', channel_id: general.id }));
      const typing = await b.wait('typing');
      assert.equal(typing.user_id, owner.user.id);
      await request(`/api/channels/${general.id}/messages`, {
        token: member.token,
        body: { content: ' ', client_id: randomUUID() },
        status: 400,
      });
    } finally {
      a.close();
      b.close();
    }
  });
  await t.test('enforces roles and immediately applies a role change to an existing session', async () => {
    const body = { name: 'project-room', topic: 'A place to build', kind: 'text' };
    await request('/api/channels', { token: member.token, body, status: 403 });
    await request(`/api/members/${member.user.id}/role`, {
      token: owner.token,
      method: 'PATCH',
      body: { role: 'moderator' },
      status: 204,
    });
    await request('/api/channels', { token: member.token, body });
    await request(`/api/members/${owner.user.id}/role`, {
      token: member.token,
      method: 'PATCH',
      body: { role: 'member' },
      status: 403,
    });
    await request(`/api/members/${member.user.id}/role`, {
      token: owner.token,
      method: 'PATCH',
      body: { role: 'member' },
      status: 204,
    });
    await request('/api/channels', { token: member.token, body: { ...body, name: 'denied' }, status: 403 });
    await request(`/api/messages/${original.id}`, {
      token: owner.token,
      method: 'PATCH',
      body: { content: 'Owner changed someone else’s words' },
      status: 403,
    });
  });
  await t.test('stores replies and reactions, paginates, and keeps the FTS index consistent', async () => {
    reply = await request(`/api/channels/${general.id}/messages`, {
      token: owner.token,
      body: { content: 'A careful follow-up', reply_to: original.id, client_id: randomUUID() },
    });
    assert.equal(reply.reply.author, 'River');
    await request(`/api/channels/${second.id}/messages`, {
      token: owner.token,
      body: { content: 'Cross-channel reply', reply_to: original.id, client_id: randomUUID() },
      status: 400,
    });
    const reacted = await request(`/api/messages/${original.id}/reactions`, {
      token: owner.token,
      body: { emoji: '🎉' },
    });
    assert.equal(reacted.reactions[0].count, 1);
    const unreacted = await request(`/api/messages/${original.id}/reactions`, {
      token: owner.token,
      body: { emoji: '🎉' },
    });
    assert.equal(unreacted.reactions.length, 0);
    let hits = await request('/api/search?q=prototype', { token: owner.token });
    assert.equal(hits[0].id, original.id);
    await request(`/api/messages/${original.id}`, {
      token: member.token,
      method: 'PATCH',
      body: { content: 'Launching with a searchable constellation.' },
    });
    hits = await request('/api/search?q=prototype', { token: owner.token });
    assert.equal(hits.length, 0);
    hits = await request('/api/search?q=constellation', { token: owner.token });
    assert.equal(hits.length, 1);
    hits = await request(`/api/search?q=constellation&channel=${second.id}`, { token: owner.token });
    assert.equal(hits.length, 0);
    const earlier = await request(`/api/channels/${general.id}/messages?before=${reply.seq}`, {
      token: owner.token,
    });
    assert.deepEqual(
      earlier.map((m) => m.id),
      [original.id],
    );
    await request(`/api/messages/${original.id}`, { token: owner.token, method: 'DELETE', status: 204 });
    hits = await request('/api/search?q=constellation', { token: owner.token });
    assert.equal(hits.length, 0);
    const history = await request(`/api/channels/${general.id}/messages`, { token: owner.token });
    assert.equal(history[0].reply, null);
  });
  await t.test('voice grants are scoped to a voice channel and a short-lived participant', async () => {
    const grant = await request('/api/voice/token', {
      token: member.token,
      body: { channel_id: 'default-3' },
    });
    const claims = JSON.parse(Buffer.from(grant.token.split('.')[1], 'base64url'));
    assert.equal(claims.sub, member.user.id);
    assert.ok(claims.video.room.endsWith(':default-3'));
    assert.ok(claims.exp * 1000 < Date.now() + 301_000);
    assert.equal(grant.e2ee, false);
    await request('/api/voice/token', { token: member.token, body: { channel_id: general.id }, status: 400 });
  });
  await t.test('restart keeps identity, channels, and messages but requires a fresh proof', async () => {
    const oldId = owner.user.id;
    await stop();
    await start();
    await request('/api/bootstrap', { token: owner.token, status: 401 });
    owner = await login(ownerKey, 'Avery');
    assert.equal(owner.user.id, oldId);
    assert.equal(owner.user.role, 'owner');
    const messages = await request(`/api/channels/${general.id}/messages`, { token: owner.token });
    assert.equal(messages[0].id, reply.id);
    const data = await request('/api/bootstrap', { token: owner.token });
    assert.ok(data.channels.some((c) => c.name === 'project-room'));
  });
  await t.test('reserved ownership survives an earlier guest registration', async () => {
    const reserved = keys();
    await stop();
    await start({ database: 'reserved.db', ownerKey: reserved.public_key, voice: false });
    const guest = await login(keys(), 'Early guest');
    const designated = await login(reserved, 'Designated owner');
    assert.equal(guest.user.role, 'member');
    assert.equal(designated.user.role, 'owner');
    await request('/api/voice/token', { token: guest.token, body: { channel_id: 'default-3' }, status: 503 });
  });
  await t.test('simultaneous first registrations produce exactly one owner', async () => {
    await stop();
    await start({ database: 'concurrent.db' });
    const sessions = await Promise.all([login(keys(), 'First arrival'), login(keys(), 'Second arrival')]);
    assert.equal(sessions.filter((session) => session.user.role === 'owner').length, 1);
    assert.equal(sessions.filter((session) => session.user.role === 'member').length, 1);
  });
});
