import { createServer } from 'node:http';
import { load } from './runtime.mjs';
const { run } = await load('cli');

export const cursor = `${'a'.repeat(32)}:1`;
export const criteria = { category_code: 'python_backend', period_days: 7, limit: 5,
  include_english: true, include_without_salary: true, hide_auto_bumped: false,
  salary_buckets: [], country_filter: [], schedule_filter: [], city_filter: [], source_filter: [] };
export const catalog = {
  groups: [{ code: 'backend', name_ru: 'Бэкенд', top_group: 'developers', members: [{ code: 'python_backend', name_ru: 'Python' }] }],
  supergroups: [{ code: 'developers', name_ru: 'Разработка', group_codes: ['backend'] }],
  salaries: [{ code: '150_249k', min_rub: 150000, max_rub_exclusive: 250000 }],
  countries: [{ code: 'RU', name_ru: 'Россия' }], schedules: ['remote', 'hybrid', 'office', 'unknown'],
  periods: [1, 3, 7, 14, 30], unsupported_filters: ['grade', 'salary_min', 'free_text'],
  salary_note: 'Точный порог не поддерживается.', period_note: 'Период появления в категории.',
};
export const job = {
  id: 101, title: 'Python Developer', employer: 'Компания',
  salary: { from: 1500, to: null, currency: 'USD', from_rub: 135000, server_extra: 'retained' },
  schedule: 'remote', location: 'Москва', countries: ['RU'], description: 'Задачи и условия.',
  description_truncated: true, profession_codes: ['python_backend'], published_at: '2026-10-01T00:00:00Z',
  seen_at: '2026-10-02T00:00:00Z', search_appeared_at: '2026-10-02T00:00:00Z', auto_bumped: false,
  url: 'https://hireseeker.ru/vacancy/101', open_url: 'https://hireseeker.ru/vacancy/101?utm_source=mcp',
  contact_access: 'restricted', server_extra: { keep: true },
};
export const page = { vacancies: [job], applied_filters: criteria, total_items: 3,
  searched_at: '2026-10-02T12:00:00Z', next_cursor: cursor, server_extra: 'retained' };
const list = (values, maxItems) => ({ type: 'array', items: { type: 'string', enum: values }, maxItems });
export const searchDefinition = { type: 'object', properties: {
  category_code: { type: 'string' }, period_days: { type: 'integer', enum: [1, 3, 7, 14, 30] },
  limit: { type: 'integer', minimum: 1, maximum: 20 },
  salary_buckets: list(['lte_149k', '150_249k', '250_349k', 'gte_350k'], 4),
  country_filter: list(['RU', 'KZ', 'unknown'], 3), schedule_filter: list(['remote', 'hybrid', 'office', 'unknown'], 4),
  source_filter: list(['hh', 'other', 'hireseeker', 'social', 'company'], 5),
  city_filter: { type: 'array', maxItems: 20, items: { type: 'string' } },
} };
export const tools = ['get_professions', 'search_locations', 'search_vacancies', 'get_vacancy'].map(name => ({
  name, inputSchema: name === 'search_vacancies'
    ? { type: 'object', properties: { criteria: { $ref: '#/$defs/SearchCriteria' }, cursor: { type: 'string' } }, $defs: { SearchCriteria: searchDefinition } }
    : { type: 'object', properties: {} },
}));
const response = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export async function server(handler, advertisedTools = tools, protocolVersion) {
  const calls = [];
  const http = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
    let data = '';
    for await (const chunk of req) data += chunk;
    const message = JSON.parse(data);
    calls.push(message);
    if (message.id === undefined) { res.writeHead(202); res.end(); return; }
    let result;
    if (message.method === 'initialize') result = { protocolVersion: protocolVersion ?? message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } };
    else if (message.method === 'tools/list') result = { tools: advertisedTools };
    else if (message.method === 'tools/call') {
      const custom = handler ? await handler(message.params) : undefined;
      if (custom === 'hang') return;
      if (custom === '429') { res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '30' }); res.end(JSON.stringify({ error: 'rate_limited' })); return; }
      if (custom !== undefined) result = custom;
      else {
        const { name, arguments: args } = message.params;
        if (name === 'get_professions') result = response(catalog);
        else if (name === 'search_locations') result = response({ countries: [], cities: [{ id: 10, name: 'Москва', country_iso: 'RU', count: 12, region_id: null }] });
        else if (name === 'get_vacancy') result = response({ ...job, search_appeared_at: null, description_truncated: false });
        else if (name === 'search_vacancies') result = response(args.cursor ? { ...page, vacancies: [{ ...job, id: 102 }], next_cursor: null } : { ...page, applied_filters: args.criteria });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${http.address().port}/mcp`, calls,
    close: () => new Promise(resolve => { http.close(resolve); http.closeAllConnections(); }),
  };
}

export async function invoke(args, options = {}) {
  let stdout = '', stderr = '';
  const code = await run(['node', 'hireseeker', ...args], {
    env: { HIRESEEKER_MCP_URL: options.url ?? 'http://127.0.0.1:1/mcp' },
    ...options, stdout: value => { stdout += value; }, stderr: value => { stderr += value; },
  });
  return { code, stdout, stderr };
}
export function toolCalls(fixture, name) { return fixture.calls.filter(call => call.method === 'tools/call' && (!name || call.params.name === name)); }
