# Подготовка и публикация

Версия `0.1.1` подготовлена к выпуску. CI не публикует пакет автоматически.

1. Обновите версию в `package.json` и `npm-shrinkwrap.json`, если готовите следующий выпуск.
2. Загрузите commit в GitHub и дождитесь зелёного **CLI acceptance** на точном SHA. CI собирает один tarball и проверяет его установку на Linux, macOS и Windows, Node.js 22 и 24.
3. Скачайте артефакт **npm-package**. В нём находятся `hireseeker-cli-VERSION.tgz` и `receipt.json` с SHA commit и SHA-256 tarball. Сверьте хеш. Production smoke должен проходить этим же артефактом.

Из checkout репозитория проверьте скачанный артефакт лёгкой командой. Вместо `FULL_COMMIT_SHA` укажите полный SHA зелёного CI; каталог содержит tarball и `receipt.json`:

```bash
RELEASE_PACKAGE_DIR=/path/to/npm-package
npm run artifact:check -- "$RELEASE_PACKAGE_DIR" FULL_COMMIT_SHA
```

Она проверяет имя пакета и tarball, версию, commit и SHA256 без установки, build или запуска пакета. Команда возвращает ненулевой код при несовпадении; установку или публикацию тогда не продолжайте. Receipt должен поступить из того же проверенного CI, что и tarball.

4. Установите **этот же проверенный tarball** в отдельный prefix и выполните обязательный production smoke. Из корня checkout, заменив путь к архиву:

```bash
RELEASE_CHECK_PREFIX=$(mktemp -d)
npm install --prefix "$RELEASE_CHECK_PREFIX" --ignore-scripts --no-audit --no-fund "$RELEASE_PACKAGE_DIR/hireseeker-cli-0.1.1.tgz" &&
node scripts/live-smoke.mjs "$RELEASE_CHECK_PREFIX/node_modules/hireseeker-cli/bin/hireseeker.js"
```

Продолжайте только при коде завершения 0: smoke должен действительно прочитать следующую страницу. При недоступном API, отсутствии курсора или другой ошибке остановите выпуск; не подменяйте проверку локальным build или другим архивом. После проверки удалите созданный временный prefix. Для установки нового набора skills используйте временный HOME, сохраняя пользовательские файлы.

5. После разрешения пользователя на публикацию выполните `npm login --auth-type=web --registry=https://registry.npmjs.org` в своём терминале. Для публикации с обычным входом в аккаунте должна быть включена 2FA: npm может запросить отдельное подтверждение в браузере. Подтвердите его своей 2FA; коды и токены не отправляйте в чат и не коммитьте `.npmrc` с credentials. [Настройка 2FA](https://docs.npmjs.com/configuring-two-factor-authentication/).
6. Опубликуйте тот же проверенный tarball:

```bash
npm publish "$RELEASE_PACKAGE_DIR/hireseeker-cli-0.1.1.tgz" --access public --ignore-scripts --registry=https://registry.npmjs.org
```

7. Проверьте registry и команды из опубликованного пакета:

```bash
npm view hireseeker-cli@0.1.1 version
npx --yes hireseeker-cli@0.1.1 --version
npx --yes hireseeker-cli@0.1.1 professions list --json
```

Сверьте `dist.integrity` опубликованной версии с SHA-512 проверенного tarball. Опубликованная версия npm не перезаписывается. После подтверждённой публикации можно создать GitHub Release с тем же tarball и receipt.

## Skill и каталоги

Skill доступен из публичного GitHub-репозитория независимо от публикации CLI:

```bash
npx skills add hireseeker/hireseeker-cli --skill hireseeker
```

Проверьте установку в временном проекте и HOME: должны присутствовать `SKILL.md` и `reference.md`. Инструкции должны соответствовать опубликованной версии CLI. skills.sh обнаруживает репозиторий по телеметрии установок; отдельная загрузка в каталог не нужна. Не создавайте повторные установки ради счётчика. Если телеметрия отключена, установка не способствует появлению в каталоге.

npm.io индексирует npm-пакеты; публикация выполняется в registry.npmjs.org. `npx` использует `bin` из опубликованного пакета и не требует отдельного размещения. Появление в поисковых каталогах может отставать от публикации в реестре.

Для проверки без registry установите скачанный tarball через `npm install -g ./hireseeker-cli-0.1.1.tgz`. Команда `init` скачивает свою версию из npm, поэтому до первой публикации используйте ручную установку tarball и `hireseeker skill`.
