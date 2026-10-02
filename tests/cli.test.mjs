import test from 'node:test';
import assert from 'node:assert/strict';
import { invoke, server, toolCalls, cursor, job, page, tools } from './helpers.mjs';

for (const args of [['--help'], ['--version'], ['vacancy', 'search', '--help']]) {
  test(`Работа без сети: ${args.join(' ')}`, async () => {
    const result = await invoke(args, { env: { HIRESEEKER_MCP_URL: 'invalid endpoint' } });
    assert.equal(result.code, 0); assert.notEqual(result.stdout, ''); assert.equal(result.stderr, '');
  });
}
for (const args of [
  ['vacancy', 'search'], ['vacancy', 'search', '--category', 'backend', '--grade', 'senior'],
  ['vacancy', 'search', '--category', 'backend', '--salary-min', '200000'],
  ['vacancy', 'search', '--category', 'backend', '--q', 'Python'],
  ['vacancy', 'search', '--cursor', cursor, '--no-english'],
  ['vacancy', 'search', '--cursor', cursor, '--limit', '5'],
  ['vacancy', 'search', '--cursor', 'bad'], ['vacancy', 'search', '--category', 'backend', '--period', '7days'],
  ['vacancy', 'search', '--category', 'backend', '--country', 'RU,'],
  ['vacancy', 'read', '9007199254740993'], ['vacancy', 'read', '0'], ['vacancy', 'read', '1.5'],
  ['skill', '--agent', 'unknown'], ['locations', 'search', ''],
]) {
  test(`Аргументы отклоняются до сети: ${args.join(' ')}`, async t => {
    const fixture = await server(); t.after(() => fixture.close());
    const result = await invoke([...args, '--json'], { url: fixture.url });
    assert.equal(result.code, 2); assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'invalid_arguments'); assert.equal(fixture.calls.length, 0);
  });
}

test('Новый поиск сохраняет JSON, валюту, дополнительные поля и defaults сервера', async t => {
  const fixture = await server(); t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'search', '--category', 'python_backend', '--json'], { url: fixture.url });
  assert.equal(result.code, 0); assert.equal(result.stderr, '');
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data, page); assert.equal(data.vacancies[0].salary.currency, 'USD');
  assert.equal(toolCalls(fixture, 'get_professions').length, 1);
  assert.deepEqual(toolCalls(fixture, 'search_vacancies')[0].params.arguments, { criteria: page.applied_filters });
});

test('Каждый флаг изменяет соответствующее поле API', async t => {
  const fixture = await server(); t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'search', '--category', 'backend', '--period=14', '--limit', '20',
    '--country', 'RU', '--country', 'KZ', '--city', '10,unknown', '--schedule', 'remote,hybrid',
    '--source', 'hh,company', '--salary-bucket', '150_249k', '--no-english', '--no-without-salary', '--hide-auto-bumped', '--json'], { url: fixture.url });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(toolCalls(fixture, 'search_vacancies')[0].params.arguments.criteria, {
    category_code: 'backend', period_days: 14, limit: 20, include_english: false, include_without_salary: false, hide_auto_bumped: true,
    country_filter: ['RU', 'KZ'], city_filter: ['10', 'unknown'], schedule_filter: ['remote', 'hybrid'], source_filter: ['hh', 'company'], salary_buckets: ['150_249k'],
  });
});

test('Курсор передаётся без новых criteria и без загрузки каталога', async t => {
  const fixture = await server(); t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'search', '--cursor', cursor, '--json'], { url: fixture.url });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(toolCalls(fixture, 'get_professions').length, 0);
  assert.deepEqual(toolCalls(fixture, 'search_vacancies')[0].params.arguments, { cursor });
  assert.equal(JSON.parse(result.stdout).next_cursor, null);
});

