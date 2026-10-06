
# HireSeeker CLI — поиск вакансий из Telegram и карьерных сайтов

[HireSeeker](https://hireseeker.ru) собирает вакансии из Telegram-каналов и карьерных сайтов компаний. `hireseeker-cli` помогает искать работу из терминала, IDE и AI-агента: выбрать профессию и географию, отфильтровать удалённые, гибридные или офисные вакансии, прочитать карточку и получить ссылку на неё. Для поиска вход и API-ключ не нужны.

## Зачем нужен HireSeeker CLI

Вакансии из разных каналов и сайтов доступны в одном поиске. CLI возвращает работодателя, зарплату и валюту, формат работы, место, описание и ссылку на карточку. JSON подходит для скриптов и AI-агентов; skill помогает агенту выбрать поддерживаемые фильтры и объяснить результат человеку.

Используйте его, чтобы:

- искать вакансии по профессии, стране, городу и формату работы;
- выбирать диапазоны зарплаты, исключать вакансии без зарплаты или на английском;
- читать обязанности, требования и условия из карточки;
- получать следующие страницы выдачи и сохранять JSON для своих инструментов.

### Десять примеров карьерных источников

Среди подключённых карьерных источников: Яндекс, Сбер, Т-Банк, Ozon, Wildberries, VK, МТС, Альфа-Банк, Лаборатория Касперского и X5. Список показывает примеры известных работодателей; актуальные роли и условия проверяйте поиском.

HireSeeker также собирает вакансии из Telegram-каналов. CLI обращается к базе HireSeeker, а сбор вакансий выполняет сервис.

## Установка

Требуется Node.js ≥22.12. CLI работает на Linux, macOS и Windows.

```bash
npm install -g hireseeker-cli
hireseeker --version
hireseeker professions list
```

Без глобальной установки:

```bash
npx --yes hireseeker-cli@0.1.2 vacancy search --category python_backend --json
npx --yes hireseeker-cli@0.1.2 init
```

`init` устанавливает глобально ту же версию, которая выполняет команду, и инструкции для обнаруженных агентов. Поисковые команды не требуют установки skills или запуска `init`.

Версию в реестре можно проверить командой `npm view hireseeker-cli version`. Если выпуск ещё не появился в npm, скачайте tarball из GitHub Actions → **CLI acceptance** → **npm-package** и установите его через `npm install -g ./hireseeker-cli-0.1.2.tgz`. Для установки инструкций из tarball используйте `hireseeker skill`.

## Быстрый старт

```bash
hireseeker professions list
hireseeker locations search "Москва" --country RU
hireseeker vacancy search --category python_backend --schedule remote --limit 5
hireseeker vacancy read 10056013
```

Последний ID — пример. Для чтения используйте ID из своей выдачи. Категорию выбирайте из текущего каталога: специализация `python_backend`, группа `backend` или надгруппа `developers`.

CLI показывает краткое описание. Если оно обрезано, прочитайте карточку через `vacancy read`; подробное описание тоже может иметь предел. Контакты возвращаются с гостевыми правами: при `contact_access=restricted` доступ предоставляется на сайте.

## Что возвращает поиск

```bash
npx --yes hireseeker-cli@0.1.2 vacancy search --category python_backend --schedule remote --limit 2 --json
```

Ниже фрагмент одной карточки из реального ответа API от 3 октября 2026 года. Пример показывает часть полей из массива `vacancies`; вакансия может быть снята или изменена:

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

`salary: null` означает, что зарплата не указана. Ссылка `open_url` ведёт к карточке HireSeeker. Текстовый режим показывает эти сведения в терминале; JSON сохраняет поля API. Полный ответ поиска также содержит `applied_filters`, `total_items`, `searched_at` и `next_cursor`.

С установленным skill можно попросить агента: «Найди свежие вакансии Python-разработчика с удалённой работой». Он уточнит неоднозначные условия, выполнит поиск и прочитает обрезанные карточки. Краткий ответ по этой карточке может выглядеть так:

> **Python (AI-native) разработчик — сёрф**
>
> Удалённая работа, Санкт-Петербург. Зарплата не указана.
>
> [Открыть вакансию](https://hireseeker.ru/vacancy/9983095-python-ai-native-razrabotchik?utm_source=chatgpt&utm_medium=mcp&utm_campaign=hireseeker_plugin)

В содержательной подборке агент также приводит задачи, требования и условия, если они есть в прочитанной карточке. Детали не выдумываются; применённые фильтры показываются в ответе.

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

## DeepSeek Harness

Пакет также устанавливается как плагин [DeepSeek Harness](https://www.deepseek.com/en/harness/). Он подключает публичный MCP HireSeeker напрямую: поиск вакансий и подробности доступны в чате Harness без входа в HireSeeker.

В Harness откройте **Plugins → Add plugin**, укажите `hireseeker-cli@0.1.2`, установите пакет и выберите **Enable now**. Для установки из терминала:

```bash
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add hireseeker-cli@0.1.2
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 web
```

Плагин использует доступ к модели, настроенный пользователем в Harness. [Инструкция и примеры запросов](docs/deepseek.md) объясняют подключение, ограничения и отдельный сценарий для обычного чата DeepSeek.

[Community plugins DeepSeek Harness](https://github.com/topics/dsh-plugin) — публичный список репозиториев по ссылке с официального сайта DeepSeek. Установка плагина Harness не добавляет инструменты в `chat.deepseek.com`.

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

Skill запускает `hireseeker`, если CLI установлен глобально, или `npx --yes hireseeker-cli@0.1.2`. Установка самого skill не требует глобальной установки CLI.

[Каталог skills.sh](https://skills.sh/hireseeker/hireseeker-cli) · [Исходный skill](skills/hireseeker/SKILL.md)

## Разработка и выпуск

[Разработка](docs/development.md) · [Выпуск](docs/release.md) · [Команды и ошибки](docs/commands.md)

Лицензия: MIT.
