import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const roots = ['.gitignore', 'README.md', 'App.tsx', 'index.ts', 'app.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.web.json', 'src', 'tests', 'scripts'];
async function files(entry) {
  const stat = await fs.stat(entry);
  if (!stat.isDirectory()) return [entry];
  return (await Promise.all((await fs.readdir(entry)).map(name => files(path.join(entry, name))))).flat();
}
const paths = (await Promise.all(roots.map(files))).flat().sort();
const entries = await Promise.all(paths.map(async file => {
  const bytes = await fs.readFile(file); return { path: file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}));
const digest = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
await fs.writeFile('workflow-artifacts/2026-10-20-soundboard-mvp/source-manifest.json', JSON.stringify({ algorithm: 'sha256', digest, entries }, null, 2));
console.log(JSON.stringify({ sourceFiles: entries.length, digest, excluded: ['node_modules', '.expo', 'dist', 'test-results', 'workflow role reports and evidence'] }, null, 2));