test('Карточка читается по числовому ID без контекста поиска', async t => {
  const fixture = await server(); t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'read', '101', '--json'], { url: fixture.url });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(toolCalls(fixture, 'get_vacancy')[0].params.arguments, { vacancy_id: 101 });
  assert.equal(JSON.parse(result.stdout).search_appeared_at, null);
});

test('География сохраняет ID и country_code', async t => {
  const fixture = await server(); t.after(() => fixture.close());
  const result = await invoke(['locations', 'search', 'Москва', '--country', 'RU', '--json'], { url: fixture.url });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(toolCalls(fixture, 'search_locations')[0].params.arguments, { query: 'Москва', country_code: 'RU' });
  assert.equal(JSON.parse(result.stdout).cities[0].id, 10);
});

for (const args of [['professions', 'list'], ['filters', 'guide']]) {
  test(`Живой каталог: ${args.join(' ')}`, async t => {
    const fixture = await server(); t.after(() => fixture.close());
    const result = await invoke([...args, '--json'], { url: fixture.url });
    assert.equal(result.code, 0, result.stderr);
    const data = JSON.parse(result.stdout);
    assert.equal((data.catalog ?? data).groups[0].members[0].code, 'python_backend');
    if (args[0] === 'filters') assert.ok(data.search_schema.properties.source_filter);
  });
}

test('Текстовая выдача сообщает об обрезке и правах на контакты', async t => {
  const fixture = await server(); t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'search', '--category', 'backend'], { url: fixture.url });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /1500 USD/); assert.match(result.stdout, /Описание обрезано/);
  assert.match(result.stdout, /Доступ к контактам/); assert.match(result.stdout, /Применённые фильтры/);
  assert.match(result.stdout, /--cursor/); assert.match(result.stdout, /В снимке/);
  assert.equal(toolCalls(fixture, 'get_vacancy').length, 0);
});

test('Ошибка инструмента и истёкший снимок не подменяются новой выдачей', async t => {
  const fixture = await server(({ name }) => name === 'search_vacancies' ? { isError: true, content: [{ type: 'text', text: 'Снимок истёк.' }] } : undefined);
  t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'search', '--cursor', cursor, '--json'], { url: fixture.url });
  assert.equal(result.code, 1); assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'tool_error');
  assert.match(result.stderr, /Снимок истёк/); assert.equal(toolCalls(fixture, 'search_vacancies').length, 1);
});

test('Повреждённый JSON shape возвращает contract_error', async t => {
  const fixture = await server(({ name }) => name === 'get_vacancy' ? { content: [], structuredContent: { ...job, id: '101' } } : undefined);
  t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'read', '101', '--json'], { url: fixture.url });
  assert.equal(result.code, 1); assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'contract_error');
});

test('Недоступная сеть — ошибка, без пустой успешной выдачи', async () => {
  const result = await invoke(['professions', 'list', '--json']);
  assert.equal(result.code, 1); assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'network_error');
});

test('HTTP 429 возвращает rate_limited и не повторяет поиск', async t => {
  const fixture = await server(({ name }) => name === 'search_vacancies' ? '429' : undefined);
  t.after(() => fixture.close());
  const result = await invoke(['vacancy', 'search', '--cursor', cursor, '--json'], { url: fixture.url });
  assert.equal(result.code, 1); assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'rate_limited');
  assert.equal(toolCalls(fixture, 'search_vacancies').length, 1);
});

for (const args of [['vacancy', 'search', '--category', 'python_backend'], ['filters', 'guide']]) {
  test('Повреждённая схема фильтров даёт contract_error в CLI до поиска', async t => {
    const changed = structuredClone(tools);
    changed.find(tool => tool.name === 'search_vacancies').inputSchema.$defs.SearchCriteria = {};
    const fixture = await server(undefined, changed); t.after(() => fixture.close());
    const result = await invoke([...args, '--json'], { url: fixture.url });
    assert.equal(result.code, 1); assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).error.code, 'contract_error');
    assert.equal(toolCalls(fixture, 'search_vacancies').length, 0);
  });
}
