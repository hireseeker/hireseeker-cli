
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

## Пример результата

Фрагмент одной карточки из реального ответа HireSeeker от 3 октября 2026 года; показана часть полей `vacancies`. Для актуальности выполните новый поиск:

```json
{
  "id": 9983095,
  "title": "Python (AI-native) разработчик",
  "employer": "сёрф",
  "salary": null,
  "schedule": "remote",
  "location": "Санкт-Петербург",
  "open_url": "https://hireseeker.ru/vacancy/9983095-python-ai-native-razrabotchik?utm_source=chatgpt&utm_medium=mcp&utm_campaign=hireseeker_plugin",
  "contact_access": "available"
}
```

В обычной подборке прочитайте карточку, если описание обрезано, и извлеките задачи, требования и условия. Не заполняйте отсутствующие данные догадками. Для краткой выдачи достаточно:

> **Python (AI-native) разработчик — сёрф**
>
> Удалённая работа, Санкт-Петербург. Зарплата не указана.
>
> [Открыть вакансию](https://hireseeker.ru/vacancy/9983095-python-ai-native-razrabotchik?utm_source=chatgpt&utm_medium=mcp&utm_campaign=hireseeker_plugin)

`salary: null` означает «зарплата не указана». Используйте исходную валюту, `open_url` и фактические `applied_filters`. Число `total_items` относится к снимку поиска, а не к числу показанных карточек.
