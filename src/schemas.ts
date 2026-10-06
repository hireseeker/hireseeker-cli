
import { z } from 'zod';

// Ссылки вакансий открываются пользователем или агентом: разрешены только веб-схемы.
const webUrl = z.string().url().refine(value => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
});
const option = z.looseObject({ code: z.string(), name_ru: z.string() });
export const catalogSchema = z.looseObject({
  groups: z.array(option.extend({ members: z.array(option) })),
  supergroups: z.array(option.extend({ group_codes: z.array(z.string()) })),
  salaries: z.array(z.looseObject({ code: z.string(), min_rub: z.number().nullable(), max_rub_exclusive: z.number().nullable() })),
  countries: z.array(option), schedules: z.array(z.string()), periods: z.array(z.number().int()),
  unsupported_filters: z.array(z.string()), salary_note: z.string(), period_note: z.string(),
});
export const criteriaSchema = z.looseObject({
  category_code: z.string(), period_days: z.number().int(), limit: z.number().int(),
  include_english: z.boolean(), hide_auto_bumped: z.boolean(), include_without_salary: z.boolean(),
  salary_buckets: z.array(z.string()), country_filter: z.array(z.string()), schedule_filter: z.array(z.string()),
  city_filter: z.array(z.string()), source_filter: z.array(z.string()),
});
export const jobSchema = z.looseObject({
  id: z.number().int().safe().positive(), title: z.string(), employer: z.string(),
  salary: z.looseObject({ from: z.number().nullable(), to: z.number().nullable(), currency: z.string() }).nullable(),
  schedule: z.string().nullable(), location: z.string().nullable(), countries: z.array(z.string()),
  description: z.string(), description_truncated: z.boolean(), profession_codes: z.array(z.string()),
  published_at: z.string().nullable(), seen_at: z.string().nullable(), search_appeared_at: z.string().nullable(),
  auto_bumped: z.boolean(), url: webUrl, open_url: webUrl,
  contact_access: z.enum(['available', 'restricted', 'unavailable']),
});
export const pageSchema = z.looseObject({
  vacancies: z.array(jobSchema), applied_filters: criteriaSchema,
  total_items: z.number().int().nonnegative(), searched_at: z.string(), next_cursor: z.string().regex(/^[A-Za-z0-9_-]{32}:[0-9]{1,7}$/).nullable(),
});
export const locationsSchema = z.looseObject({
  countries: z.array(option),
  cities: z.array(z.looseObject({ id: z.number().int().safe(), name: z.string(), country_iso: z.string().nullable(), count: z.number().int() })),
});
export type Catalog = z.infer<typeof catalogSchema>;
export type Criteria = z.infer<typeof criteriaSchema>;
export type Job = z.infer<typeof jobSchema>;
export type Page = z.infer<typeof pageSchema>;
