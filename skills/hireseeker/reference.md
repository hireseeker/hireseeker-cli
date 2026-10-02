# Команды для агента

```bash
hireseeker professions list --json
hireseeker locations search "Москва" --country RU --json
hireseeker filters guide --json
hireseeker vacancy search --category python_backend --period 7 --limit 5 --json
hireseeker vacancy search --category backend --salary-bucket 150_249k,250_349k --no-without-salary --json
hireseeker vacancy read 10056013 --json
```

ID в примере не гарантирует актуальность; используйте ID из текущей выдачи. Значения кодов проверяйте через живой каталог и guide. Не добавляйте неподдерживаемые фильтры.

У `vacancy search --json` полезны `vacancies`, `applied_filters`, `searched_at`, `total_items`, `next_cursor`. Продолжение передаёт только курсор, например `hireseeker vacancy search --cursor "CURSOR_ИЗ_ОТВЕТА" --json`. Не генерируйте курсор самостоятельно.

stdout содержит данные, stderr — ошибку `{ "error": { "code": "...", "message": "..." } }`. Парсите JSON, не текстовый вывод. Код завершения `0` — успех, `2` — неверные аргументы, `1` — ошибка, `130/143` — отмена. Ошибка `tool_error` может означать снятую вакансию, истёкший снимок или отказ сервиса; используйте сообщение, не обещайте отсутствующий машинный код сервера.

Курсор с истёкшим снимком не перезапускается автоматически. Уточните сохранённые критерии и создайте новый поиск. Ошибка сети или rate limit не означает пустую выдачу. Не запускайте массовые или параллельные запросы; запрашивайте только нужные пользователю страницы и карточки.
