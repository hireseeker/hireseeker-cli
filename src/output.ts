import { clean } from './errors.js';
import type { Catalog, Job, Page } from './schemas.js';

export const text = (value: unknown): string => clean(value).trim() || 'не указано';

export function salary(job: Job): string {
  if (!job.salary || (job.salary.from === null && job.salary.to === null)) return 'не указано';
  const value = job.salary;
  const amounts = [value.from === null ? '' : `от ${value.from}`, value.to === null ? '' : `до ${value.to}`].filter(Boolean);
  return `${amounts.join(' ')} ${text(value.currency)}`;
}

export function renderJob(job: Job): string {
  const lines = [
    `${job.id} · ${text(job.title)}`, `Работодатель: ${text(job.employer)}`,
    `Зарплата: ${salary(job)}`, `Формат: ${text(job.schedule)} · Место: ${text(job.location)}`,
    text(job.description),
  ];
  if (job.description_truncated) lines.push(`Описание обрезано. Подробности: hireseeker vacancy read ${job.id}`);
  if (job.contact_access === 'restricted') lines.push('Доступ к контактам можно получить на сайте.');
  if (job.contact_access === 'unavailable') lines.push('Контакты не указаны.');
  lines.push(clean(job.open_url));
  return lines.join('
');
}

export function renderPage(page: Page): string {
  const result = page.vacancies.length ? page.vacancies.map(renderJob).join('

') : 'На этой странице вакансий нет.';
  const lines = [result, '', `На странице: ${page.vacancies.length}. В снимке на ${text(page.searched_at)}: ${page.total_items}.`,
    `Применённые фильтры: ${JSON.stringify(page.applied_filters)}`];
  if (page.next_cursor) lines.push(`Следующая страница: hireseeker vacancy search --cursor "${clean(page.next_cursor)}"`);
  lines.push('Период и сортировка учитывают появление в выбранной категории, включая автоподнятия.');
  return lines.join('
');
}

export function renderCatalog(catalog: Catalog): string {
  const lines = ['Надгруппы:', ...catalog.supergroups.map(group => `${text(group.code)} · ${text(group.name_ru)}`), '', 'Группы и специализации:'];
  for (const group of catalog.groups) {
    lines.push(`${text(group.code)} · ${text(group.name_ru)}`);
    for (const member of group.members) lines.push(`  ${text(member.code)} · ${text(member.name_ru)}`);
  }
  return lines.join('
');
}
