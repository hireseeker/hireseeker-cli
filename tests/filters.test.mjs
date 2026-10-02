import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './runtime.mjs';
const { buildCriteria, csv, integer } = await load('filters');
import { catalog, tools, criteria } from './helpers.mjs';

test('Defaults и категории всех уровней берутся из текущего каталога', () => {
  assert.deepEqual(buildCriteria({ category: 'python_backend' }, catalog, tools), criteria);
  for (const category of ['backend', 'developers']) assert.equal(buildCriteria({ category }, catalog, tools).category_code, category);
});
for (const options of [
  { category: 'unavailable' }, { category: 'backend', period: 2 },
  { category: 'backend', limit: 0 }, { category: 'backend', limit: 21 },
  { category: 'backend', salaryBucket: ['invalid'] }, { category: 'backend', country: ['XX'] },
  { category: 'backend', schedule: ['onsite'] }, { category: 'backend', source: ['telegram'] },
  { category: 'backend', city: ['Москва'] }, { category: 'backend', city: Array.from({ length: 21 }, (_, i) => `${i}`) },
]) {
  test(`Проверка живого фильтра: ${JSON.stringify(options)}`, () => {
    assert.throws(() => buildCriteria(options, catalog, tools), error => error.code === 'invalid_arguments' && error.exitCode === 2);
  });
}
test('CSV допускает повторение и убирает дубли', () => {
  assert.deepEqual(csv('RU, KZ', ['RU']), ['RU', 'KZ']);
  assert.throws(() => csv('RU,'));
});
test('ID не округляется и не принимает частичное число', () => {
  for (const value of ['1e3', '9007199254740993', '-1', '2.5', '7days']) assert.throws(() => integer(value));
  assert.equal(integer('101'), 101);
});

for (const definition of [{}, { properties: [] }, { properties: { limit: {} } },
  { ...tools.find(tool => tool.name === 'search_vacancies').inputSchema.$defs.SearchCriteria,
    properties: { ...tools.find(tool => tool.name === 'search_vacancies').inputSchema.$defs.SearchCriteria.properties,
      limit: { minimum: 'invalid' } } },
]) {
  test('Повреждённая серверная схема возвращает contract_error', () => {
    const changed = structuredClone(tools);
    changed.find(tool => tool.name === 'search_vacancies').inputSchema.$defs.SearchCriteria = definition;
    assert.throws(() => buildCriteria({ category: 'python_backend' }, catalog, changed), error => error.code === 'contract_error');
  });
}
