import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'raeen-browser-'));
const node = spawn(resolve('target/debug/raeen-node'), [], {
  stdio: 'inherit',
  env: {
    ...process.env,
    RAEEN_BIND: '127.0.0.1:3011',
    RAEEN_DATABASE: join(directory, 'browser.db'),
    RAEEN_OWNER_KEY: '',
    RAEEN_ORIGINS: 'http://127.0.0.1:3011',
    LIVEKIT_URL: process.env.RAEEN_TEST_VOICE === '1' ? 'ws://127.0.0.1:7880' : '',
    LIVEKIT_API_KEY: process.env.RAEEN_TEST_VOICE === '1' ? 'devkey' : '',
    LIVEKIT_API_SECRET: process.env.RAEEN_TEST_VOICE === '1' ? 'secret' : '',
  },
});
let stopped = false;
async function stop() {
  if (stopped) return;
  stopped = true;
  node.kill('SIGTERM');
  await rm(directory, { recursive: true, force: true });
}
process.on('SIGINT', () => {
  void stop();
});
process.on('SIGTERM', () => {
  void stop();
});
node.on('exit', (code) => {
  void stop().then(() => {
    process.exitCode = code ?? 0;
  });
});
