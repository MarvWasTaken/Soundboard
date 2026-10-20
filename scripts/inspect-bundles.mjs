import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifacts = 'workflow-artifacts/2026-10-20-soundboard-mvp';
async function files(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
const findings = [];
const mapSources = map => map.sections ? map.sections.flatMap(section => mapSources(section.map)) : (map.sources ?? []);
for (const platform of ['web', 'ios']) {
  const all = await files(`dist/${platform}`), maps = all.filter(file => file.endsWith('.map'));
  assert.ok(maps.length, `Missing ${platform} sourcemaps`);
  const sources = [...new Set((await Promise.all(maps.map(async file => mapSources(JSON.parse(await fs.readFile(file, 'utf8')))))).flat())];
  const affected = sources.filter(source => /(?:^|[/\\])node_modules[/\\](?:braces|node-forge|uuid|xcode|@expo[/\\]code-signing-certificates)[/\\]/.test(source));
  const cliRuntimeShims = sources.filter(source => source.includes('/node_modules/@expo/cli/'));
  assert.ok(cliRuntimeShims.every(source => source.endsWith('/@expo/cli/build/metro-require/require.js')), 'Review additional CLI runtime modules');
  const native = platform === 'ios';
  for (const adapter of ['storage', 'audio', 'picker', 'interruption']) {
    assert.ok(sources.some(source => source.endsWith(`src/platform/${adapter}.${native ? 'native' : 'web'}.ts`)), `${platform}: missing ${adapter} adapter`);
    assert.ok(!sources.some(source => source.endsWith(`src/platform/${adapter}.${native ? 'web' : 'native'}.ts`)), `${platform}: wrong ${adapter} adapter leaked`);
  }
  assert.deepEqual(affected, [], `Known tooling advisory packages leaked into ${platform}`);
  if (!native) assert.ok(!sources.some(source => /node_modules\/expo-(?:sqlite|file-system|audio|document-picker)\//.test(source)), 'Native I/O packages leaked into web bundle');
  findings.push({ platform, maps, sourceCount: sources.length, affectedPackages: affected, cliRuntimeShims, applicationSources: sources.filter(source => source.includes('src/platform/') || source.endsWith('App.tsx')) });
}
const report = { result: 'PASS: expected platform adapters and no affected tooling modules in actual production sourcemap sources', findings };
await fs.writeFile(`${artifacts}/bundle-audit-evidence.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
