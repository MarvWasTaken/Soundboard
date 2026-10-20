import { spawnSync } from 'node:child_process';
for (const script of ['browser-smoke.mjs', 'playback-smoke.mjs', 'board-smoke.mjs', 'recovery-smoke.mjs', 'concurrency-smoke.mjs']) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
