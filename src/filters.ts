
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { InvalidArgumentError } from 'commander';
import { z } from 'zod';
import type { Catalog, Criteria } from './schemas.js';
import { CliError } from './errors.js';

export type SearchOptions = {
  category?: string; cursor?: string; period?: number; limit?: number;
  salaryBucket?: string[]; country?: string[]; city?: string[]; schedule?: string[]; source?: string[];
  english?: boolean; withoutSalary?: boolean; hideAutoBumped?: boolean;
};

export function integer(value: string): number {
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new InvalidArgumentError('Нужен целый номер без знака в безопасном диапазоне JavaScript.');
  return Number(value);
}

export function csv(value: string, previous: string[] = []): string[] {
  const items = value.split(',').map(item => item.trim());
  if (items.some(item => !item)) throw new InvalidArgumentError('Список не должен содержать пустые значения.');
  return [...new Set([...previous, ...items])];
}

export function checkSearchOptions(options: SearchOptions): void {
  const criteriaKeys = Object.keys(options).filter(key => key !== 'cursor' && key !== 'json');
  if (options.cursor !== undefined) {
    if (criteriaKeys.length) throw new CliError('invalid_arguments', 'С --cursor нельзя передавать категорию или фильтры.', 2);
    if (!/^[A-Za-z0-9_-]{32}:[0-9]{1,7}$/.test(options.cursor)) throw new CliError('invalid_arguments', 'Некорректный курсор. Скопируйте next_cursor из ответа поиска.', 2);
  } else if (!options.category) {
    throw new CliError('invalid_arguments', 'Укажите --category из professions list или --cursor для следующей страницы.', 2);
  }
}

type Property = { enum?: unknown[]; maxItems?: number; minimum?: number; maximum?: number; items?: Property };
const propertySchema = z.looseObject({
  enum: z.array(z.unknown()).optional(), maxItems: z.number().int().nonnegative().optional(),
  minimum: z.number().optional(), maximum: z.number().optional(),
  items: z.looseObject({ enum: z.array(z.unknown()).optional() }).optional(),
});
const definitionSchema = z.looseObject({ properties: z.record(z.string(), propertySchema) });
const requiredProperties = ['limit', 'salary_buckets', 'country_filter', 'schedule_filter', 'city_filter', 'source_filter'];
export function searchSchema(tools: Tool[]): Record<string, unknown> {
  const tool = tools.find(item => item.name === 'search_vacancies');
  const defs = tool?.inputSchema.$defs as Record<string, unknown> | undefined;
  const schema = defs?.SearchCriteria;
  const parsed = definitionSchema.safeParse(schema);
  if (!parsed.success || requiredProperties.some(key => !parsed.data.properties[key])) {
    throw new CliError('contract_error', 'Сервис не объявляет корректную схему фильтров поиска.');
  }
  return schema as Record<string, unknown>;
}

export function buildCriteria(options: SearchOptions, catalog: Catalog, tools: Tool[]): Criteria {
  const codes = [...catalog.groups.flatMap(group => [group.code, ...group.members.map(member => member.code)]), ...catalog.supergroups.map(group => group.code)];
  if (!options.category || !codes.includes(options.category)) throw new CliError('invalid_arguments', 'Категория отсутствует в текущем каталоге. Выполните professions list.', 2);
  const criteria: Criteria = {
    category_code: options.category, period_days: options.period ?? 7, limit: options.limit ?? 5,
    include_english: options.english ?? true, include_without_salary: options.withoutSalary ?? true,
    hide_auto_bumped: options.hideAutoBumped ?? false,
    salary_buckets: options.salaryBucket ?? [], country_filter: options.country ?? [],
    schedule_filter: options.schedule ?? [], city_filter: options.city ?? [], source_filter: options.source ?? [],
  };
  if (!catalog.periods.includes(criteria.period_days)) throw new CliError('invalid_arguments', `Период: ${catalog.periods.join(', ')} дней.`, 2);
  const properties = searchSchema(tools).properties as Record<string, Property>;
  const limit = properties.limit;
  if (!limit || criteria.limit < (limit.minimum ?? 1) || criteria.limit > (limit.maximum ?? 20)) {
    throw new CliError('invalid_arguments', 'Размер страницы должен быть от 1 до 20.', 2);
  }
  for (const key of ['salary_buckets', 'country_filter', 'schedule_filter', 'city_filter', 'source_filter'] as const) {
    const property = properties[key];
    if (!property) throw new CliError('contract_error', 'Схема фильтров сервиса изменилась.');
    const values = criteria[key];
    if (property.maxItems !== undefined && values.length > property.maxItems) throw new CliError('invalid_arguments', `Слишком много значений ${key}.`, 2);
    const allowed = property.items?.enum;
    if (allowed && values.some(value => !allowed.includes(value))) throw new CliError('invalid_arguments', `Неизвестное значение ${key}. Смотрите filters guide.`, 2);
  }
  if (criteria.city_filter.some(value => !/^(?:[0-9]{1,9}|unknown)$/.test(value))) throw new CliError('invalid_arguments', 'Города задаются ID из locations search или unknown.', 2);
  return criteria;
}
