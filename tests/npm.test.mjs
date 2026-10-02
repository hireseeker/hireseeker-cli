import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { load } from './runtime.mjs';
const { createNpmRunner } = await load('npm');
const { initialize } = await load('setup');
const { VERSION } = await load('config');

async function hangingNpm(t) {
  const home = await mkdtemp(join(tmpdir(), 'hireseeker-npm-tree-'));
  const ready = join(home, 'ready.json');
  const heartbeat = join(home, 'heartbeat');
  const script = join(home, 'npm-tree.mjs');
  const descendant = join(home, 'descendant.mjs');
  await writeFile(descendant, `import { writeFileSync } from 'node:fs';
    process.on('SIGTERM', () => {});
    let ticks = 0; setInterval(() => writeFileSync(process.env.HIRESEEKER_TEST_HEARTBEAT, String(++ticks)), 20);`);
  await writeFile(script, `import { spawn } from 'node:child_process'; import { writeFileSync } from 'node:fs';
    process.on('SIGTERM', () => {});
    const child = spawn(process.execPath, [${JSON.stringify(descendant)}], { stdio: 'ignore' });
    writeFileSync(process.env.HIRESEEKER_TEST_READY, JSON.stringify([process.pid, child.pid]));
    setInterval(() => {}, 1000);`);
  const npm = join(home, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  await writeFile(npm, process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
    : `#!/usr/bin/env node\nimport(${JSON.stringify(pathToFileURL(script).href)});\n`);
  if (process.platform !== 'win32') await chmod(npm, 0o755);
  t.after(async () => {
    try {
      for (const pid of JSON.parse(await readFile(ready, 'utf8'))) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* Процесс уже завершён. */ }
      }
    } catch { /* npm мог не успеть запуститься. */ }
    await rm(home, { recursive: true, force: true });
  });
  return { home, ready, heartbeat, env: { ...process.env, PATH: `${home}${delimiter}${process.env.PATH}`,
    HIRESEEKER_TEST_READY: ready, HIRESEEKER_TEST_HEARTBEAT: heartbeat } };
}

async function readyTree(fixture) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    try { return { pids: JSON.parse(await readFile(fixture.ready, 'utf8')), ticks: await readFile(fixture.heartbeat, 'utf8') }; }
    catch { await delay(20); }
  }
  assert.fail('Тестовый npm не создал дерево процессов.');
}

async function assertStopped(fixture) {
  const before = await readFile(fixture.heartbeat, 'utf8');
  await delay(250);
  assert.equal(await readFile(fixture.heartbeat, 'utf8'), before, 'Дочерний процесс npm продолжает работать.');
}

test('Таймаут останавливает игнорирующее SIGTERM дерево npm и сохраняет установку skills', { timeout: 12000 }, async t => {
  const fixture = await hangingNpm(t);
  const pending = initialize({ ...fixture, agents: ['codex'] }, createNpmRunner(2000));
  await readyTree(fixture);
  const result = await pending;
  assert.equal(result.global.installed, false);
  assert.equal(result.global.reason, 'npm_install_timeout');
  assert.equal(result.agents[0].status, 'installed');
  await assertStopped(fixture);
});

test('Отмена останавливает всё дерево npm', { timeout: 12000 }, async t => {
  const fixture = await hangingNpm(t);
  const controller = new AbortController();
  const pending = createNpmRunner(10000)(VERSION, fixture.env, controller.signal);
  const rejected = assert.rejects(pending, error => error.reason === 'npm_cancelled');
  await readyTree(fixture);
  controller.abort();
  await rejected;
  await assertStopped(fixture);
});

test('Отменённый до запуска сигнал не запускает npm', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createNpmRunner()(VERSION, { PATH: '' }, controller.signal), error => error.reason === 'npm_cancelled');
});

test('Отсутствующий npm возвращает безопасный код запуска', async () => {
  await assert.rejects(createNpmRunner()(VERSION, { ...process.env, PATH: '' }),
    error => error.reason === 'npm_not_found' && error.details.system_code === 'ENOENT');
});
