import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import spawn from 'cross-spawn';
import { checkArtifact } from './check-artifact.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const harnessPrefix = resolve(process.env.HIRESEEKER_DSH_PREFIX ?? join(root, '.artifacts', 'harness-runtime'));
const harnessRoot = join(harnessPrefix, 'node_modules', '@deepseek-ai', 'dsh');
const harnessManifest = JSON.parse(readFileSync(join(harnessRoot, 'package.json'), 'utf8'));
assert.equal(harnessManifest.version, '0.2.0-rc.2', 'Проверка требует зафиксированную версию Harness.');
const dshBin = join(harnessRoot, harnessManifest.bin.dsh);
const head = spawn.sync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
assert.equal(head.status, 0, 'Не удалось определить SHA checkout.');
const { receipt, tarball } = checkArtifact(join(root, '.artifacts'), head.stdout.trim());
const temp = mkdtempSync(join(tmpdir(), 'hireseeker-deepseek-'));
const env = { ...process.env, DSH_HOME: join(temp, 'dsh'),
  PATH: join(harnessPrefix, 'node_modules', '.bin') + delimiter + process.env.PATH };
const execute = args => {
  const result = spawn.sync(process.execPath, [dshBin, ...args], {
    cwd: temp, env, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, (result.stderr || result.stdout).slice(-5000));
  return result.stdout;
};

try {
  // Установщик Harness создаёт профиль сам; пользовательские профили не затрагиваются.
  execute(['plugin', '--profile', 'hireseeker-check', 'add', tarball, '--ignore-scripts']);
  const profileRoot = join(env.DSH_HOME, 'profiles', 'hireseeker-check');
  const profile = JSON.parse(readFileSync(join(profileRoot, 'package.json'), 'utf8'));
  assert.ok(profile.dsh.profile.bundles.includes('hireseeker-cli'));
  const packageRoot = join(profileRoot, 'node_modules', 'hireseeker-cli');
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.version, receipt.version);
  assert.equal(manifest.dsh.bundle.patch, './deepseek/cordis.patch.yml');
  const dump = execute(['--profile', 'hireseeker-check', '--dump-config']);
  assert.match(dump, /mcp-hireseeker/);
  assert.match(dump, /https:\/\/hireseeker\.ru\/mcp/);
  assert.match(dump, /@deepseek-ai\/dsh-mcp-client/);

  const harnessRequire = createRequire(join(harnessRoot, 'package.json'));
  const loadHarness = name => import(pathToFileURL(harnessRequire.resolve(name)).href);
  const { load: loadYaml } = harnessRequire('js-yaml');
  const patch = loadYaml(readFileSync(join(packageRoot, manifest.dsh.bundle.patch), 'utf8'));
  assert.equal(patch.length, 1);
  const [entry] = patch[0].insert;
  assert.equal(entry.name, '@deepseek-ai/dsh-mcp-client');
  assert.deepEqual(entry.config, { serverName: 'hireseeker', transport: 'streamable-http', url: 'https://hireseeker.ru/mcp' });
  assert.equal(execute(['plugin', '--profile', 'hireseeker-check', 'list']).includes('hireseeker-cli'), true);

  // Настоящие Cordis, MCP-клиент и ToolRuntime Harness; модель не подключается.
  const { Context } = await loadHarness('@deepseek-ai/cordis');
  const { SystemPrompt } = await loadHarness('@deepseek-ai/dsh-system-prompt');
  const { ToolRuntime } = await loadHarness('@deepseek-ai/dsh-tools');
  const mcpClient = await loadHarness(entry.name);
  process.env.HIRESEEKER_TEST_ROOT = packageRoot;
  const { server, catalog, criteria, cursor, page, job } = await import('../tests/helpers.mjs');
  const toolError = text => ({ isError: true, content: [{ type: 'text', text }] });
  const fixture = await server(({ name, arguments: args }) => {
    if (name === 'search_vacancies' && args.cursor === 'expired') return toolError('Курсор истёк');
    if (name === 'search_vacancies' && args.criteria?.category_code === 'unsupported') return toolError('Профессия не поддерживается');
    if (name === 'get_vacancy' && args.vacancy_id === 999) return toolError('Вакансия недоступна');
    return undefined;
  }, undefined, '2025-03-26');
  const ctx = new Context();
  const errors = [];
  ctx.on('internal/error', error => { errors.push(String(error)); });
  ctx.plugin(SystemPrompt, {});
  ctx.plugin(ToolRuntime, { mode: 'native' });
  ctx.plugin(mcpClient, { ...entry.config, url: fixture.url, failOnStartupError: true, reconnect: { enabled: false } });
  let callId = 0;
  const call = (name, args = {}) => ctx.tools.execute({
    callId: `hireseeker-check-${++callId}`, name: `mcp__hireseeker__${name}`,
    arguments: args, signal: AbortSignal.timeout(10000),
  });
  try {
    await ctx.start();
    const deadline = Date.now() + 10000;
    while ((!ctx.tools || ctx.tools.schemas().length < 4) && Date.now() < deadline) await delay(20);
    const names = ctx.tools.schemas().map(tool => tool.name).sort();
    assert.deepEqual(names, ['get_professions', 'search_locations', 'search_vacancies', 'get_vacancy']
      .map(name => `mcp__hireseeker__${name}`).sort(), errors.join('\n'));
    const professions = await call('get_professions');
    assert.equal(professions.isError, false);
    assert.deepEqual(professions.value.structuredContent, catalog);
    const locations = await call('search_locations', { query: 'Москва', country_code: 'RU' });
    assert.equal(locations.isError, false);
    assert.equal(locations.value.structuredContent.cities[0].name, 'Москва');
    const search = await call('search_vacancies', { criteria });
    assert.equal(search.isError, false);
    assert.deepEqual(search.value.structuredContent.applied_filters, criteria);
    assert.equal(search.value.structuredContent.next_cursor, cursor);
    assert.equal(search.value.structuredContent.vacancies[0].open_url, job.open_url);
    assert.equal(search.value.structuredContent.vacancies[0].contact_access, 'restricted');
    const detail = await call('get_vacancy', { vacancy_id: job.id });
    assert.equal(detail.isError, false);
    assert.equal(detail.value.structuredContent.description_truncated, false);
    const next = await call('search_vacancies', { cursor });
    assert.equal(next.isError, false);
    assert.equal(next.value.structuredContent.next_cursor, null);
    assert.deepEqual(next.value.structuredContent.applied_filters, page.applied_filters);
    assert.equal((await call('search_vacancies', { cursor: 'expired' })).isError, true);
    assert.equal((await call('search_vacancies', { criteria: { ...criteria, category_code: 'unsupported' } })).isError, true);
    assert.equal((await call('get_vacancy', { vacancy_id: 999 })).isError, true);
    await fixture.close();
    assert.equal((await call('get_professions')).isError, true);
    console.log(JSON.stringify({ package: manifest.name, version: receipt.version, harness: harnessManifest.version,
      commit: receipt.commit, tools: names, pagination_checked: true, failure_paths_checked: true, model_calls: 0 }));
  } finally {
    await ctx.stop();
    await fixture.close();
  }
  execute(['plugin', '--profile', 'hireseeker-check', 'remove', 'hireseeker-cli']);
  const after = JSON.parse(readFileSync(join(profileRoot, 'package.json'), 'utf8'));
  assert.equal(after.dsh.profile.bundles.includes('hireseeker-cli'), false);
} finally { rmSync(temp, { recursive: true, force: true }); }
