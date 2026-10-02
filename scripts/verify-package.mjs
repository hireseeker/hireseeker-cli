import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import spawn from 'cross-spawn';

const root = fileURLToPath(new URL('../', import.meta.url));
const receipt = JSON.parse(readFileSync(join(root, '.artifacts', 'receipt.json'), 'utf8'));
const tarball = join(root, '.artifacts', receipt.filename);
assert.equal(createHash('sha256').update(readFileSync(tarball)).digest('hex'), receipt.sha256);
const head = spawn.sync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
assert.equal(head.stdout.trim(), receipt.commit);
const temp = mkdtempSync(join(tmpdir(), 'hireseeker-package-'));
const execute = (command, args, env = process.env) => {
  const result = spawn.sync(command, args, { cwd: temp, env, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
};
try {
  const installed = execute('npm', ['install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
  assert.equal(installed.status, 0, installed.stderr);
  const packageRoot = join(temp, 'node_modules', 'hireseeker-cli');
  const shim = join(temp, 'node_modules', '.bin', process.platform === 'win32' ? 'hireseeker.cmd' : 'hireseeker');
  const offline = { ...process.env, HIRESEEKER_MCP_URL: 'invalid-endpoint' };
  const version = execute(shim, ['--version'], offline);
  assert.equal(version.status, 0, version.stderr); assert.equal(version.stdout.trim(), receipt.version);
  const help = execute(shim, ['vacancy', 'search', '--help'], offline);
  assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /--category/);
  const exec = execute('npm', ['exec', '--offline', '--prefix', temp, '--', 'hireseeker', '--version'], offline);
  assert.equal(exec.status, 0, exec.stderr); assert.equal(exec.stdout.trim(), receipt.version);
  assert.ok(existsSync(join(packageRoot, 'npm-shrinkwrap.json')));
  const home = join(temp, 'home');
  const env = { ...offline, HOME: home, USERPROFILE: home, CODEX_HOME: join(home, '.codex'), CLAUDE_CONFIG_DIR: join(home, '.claude'), XDG_CONFIG_HOME: join(home, '.config') };
  const skill = execute(shim, ['skill', '--agent', 'codex', '--json'], env);
  assert.equal(skill.status, 0, skill.stderr);
  const result = JSON.parse(skill.stdout); assert.equal(result.agents[0].status, 'installed');
  const file = join(result.agents[0].path, 'SKILL.md');
  assert.match(readFileSync(file, 'utf8'), /name: hireseeker/);
  appendFileSync(file, '\nПользовательская правка.\n');
  const protectedSkill = execute(shim, ['skill', '--agent', 'codex', '--json'], env);
  assert.equal(protectedSkill.status, 1); assert.equal(JSON.parse(protectedSkill.stdout).agents[0].status, 'skipped');
  assert.match(readFileSync(file, 'utf8'), /Пользовательская правка/);
  const tests = spawn.sync(process.execPath, [join(root, 'scripts', 'test.mjs')], { cwd: root, env: { ...process.env, HIRESEEKER_TEST_ROOT: packageRoot }, stdio: 'inherit' });
  assert.equal(tests.status, 0, 'Тесты установленного tarball не прошли.');
  console.log(`Проверен ${receipt.filename}, ${process.platform}, Node ${process.version}, SHA ${receipt.commit}`);
} finally { rmSync(temp, { recursive: true, force: true }); }
