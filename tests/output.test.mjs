import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './runtime.mjs';
const { clean } = await load('errors');
const { renderJob, renderPage, salary } = await load('output');
import { job, page } from './helpers.mjs';

test('Отсутствующие сведения обозначаются без выдуманных значений', () => {
  const result = renderJob({ ...job, employer: '', salary: null, schedule: null, location: '', description: '', contact_access: 'unavailable' });
  assert.match(result, /Работодатель: не указано/); assert.match(result, /Зарплата: не указано/);
  assert.match(result, /Формат: не указано · Место: не указано/); assert.match(result, /Контакты не указаны/);
});
test('Нулевая зарплата и валюта сохраняются', () => {
  assert.equal(salary({ ...job, salary: { from: 0, to: 100, currency: 'EUR' } }), 'от 0 до 100 EUR');
});
test('Терминальные управляющие последовательности не выполняются', () => {
  assert.equal(clean('a\x1b[2Jb\x1b]0;title\x07c\x00'), 'abc');
  assert.equal(clean('a\x1b]8;;https://example.com\x1b\\b\x1b]8;;\x1b\\'), 'ab');
});
test('Пустая промежуточная страница сохраняет курсор и число снимка', () => {
  const result = renderPage({ ...page, vacancies: [] });
  assert.match(result, /На этой странице вакансий нет/); assert.match(result, /--cursor/); assert.match(result, /: 3/);
});
