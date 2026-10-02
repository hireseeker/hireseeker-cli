import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './runtime.mjs';
const { withClient } = await load('mcp');
const { catalogSchema } = await load('schemas');
const { endpoint } = await load('config');
import { server, invoke } from './helpers.mjs';

test('Таймаут отменяет зависший HTTP и закрывает транспорт', async t => {
  const fixture = await server(({ name }) => name === 'get_professions' ? 'hang' : undefined);
  t.after(() => fixture.close());
  await assert.rejects(withClient({ HIRESEEKER_MCP_URL: fixture.url }, undefined,
    client => client.call('get_professions', {}, catalogSchema), 100), error => error.code === 'network_timeout');
});
for (const reason of [130, 143]) {
  test(`Отмена возвращает ${reason}`, async t => {
    const fixture = await server(() => 'hang'); t.after(() => fixture.close());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(reason), 100); t.after(() => clearTimeout(timer));
    const result = await invoke(['professions', 'list', '--json'], { url: fixture.url, signal: controller.signal });
    assert.equal(result.code, reason); assert.equal(JSON.parse(result.stderr).error.code, 'cancelled');
  });
}
for (const url of ['https://user:secret@example.com/mcp', 'https://example.com/mcp?token=secret', 'http://example.com/mcp', 'bad']) {
  test('Некорректный endpoint отклоняется без утечки credentials', async () => {
    const result = await invoke(['professions', 'list', '--json'], { env: { HIRESEEKER_MCP_URL: url } });
    assert.equal(result.code, 2); assert.equal(JSON.parse(result.stderr).error.code, 'invalid_endpoint');
    assert.ok(!result.stderr.includes('secret')); assert.ok(!result.stderr.includes(url));
  });
}
test('Endpoint принимает HTTPS и loopback HTTP', () => {
  for (const url of ['https://hireseeker.ru/mcp', 'http://127.0.0.1:5000/mcp', 'http://localhost:5000/mcp', 'http://[::1]:5000/mcp']) {
    assert.equal(endpoint({ HIRESEEKER_MCP_URL: url }).href, url);
  }
});


test('Исполняемая команда обрабатывает настоящий SIGTERM и закрывает запрос', { skip: process.platform === 'win32', timeout: 10000 }, async t => {
  const { spawn } = await import('node:child_process');
  const { join } = await import('node:path');
  const { runtimeRoot } = await import('./runtime.mjs');
  let notify;
  const ready = new Promise(resolve => { notify = resolve; });
  const fixture = await server(({ name }) => { if (name === 'get_professions') { notify(); return 'hang'; } });
  t.after(() => fixture.close());
  const child = spawn(process.execPath, [join(runtimeRoot, 'bin', 'hireseeker.js'), 'professions', 'list', '--json'], {
    env: { ...process.env, HIRESEEKER_MCP_URL: fixture.url }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  let stdout = '', stderr = '';
  child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
  const exited = new Promise((resolve, reject) => { child.once('close', code => resolve(code)); child.once('error', reject); });
  await Promise.race([ready, exited.then(() => { throw new Error('CLI завершился до начала запроса.'); })]);
  child.kill('SIGTERM');
  assert.equal(await exited, 143); assert.equal(stdout, ''); assert.equal(JSON.parse(stderr).error.code, 'cancelled');
});
