import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, lstat, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from './runtime.mjs';
import { invoke } from './helpers.mjs';
import { writeNpmExecutable } from './npm-fixture.mjs';
const { installSkills, initialize, targets, installGlobal } = await load('setup');
const { VERSION } = await load('config');
const { NpmInstallError } = await load('npm');

async function context(t) {
  const home = await mkdtemp(join(tmpdir(), 'hireseeker-test-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  return { home, env: {} };
}

test('Явный агент создаётся, повторная установка обновляет свой skill', async t => {
  const options = { ...await context(t), agents: ['codex'] };
  const first = await installSkills(options);
  assert.equal(first.ok, true, JSON.stringify(first));
  const path = first.agents[0].path;
  assert.match(await readFile(join(path, 'SKILL.md'), 'utf8'), /name: hireseeker/);
  const second = await installSkills(options);
  assert.equal(second.ok, true, JSON.stringify(second)); assert.equal(second.agents[0].status, 'installed');
  assert.deepEqual(await readdir(join(options.home, '.codex', 'skills')), ['hireseeker']);
});

test('Изменённые и дополнительные пользовательские файлы сохраняются', async t => {
  const options = { ...await context(t), agents: ['codex'] };
  const first = await installSkills(options);
  const path = first.agents[0].path;
  const file = join(path, 'SKILL.md');
  await writeFile(file, 'Пользовательская правка');
  const second = await installSkills(options);
  assert.equal(second.ok, false); assert.equal(second.agents[0].status, 'skipped');
  assert.equal(await readFile(file, 'utf8'), 'Пользовательская правка');
});

test('Дополнительный файл в собственном skill блокирует замену', async t => {
  const options = { ...await context(t), agents: ['codex'] };
  const first = await installSkills(options);
  const file = join(first.agents[0].path, 'custom.md');
  await writeFile(file, 'Пользовательские заметки');
  assert.equal((await installSkills(options)).ok, false);
  assert.equal(await readFile(file, 'utf8'), 'Пользовательские заметки');
});

test('Чужой skill без маркера не перезаписывается', async t => {
  const options = { ...await context(t), agents: ['cursor'] };
  const path = join(options.home, '.cursor', 'skills', 'hireseeker');
  await mkdir(path, { recursive: true }); await writeFile(join(path, 'SKILL.md'), 'Мой skill');
  assert.equal((await installSkills(options)).agents[0].status, 'skipped');
  assert.equal(await readFile(join(path, 'SKILL.md'), 'utf8'), 'Мой skill');
});

test('Symlink на чужой каталог сохраняется вместе с его содержимым', async t => {
  const options = { ...await context(t), agents: ['codex'] };
  const foreign = join(options.home, 'foreign'); await mkdir(foreign);
  await writeFile(join(foreign, 'SKILL.md'), 'Чужой skill');
  const parent = join(options.home, '.codex', 'skills'); await mkdir(parent, { recursive: true });
  const path = join(parent, 'hireseeker');
  await symlink(foreign, path, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await installSkills(options)).agents[0].status, 'skipped');
  assert.equal((await lstat(path)).isSymbolicLink(), true);
  assert.equal(await readFile(join(foreign, 'SKILL.md'), 'utf8'), 'Чужой skill');
});

test('Autodetect выбирает только существующие агенты, явный выбор имеет приоритет', async t => {
  const options = await context(t);
  await mkdir(join(options.home, '.codex')); await mkdir(join(options.home, '.cursor'));
  const result = await installSkills(options);
  assert.deepEqual(result.agents.map(item => item.agent), ['codex', 'cursor']);
  assert.deepEqual((await installSkills({ ...options, agents: ['gemini'] })).agents.map(item => item.agent), ['gemini']);
});

test('Отсутствие агентов сообщает неполную установку', async t => {
  const result = await installSkills(await context(t));
  assert.equal(result.ok, false); assert.deepEqual(result.agents, []);
});

test('Env overrides определяют каталоги установки', async t => {
  const options = await context(t);
  const env = { CODEX_HOME: join(options.home, 'codex-custom'), CLAUDE_CONFIG_DIR: join(options.home, 'claude-custom'), XDG_CONFIG_HOME: join(options.home, 'config-custom') };
  const result = targets(env, options.home);
  assert.equal(result.find(item => item.agent === 'codex').path, join(env.CODEX_HOME, 'skills', 'hireseeker'));
  assert.equal(result.find(item => item.agent === 'claude').path, join(env.CLAUDE_CONFIG_DIR, 'skills', 'hireseeker'));
  assert.equal(result.find(item => item.agent === 'opencode').path, join(env.XDG_CONFIG_HOME, 'opencode', 'skills', 'hireseeker'));
});

test('Частичный сбой не мешает установке для других агентов', async t => {
  const options = await context(t);
  await mkdir(join(options.home, '.cursor')); await writeFile(join(options.home, '.cursor', 'skills'), 'blocked');
  const result = await installSkills({ ...options, agents: ['codex', 'cursor'] });
  assert.equal(result.ok, false); assert.equal(result.agents[0].status, 'installed'); assert.equal(result.agents[1].status, 'failed');
  assert.equal(result.agents[1].reason, 'skill_not_directory');
});

test('Занятая блокировка сохраняется и не удаляет существующие файлы', async t => {
  const options = { ...await context(t), agents: ['codex'] };
  const lock = join(options.home, '.codex', 'skills', '.hireseeker-cli.lock');
  await mkdir(lock, { recursive: true });
  const result = await installSkills(options);
  assert.equal(result.agents[0].reason, 'installation_locked'); assert.equal((await lstat(lock)).isDirectory(), true);
});

test('Init устанавливает выполняемую версию и сохраняет отчёт при npm failure', async t => {
  const options = { ...await context(t), agents: ['codex'] };
  let requested;
  const result = await initialize(options, async version => { requested = version; return false; });
  assert.equal(requested, VERSION); assert.equal(result.global.installed, false);
  assert.equal(result.agents[0].status, 'installed'); assert.equal(result.ok, false);
});

test('Init с успешным npm имеет положительный отчёт', async t => {
  const result = await initialize({ ...await context(t), agents: ['codex'] }, async () => true);
  assert.equal(result.global.installed, true); assert.equal(result.ok, true);
});

test('Неизвестный агент отклоняется до запуска npm', async t => {
  let calls = 0;
  await assert.rejects(initialize({ ...await context(t), agents: ['unknown'] }, async () => { calls++; return true; }), error => error.code === 'invalid_arguments');
  assert.equal(calls, 0);
});

test('CLI оставляет частичный отчёт в stdout и JSON-ошибку в stderr', async t => {
  const options = await context(t);
  const result = await invoke(['init', '--agent', 'codex', '--json'], { ...options, npmRunner: async () => false });
  assert.equal(result.code, 1); assert.equal(JSON.parse(result.stdout).agents[0].status, 'installed');
  assert.equal(JSON.parse(result.stderr).error.code, 'setup_incomplete');
});

for (const exit of [0, 7]) {
  test(`Глобальный установщик вызывает npm с отдельными аргументами, exit=${exit}`, async t => {
    const { home } = await context(t);
    const { delimiter } = await import('node:path');
    const script = join(home, 'fake-npm.mjs');
    const argsFile = join(home, 'args.json');
    await writeFile(script, `import { writeFileSync } from 'node:fs'; writeFileSync(process.env.HIRESEEKER_TEST_NPM_ARGS, JSON.stringify(process.argv.slice(2))); process.exitCode = ${exit};`);
    await writeNpmExecutable(home, script);
    const env = { ...process.env, PATH: `${home}${delimiter}${process.env.PATH}`, HIRESEEKER_TEST_NPM_ARGS: argsFile };
    if (exit === 0) assert.equal(await installGlobal(VERSION, env), true);
    else await assert.rejects(installGlobal(VERSION, env), error => error.reason === 'npm_install_failed' && error.details.exit_code === exit);
    assert.deepEqual(JSON.parse(await readFile(argsFile, 'utf8')), ['install', '--global', '--ignore-scripts', '--no-audit', '--no-fund', `hireseeker-cli@${VERSION}`]);
  });
}

test('Отчёт init сохраняет код npm без вывода внешнего текста ошибки', async t => {
  const options = { ...await context(t), agents: ['codex'] };
  const result = await initialize(options, async () => { throw new NpmInstallError('npm_install_failed', { exit_code: 7 }); });
  assert.deepEqual(result.global, { installed: false, reason: 'npm_install_failed', exit_code: 7 });
  assert.equal(result.agents[0].status, 'installed');
  const unexpected = await initialize(options, async () => { throw new Error('https://user:private-secret@example.com'); });
  assert.equal(unexpected.global.reason, 'npm_install_failed');
  assert.doesNotMatch(JSON.stringify(unexpected), /private-secret/);
});

test('Текстовый отчёт init объясняет причину и exit code npm', async t => {
  const result = await invoke(['init', '--agent', 'codex'], { ...await context(t), npmRunner: async () => {
    throw new NpmInstallError('npm_install_failed', { exit_code: 7 });
  } });
  assert.equal(result.code, 1);
  assert.match(result.stdout, /npm завершился с ошибкой/);
  assert.match(result.stdout, /exit=7/);
});

for (const kind of ['missing', 'directory', 'empty', 'symlink']) {
  for (const command of ['skill', 'init']) {
    test(`${command} отклоняет некорректный источник skill (${kind}) до установки`, async t => {
      const options = await context(t);
      const packageRoot = join(options.home, 'package');
      const source = join(packageRoot, 'skills', 'hireseeker');
      await mkdir(source, { recursive: true });
      if (kind === 'directory') await mkdir(join(source, 'SKILL.md'));
      else if (kind !== 'missing') await writeFile(join(source, 'SKILL.md'), kind === 'empty' ? '' : 'name: hireseeker');
      if (kind === 'symlink') {
        const foreign = join(options.home, 'foreign'); await mkdir(foreign);
        await symlink(foreign, join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
      }
      let npmCalls = 0;
      const result = await invoke([command, '--agent', 'codex', '--json'], {
        ...options, packageRoot, npmRunner: async () => { npmCalls++; return true; },
      });
      assert.equal(result.code, 1); assert.equal(result.stdout, '');
      assert.equal(JSON.parse(result.stderr).error.code, kind === 'missing' ? 'skill_missing' : 'skill_invalid');
      assert.equal(npmCalls, 0, 'Невалидный пакет не должен запускать глобальную установку.');
      await assert.rejects(lstat(join(options.home, '.codex')), error => error.code === 'ENOENT');
    });
  }
}
