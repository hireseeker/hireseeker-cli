import { Command } from 'commander';
import { VERSION } from './config.js';
import { CliError, normalizeError, clean } from './errors.js';
import { buildCriteria, checkSearchOptions, csv, integer, searchSchema, type SearchOptions } from './filters.js';
import { withClient, type HireSeekerClient } from './mcp.js';
import { renderCatalog, renderJob, renderPage, text } from './output.js';
import { catalogSchema, jobSchema, locationsSchema, pageSchema } from './schemas.js';
import { initialize, installSkills, checkAgents, type NpmRunner, type InstallResult } from './setup.js';

type Dependencies = {
  env?: NodeJS.ProcessEnv; signal?: AbortSignal; home?: string; packageRoot?: string;
  stdout?: (text: string) => void; stderr?: (text: string) => void; npmRunner?: NpmRunner;
};

function setupText(result: Record<string, unknown>): string {
  const lines: string[] = [];
  const global = result.global as { installed: boolean } | undefined;
  if (global) lines.push(global.installed ? `CLI ${VERSION} установлен глобально.` : 'Глобальная установка не выполнена. До публикации используйте npm-tarball; после публикации доступен npx.');
  const agents = result.agents as InstallResult[];
  if (!agents.length) lines.push('Поддерживаемые агенты не обнаружены. Укажите skill --agent codex (или другого агента).');
  for (const agent of agents) {
    const status = agent.status === 'installed' ? 'установлен' : agent.status === 'skipped' ? 'сохранён существующий skill' : 'установка не выполнена';
    lines.push(`${agent.agent}: ${status}${agent.reason ? ` (${agent.reason})` : ''}. ${clean(agent.path)}`);
  }
  return lines.join('\n');
}

