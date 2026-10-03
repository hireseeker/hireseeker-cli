import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cli = process.argv[2] || fileURLToPath(new URL('../bin/hireseeker.js', import.meta.url));
const env = { ...process.env, HIRESEEKER_MCP_URL: 'https://hireseeker.ru/mcp' };
async function call(args) {
  const { stdout, stderr } = await exec(process.execPath, [cli, ...args, '--json'], { env, timeout: 35000, maxBuffer: 1024 * 1024 });
  assert.equal(stderr, '');
  return JSON.parse(stdout);
}
const catalog = await call(['professions', 'list']);
assert.ok(catalog.groups.some(group => group.members.some(member => member.code === 'python_backend')));
const geo = await call(['locations', 'search', 'Москва', '--country', 'RU']);
assert.ok(geo.cities.some(city => city.name === 'Москва'));
const page = await call(['vacancy', 'search', '--category', 'python_backend', '--limit', '2']);
assert.equal(page.applied_filters.category_code, 'python_backend'); assert.ok(page.vacancies.length > 0);
const vacancy = await call(['vacancy', 'read', String(page.vacancies[0].id)]);
assert.equal(vacancy.id, page.vacancies[0].id); assert.equal(vacancy.search_appeared_at, null);
assert.ok(page.next_cursor, 'Не получен курсор: обязательная проверка пагинации не выполнена.');
const next = await call(['vacancy', 'search', '--cursor', page.next_cursor]);
assert.equal(next.searched_at, page.searched_at); assert.equal(next.total_items, page.total_items);
assert.ok(next.vacancies.length > 0, 'Следующая страница пуста: проверка продолжения не выполнена.');
assert.ok(next.vacancies.every(item => !page.vacancies.some(previous => previous.id === item.id)));
console.log(JSON.stringify({ checked_at: new Date().toISOString(), endpoint: env.HIRESEEKER_MCP_URL,
  catalog_groups: catalog.groups.length, locations: geo.cities.length, page_items: page.vacancies.length,
  total_items: page.total_items, vacancy_id: vacancy.id, contact_access: vacancy.contact_access, pagination_checked: true }));
