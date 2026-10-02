import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = readdirSync(new URL('../tests/', import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort().map(name => fileURLToPath(new URL(`../tests/${name}`, import.meta.url)));
const result = spawn.sync(process.execPath, ['--test', ...files], { cwd: root, env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
