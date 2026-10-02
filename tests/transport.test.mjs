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