export async function run(argv: string[], dependencies: Dependencies = {}): Promise<number> {
  const env = dependencies.env ?? process.env;
  const stdout = dependencies.stdout ?? (value => process.stdout.write(value));
  const stderr = dependencies.stderr ?? (value => process.stderr.write(value));
  const program = new Command();
  let exitCode = 0;
  const output = (data: unknown, render: () => string) => stdout(program.opts().json ? `${JSON.stringify(data)}\n` : `${render()}\n`);
  const online = (action: (client: HireSeekerClient) => Promise<void>) => withClient(env, dependencies.signal, action);
  const setup = { env, home: dependencies.home, packageRoot: dependencies.packageRoot, signal: dependencies.signal };
  program.name('hireseeker').description('Поиск вакансий HireSeeker из терминала и AI-агентов.')
    .version(VERSION).option('--json', 'Машиночитаемый JSON; ошибки JSON в stderr.')
    .exitOverride().configureOutput({ writeOut: stdout, writeErr: () => undefined });

  const professions = program.command('professions').description('Живой каталог профессий.');
  professions.command('list').description('Надгруппы, группы и специализации.').action(() => online(async client => {
    const catalog = await client.call('get_professions', {}, catalogSchema);
    output(catalog, () => renderCatalog(catalog));
  }));

  const locations = program.command('locations').description('Поиск стран и городов.');
  locations.command('search').argument('<query>', 'Название страны или города.')
    .option('--country <code>', 'Ограничить города кодом страны, например RU.')
    .description('Вернуть географические коды для фильтров.').action((query: string, options: { country?: string }) => {
      if (!query.trim()) throw new CliError('invalid_arguments', 'Укажите название страны или города.', 2);
      return online(async client => {
        const args: Record<string, unknown> = { query };
        if (options.country !== undefined) args.country_code = options.country;
        const result = await client.call('search_locations', args, locationsSchema);
        output(result, () => [
          ...result.countries.map(country => `${text(country.code)} · ${text(country.name_ru)}`),
          ...result.cities.map(city => `${city.id} · ${text(city.name)} · ${text(city.country_iso)}`),
        ].join('\n') || 'Местоположения не найдены.');
      });
    });

  const filters = program.command('filters').description('Доступные фильтры и ограничения.');
  filters.command('guide').description('Каталог и серверная схема фильтров.').action(() => online(async client => {
    const catalog = await client.call('get_professions', {}, catalogSchema);
    const schema = searchSchema(client.tools);
    output({ catalog, search_schema: schema }, () => {
      const properties = schema.properties as Record<string, { items?: { enum?: string[] } }>;
      return [
        'Категории: hireseeker professions list', `Период: ${catalog.periods.join(', ')} дней.`,
        'Размер страницы: 1–20, по умолчанию 5.',
        `Зарплата: ${catalog.salaries.map(item => `${item.code} [${item.min_rub ?? 'нет нижней границы'}; ${item.max_rub_exclusive ?? 'нет верхней границы'}) RUB`).join(', ')}`,
        catalog.salary_note, 'Вакансии без зарплаты включены; --no-without-salary исключает их.',
        `Страны: ${catalog.countries.map(country => `${country.code} (${country.name_ru})`).join(', ')}`,
        `Формат: ${catalog.schedules.join(', ')}`,
        `Источники: ${properties.source_filter?.items?.enum?.join(', ') ?? 'смотрите search_schema'}`,
        'Города: ID из locations search; unknown — местоположение не указано.',
        'Английские вакансии включены; --no-english исключает их.',
        'Автоподнятия включены; --hide-auto-bumped исключает их.',
        catalog.period_note, 'Свободный текст, грейд и точный порог зарплаты не поддерживаются.',
        'Снимок поиска живёт 10 минут. Продолжение: --cursor без других фильтров.',
      ].map(clean).join('\n');
    });
  }));

  const vacancy = program.command('vacancy').description('Поиск и чтение вакансий.');
  const search = vacancy.command('search').description('Поиск с фильтрами или следующая страница снимка.')
    .option('--category <code>', 'Код специализации, группы или надгруппы из каталога.')
    .option('--cursor <cursor>', 'Продолжить снимок без новых фильтров.')
    .option('--period <days>', 'Период: 1, 3, 7, 14 или 30 дней; по умолчанию 7.', integer)
    .option('--limit <count>', 'Размер страницы: 1–20; по умолчанию 5.', integer)
    .option('--salary-bucket <codes>', 'Коды диапазонов зарплаты через запятую.', csv)
    .option('--country <codes>', 'Коды стран через запятую.', csv)
    .option('--city <ids>', 'ID городов через запятую.', csv)
    .option('--schedule <codes>', 'Форматы работы через запятую.', csv)
    .option('--source <codes>', 'Группы источников через запятую.', csv)
    .option('--no-english', 'Исключить английские вакансии.')
    .option('--no-without-salary', 'Исключить вакансии без зарплаты.')
    .option('--hide-auto-bumped', 'Исключить автоподнятые вакансии.');
  search.action(() => {
    // Commander задаёт true для negated options: берём только явно переданные значения.
    const provided: SearchOptions = {};
    for (const [key, value] of Object.entries(search.opts())) {
      if (search.getOptionValueSource(key) === 'cli') Object.assign(provided, { [key]: value });
    }
    checkSearchOptions(provided);
    return online(async client => {
      let args: Record<string, unknown>;
      if (provided.cursor !== undefined) args = { cursor: provided.cursor };
      else {
        const catalog = await client.call('get_professions', {}, catalogSchema);
        args = { criteria: buildCriteria(provided, catalog, client.tools) };
      }
      const page = await client.call('search_vacancies', args, pageSchema);
      output(page, () => renderPage(page));
    });
  });
  vacancy.command('read').description('Подробная гостевая карточка вакансии.')
    .argument('<id>', 'ID из выдачи поиска.', integer).action((id: number) => {
      if (id < 1) throw new CliError('invalid_arguments', 'ID вакансии должен быть положительным.', 2);
      return online(async client => {
        const result = await client.call('get_vacancy', { vacancy_id: id }, jobSchema);
        output(result, () => renderJob(result));
      });
    });

  for (const name of ['init', 'skill']) {
    program.command(name).description(name === 'init' ? 'Установить текущую версию CLI глобально и skills.' : 'Установить только skills для AI-агентов.')
      .option('--agent <names>', 'Выбрать агентов через запятую; флаг можно повторять.', csv)
      .action(async (options: { agent?: string[] }) => {
        checkAgents(options.agent);
        const result = name === 'init' ? await initialize({ ...setup, agents: options.agent }, dependencies.npmRunner) : await installSkills({ ...setup, agents: options.agent });
        output(result, () => setupText(result));
        if (!result.ok) {
          exitCode = 1;
          const error = { error: { code: 'setup_incomplete', message: 'Установка выполнена не полностью. Проверьте отчёт по этапам.' } };
          stderr(program.opts().json ? `${JSON.stringify(error)}\n` : `${error.error.message}\n`);
        }
      });
  }
  try {
    if (argv.length <= 2) { program.outputHelp(); return 0; }
    await program.parseAsync(argv);
    return exitCode;
  } catch (error) {
    const normalized = normalizeError(error, dependencies.signal);
    if (normalized.exitCode === 0) return 0;
    const json = program.opts().json === true || argv.slice(2).some(value => value === '--json');
    stderr(json ? `${JSON.stringify({ error: { code: normalized.code, message: clean(normalized.message) } })}\n` : `${clean(normalized.message)}\n`);
    return normalized.exitCode;
  }
}
