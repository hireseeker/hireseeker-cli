import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import spawn from 'cross-spawn';

const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = join(root, '.artifacts');
mkdirSync(artifacts, { recursive: true });
const packed = spawn.sync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], { cwd: root, encoding: 'utf8' });
if (packed.error || packed.status !== 0) throw new Error('Не удалось подготовить npm-tarball.');
const [result] = JSON.parse(packed.stdout);
for (const required of ['npm-shrinkwrap.json', 'bin/hireseeker.js', 'dist/cli.js', 'skills/hireseeker/SKILL.md', 'deepseek/cordis.patch.yml', 'docs/deepseek.md']) {
  if (!result.files.some(file => file.path === required)) throw new Error(`npm-tarball не содержит ${required}.`);
}
const head = spawn.sync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
if (head.status !== 0) throw new Error('Не удалось определить SHA commit.');
const receipt = { package: 'hireseeker-cli', version: result.version, filename: result.filename,
  commit: head.stdout.trim(), sha256: createHash('sha256').update(readFileSync(join(artifacts, result.filename))).digest('hex') };
writeFileSync(join(artifacts, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
