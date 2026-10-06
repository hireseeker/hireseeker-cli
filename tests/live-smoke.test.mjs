
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/live-smoke.mjs', import.meta.url));

async function fixture(t, mode) {
  const temp = await mkdtemp(join(tmpdir(), 'hireseeker-smoke-')); t.after(() => rm(temp, { recursive: true, force: true }));
  const cli = join(temp, 'fixture.mjs');
  const page = { applied_filters: { category_code: 'python_backend' }, vacancies: [{ id: 101 }], searched_at: 'snapshot', total_items: 3, next_cursor: mode === 'missing' ? null : `${'a'.repeat(32)}:1` };
  const next = { ...page, vacancies: mode === 'empty' ? [] : [{ id: 102 }], next_cursor: null };
  const data = { catalog: { groups: [{ members: [{ code: 'python_backend' }] }] }, geo: { cities: [{ name: 'Москва' }] }, page, next, vacancy: { id: 101, search_appeared_at: null, contact_access: 'available' } };
  await writeFile(cli, `const data = ${JSON.stringify(data)}; const args = process.argv.slice(2);
const value = args[0] === 'professions' ? data.catalog : args[0] === 'locations' ? data.geo : args[1] === 'read' ? data.vacancy : args.includes('--cursor') ? data.next : data.page;
console.log(JSON.stringify(value));
`);
  return cli;
}

for (const mode of ['missing', 'empty']) {
  test(`Live smoke не сообщает успех без продолжения: ${mode}`, async t => {
    const cli = await fixture(t, mode);
    await assert.rejects(exec(process.execPath, [script, cli], { timeout: 10000 }), error => {
      assert.equal(error.code, 1); assert.equal(error.stdout, ''); assert.match(error.stderr, /проверка|страница|курсор/i); return true;
    });
  });
}

test('Live smoke сообщает успех только после реального вызова cursor-path', async t => {
  const cli = await fixture(t, 'valid');
  const { stdout, stderr } = await exec(process.execPath, [script, cli], { timeout: 10000 });
  assert.equal(stderr, ''); const report = JSON.parse(stdout);
  assert.equal(report.pagination_checked, true); assert.equal(report.vacancy_id, 101); assert.equal(report.total_items, 3);
});
