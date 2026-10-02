# Команды и ошибки

Глобальные опции: `--json`, `--help`, `--version`. `--help` и `--version` работают без сети. Для каждой команды доступен отдельный `--help`.

| Команда | Назначение |
|---|---|
| `professions list` | Живой каталог категорий и доступных фильтров |
| `locations search <query> [--country <code>]` | Поиск стран и городов; для города возвращается ID |
| `filters guide` | Правила фильтрации; JSON содержит `catalog` и `search_schema` |
| `vacancy search --category <code>` | Новый поиск |
| `vacancy search --cursor <cursor>` | Следующая страница того же снимка |
| `vacancy read <id>` | Подробная гостевая карточка |
| `init [--agent <names>]` | Глобальная установка текущей версии и skills |
| `skill [--agent <names>]` | Только установка skills |

## Опции нового поиска

| Опция | Поле API | Значения |
|---|---|---|
| `--category` | `category_code` | Код из текущего каталога |
| `--period` | `period_days` | 1, 3, 7, 14, 30; по умолчанию 7 |
| `--limit` | `limit` | 1–20; по умолчанию 5 |
| `--salary-bucket` | `salary_buckets` | `lte_149k`, `150_249k`, `250_349k`, `gte_350k` |
| `--country` | `country_filter` | Коды стран из схемы; `unknown` для неуказанной страны |
| `--city` | `city_filter` | ID из `locations search` или `unknown` |
| `--schedule` | `schedule_filter` | `remote`, `hybrid`, `office`, `unknown` |
| `--source` | `source_filter` | `hh`, `other`, `hireseeker`, `social`, `company` |
| `--no-english` | `include_english=false` | Исключить английские вакансии |
| `--no-without-salary` | `include_without_salary=false` | Исключить вакансии без зарплаты |
| `--hide-auto-bumped` | `hide_auto_bumped=true` | Исключить автоподнятые вакансии |

Списки принимают значения через запятую или повторение флага, например `--country RU --country KZ`. Коды проверяются по живому контракту сервиса. `--cursor` несовместим со всеми опциями нового поиска.

В `SalaryInfo` сохраняются исходная валюта, поля `from`, `to` и дополнительные поля API. Текстовый вывод показывает исходные суммы и валюту, не пересчитывает их. Зарплатные диапазоны фильтра заданы в рублях: нижняя граница включена, верхняя исключена.

CLI не имеет отдельного входа, скрытия компаний, откликов или сохранённых подборок. `open_url` и `url` сохраняются из API, включая серверные параметры ссылок.

## Ошибки

| Код завершения | Значение |
|---|---|
| 0 | Успех, включая пустую выдачу |
| 1 | Ошибка сервиса, сети, контракта или неполная установка |
| 2 | Неверные аргументы или endpoint |
| 130 / 143 | Отмена SIGINT / SIGTERM, если платформа доставляет эти сигналы |

При `--json` stderr содержит `{ "error": { "code": "tool_error", "message": "..." } }`. stdout у сетевой ошибки пуст. `init` и `skill` при частичном сбое сохраняют отчёт в stdout и отдельно сообщают `setup_incomplete` в stderr.

Коды CLI: `invalid_arguments`, `invalid_endpoint`, `network_error`, `network_timeout`, `tool_error`, `contract_error`, `cancelled`, `skill_missing`, `setup_incomplete`. MCP может сообщать снятую вакансию и истёкший снимок текстом: CLI сохраняет сообщение под `tool_error` и не придумывает отсутствующие серверные коды.

Сетевой лимит времени команды — 30 секунд. Автоматических повторов нет. Глобальная установка через npm имеет отдельный лимит 180 секунд. При сетевой ошибке или 429 выдача не подменяется пустым результатом.

## Настройки и установка skills

`HIRESEEKER_MCP_URL` переопределяет endpoint. По умолчанию: `https://hireseeker.ru/mcp`. Разрешён HTTPS; HTTP допускается только для loopback при разработке. URL с credentials, query или fragment отклоняется без вывода его содержимого.

| Агент | Каталог |
|---|---|
| Claude Code | `${CLAUDE_CONFIG_DIR:-~/.claude}/skills/hireseeker` |
| Codex | `${CODEX_HOME:-~/.codex}/skills/hireseeker` |
| Cursor | `~/.cursor/skills/hireseeker` |
| OpenCode | `${XDG_CONFIG_HOME:-~/.config}/opencode/skills/hireseeker` |
| Gemini CLI | `~/.gemini/skills/hireseeker` |
| Antigravity | `~/.gemini/antigravity/skills/hireseeker` |

В skill записывается `.hireseeker-cli-install.json` с версией и хешами файлов. Установщик защищает изменённые и дополнительные файлы. Причина `existing_skill_modified_or_unowned` означает, что существующий skill сохранён. Символическая ссылка вместо каталога skill тоже сохраняется.

`installation_locked` означает параллельную установку или оставшийся после аварийного завершения каталог `.hireseeker-cli.lock` рядом со skill. Перед удалением блокировки убедитесь, что другая установка завершена. При других сбоях проверьте права на каталог и свободное место; команда не запускает sudo и не меняет права агентов.
