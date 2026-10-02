# HireSeeker CLI

Поиск вакансий на [hireseeker.ru](https://hireseeker.ru) из терминала, IDE или AI-агента. CLI использует публичный MCP API; для поиска вход и API-ключ не нужны.

Версия `0.1.0` подготовлена к публикации. Пакет ещё не выпущен в npm: команды установки по имени заработают после публикации. Сейчас используйте tarball из GitHub Actions → **CLI acceptance** → **npm-package**.

## Установка подготовленного пакета

Требуется Node.js ≥22.12. CLI работает на Linux, macOS и Windows.

```bash
npm install -g ./hireseeker-cli-0.1.0.tgz
hireseeker --version
hireseeker professions list
```

После публикации станут доступны:

```bash
npm install -g hireseeker-cli
npx --yes hireseeker-cli vacancy search --category python_backend --json
npx --yes hireseeker-cli init
```

`init` устанавливает глобально ту же версию, которая выполняет команду, и инструкции для обнаруженных агентов. До выпуска версии в npm установите tarball вручную и запустите `hireseeker skill`. Поисковые команды не требуют установки skills или запуска `init`.

## Быстрый старт

```bash
hireseeker professions list
hireseeker locations search "Москва" --country RU
hireseeker vacancy search --category python_backend --schedule remote --limit 5
hireseeker vacancy read 10056013
```

Последний ID — пример. Для чтения используйте ID из своей выдачи. Категорию выбирайте из текущего каталога: специализация `python_backend`, группа `backend` или надгруппа `developers`.

CLI показывает краткое описание. Если оно обрезано, прочитайте карточку через `vacancy read`; подробное описание тоже может иметь предел. Контакты возвращаются с гостевыми правами: при `contact_access=restricted` доступ предоставляется на сайте.

## Фильтры

```bash
hireseeker filters guide
hireseeker vacancy search --category backend --period 14 \
  --schedule remote,hybrid --country RU,KZ \
  --salary-bucket 150_249k,250_349k --no-without-salary --no-english
```

По умолчанию: 7 дней, 5 вакансий, включены английские вакансии, вакансии без зарплаты и автоподнятия. Размер страницы — до 20. Период и сортировка используют появление в выбранной категории, включая автоподнятия; `published_at` остаётся датой источника.

Свободный текст, грейд и точный порог зарплаты API не поддерживает. Диапазоны зарплаты совпадают с витриной сайта. Неизвестные опции отклоняются, фильтры не игнорируются молча.

## JSON и пагинация

```bash
hireseeker vacancy search --category python_backend --json > page.json
```

stdout содержит JSON API с `vacancies`, `applied_filters`, `total_items`, `searched_at` и `next_cursor`. Для следующей страницы скопируйте `next_cursor`:

```bash
hireseeker vacancy search --cursor "CURSOR_ИЗ_ОТВЕТА" --json
```

Курсор живёт 10 минут. Передавайте его без категории и фильтров. Истёкший снимок требует нового поиска; CLI не перезапускает его автоматически. `total_items` относится к исходному снимку: после снятия вакансий страница может стать короче или пустой при наличии следующего курсора.

Ошибки идут в stderr. С `--json` они тоже имеют JSON-формат. Подробности и коды завершения — в [справочнике](docs/commands.md).

## AI-агенты

```bash
hireseeker skill
hireseeker skill --agent codex,cursor
```

Поддерживаются Claude Code, Codex, Cursor, OpenCode, Gemini CLI и Antigravity. Без `--agent` выбираются обнаруженные агенты. Явный выбор позволяет создать каталог skill для ещё не настроенного агента. Установка учитывает `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `XDG_CONFIG_HOME`.

Skills копируются из установленного пакета и сохраняются после удаления кеша `npx`. Повторная установка обновляет собственный неизменённый skill. Чужие или отредактированные файлы сохраняются; команда сообщает о пропуске и возвращает ненулевой код. Для обновления skills после обновления CLI повторите `hireseeker skill`.

Инструкции также доступны в [skills/hireseeker](skills/hireseeker/SKILL.md).

## Разработка и выпуск

[Разработка](docs/development.md) · [Выпуск](docs/release.md) · [Команды и ошибки](docs/commands.md)

Лицензия: MIT.
