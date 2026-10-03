# HireSeeker CLI

Поиск вакансий на [hireseeker.ru](https://hireseeker.ru) из терминала, IDE или AI-агента. CLI использует публичный API; для поиска вход и API-ключ не нужны.

## Установка

Требуется Node.js ≥22.12. CLI работает на Linux, macOS и Windows.

```bash
npm install -g hireseeker-cli
hireseeker --version
hireseeker professions list
```

Без глобальной установки:

```bash
npx --yes hireseeker-cli@0.1.0 vacancy search --category python_backend --json
npx --yes hireseeker-cli@0.1.0 init
```

`init` устанавливает глобально ту же версию, которая выполняет команду, и инструкции для обнаруженных агентов. Поисковые команды не требуют установки skills или запуска `init`.

Версию в реестре можно проверить командой `npm view hireseeker-cli version`. Если выпуск ещё не появился в npm, скачайте tarball из GitHub Actions → **CLI acceptance** → **npm-package** и установите его через `npm install -g ./hireseeker-cli-0.1.0.tgz`. Для установки инструкций из tarball используйте `hireseeker skill`.

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

### Установка через skills.sh

Установить только skill из публичного GitHub-репозитория:

```bash
npx skills add hireseeker/hireseeker-cli --skill hireseeker
```

Для Codex и Cursor без интерактивного выбора:

```bash
npx skills add hireseeker/hireseeker-cli --skill hireseeker --agent codex cursor --yes
```

По умолчанию skill устанавливается в текущий проект; `--global` устанавливает его для пользователя. Этот способ использует установщик `skills`. Команда `hireseeker skill` устанавливает инструкции из версии npm-пакета и применяет описанную выше защиту пользовательских файлов. Выберите один способ установки для каждого агента.

Skill запускает `hireseeker`, если CLI установлен глобально, или `npx --yes hireseeker-cli@0.1.0`. Установка самого skill не требует глобальной установки CLI.

[Каталог skills.sh](https://skills.sh/hireseeker/hireseeker-cli) · [Исходный skill](skills/hireseeker/SKILL.md)

## Разработка и выпуск

[Разработка](docs/development.md) · [Выпуск](docs/release.md) · [Команды и ошибки](docs/commands.md)

Лицензия: MIT.
