
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError } from './errors.js';
import { PACKAGE_ROOT, VERSION } from './config.js';
import { installGlobal, NpmInstallError, type NpmRunner } from './npm.js';
export { installGlobal, type NpmRunner } from './npm.js';

const MARKER = '.hireseeker-cli-install.json';
export const AGENTS = ['claude', 'codex', 'cursor', 'opencode', 'gemini', 'antigravity'] as const;
type AgentName = typeof AGENTS[number];
type Target = { agent: AgentName; home: string; path: string };
export type InstallResult = { agent: AgentName; path: string; status: 'installed' | 'skipped' | 'failed'; reason?: string; recovery_path?: string };
export type SkillFileOperations = { rename: typeof rename; rm: typeof rm };
export type SetupOptions = { env?: NodeJS.ProcessEnv; home?: string; packageRoot?: string; agents?: string[]; signal?: AbortSignal };

export function setupReason(reason: string): string {
  const messages: Record<string, string> = {
    npm_install_failed: 'npm завершился с ошибкой; проверьте доступ к registry и права на глобальную установку',
    npm_not_found: 'npm не найден в PATH; установите Node.js с npm',
    npm_spawn_failed: 'не удалось запустить npm; проверьте PATH и права на executable',
    npm_install_timeout: 'превышен лимит времени; дерево процессов npm принудительно остановлено',
    npm_termination_failed: 'не удалось подтвердить остановку дерева npm; проверьте процессы перед повтором',
    skill_permission_denied: 'нет прав на каталог skill', skill_not_directory: 'один из компонентов пути не является каталогом',
    skill_disk_full: 'на диске нет свободного места', skill_read_only: 'каталог находится на диске только для чтения',
    skill_missing_path: 'не найден файл или каталог для установки', skill_install_failed: 'не удалось установить skill',
    skill_cleanup_pending: 'skill установлен; прежняя копия не удалена, проверьте её перед ручной очисткой',
    skill_restore_failed: 'не удалось вернуть прежний skill; он сохранён по указанному резервному пути',
    skill_detection_failed: 'не удалось проверить каталог агента; проверьте путь и права на его чтение',
    installation_locked: 'каталог установки заблокирован другим запуском',
    existing_skill_modified_or_unowned: 'существующий skill сохранён: он изменён или установлен другим способом',
  };
  return messages[reason] ?? reason;
}

export function targets(env: NodeJS.ProcessEnv, home: string): Target[] {
  const config = env.XDG_CONFIG_HOME || join(home, '.config');
  const homes = {
    claude: env.CLAUDE_CONFIG_DIR || join(home, '.claude'), codex: env.CODEX_HOME || join(home, '.codex'),
    cursor: join(home, '.cursor'), opencode: join(config, 'opencode'),
    gemini: join(home, '.gemini'), antigravity: join(home, '.gemini', 'antigravity'),
  };
  return AGENTS.map(agent => ({ agent, home: homes[agent], path: join(homes[agent], 'skills', 'hireseeker') }));
}

export function checkAgents(agents?: string[]): void {
  if (agents?.some(agent => !AGENTS.includes(agent as AgentName))) throw new CliError('invalid_arguments', `Агенты: ${AGENTS.join(', ')}.`, 2);
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Хеши защищают изменённый skill и дополнительные пользовательские файлы. */
async function hashes(root: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!prefix && entry.name === MARKER) continue;
    if (entry.isSymbolicLink()) throw new Error('symlink');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(result, await hashes(root, relative));
    else if (entry.isFile()) result[relative] = createHash('sha256').update(await readFile(join(root, relative))).digest('hex');
    else throw new Error('unsupported_file');
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

async function owned(path: string): Promise<boolean> {
  try {
    if (!(await lstat(path)).isDirectory()) return false;
    const marker = JSON.parse(await readFile(join(path, MARKER), 'utf8'));
    return marker.package === 'hireseeker-cli' && JSON.stringify(marker.hashes) === JSON.stringify(await hashes(path));
  } catch { return false; }
}

async function installOne(target: Target, source: string, operations: SkillFileOperations): Promise<InstallResult> {
  const { rename, rm } = operations;
  const parent = join(target.home, 'skills');
  const lock = join(parent, '.hireseeker-cli.lock');
  let locked = false;
  let lockAttempted = false;
  let staging: string | undefined;
  let backup: string | undefined;
  try {
    await mkdir(parent, { recursive: true });
    lockAttempted = true;
    await mkdir(lock); locked = true;
    if (await exists(target.path) && !await owned(target.path)) return { agent: target.agent, path: target.path, status: 'skipped', reason: 'existing_skill_modified_or_unowned' };
    staging = await mkdtemp(join(parent, '.hireseeker-cli-'));
    // mkdtemp уже создал пустой каталог; пользовательские файлы сюда не попадают.
    await cp(source, staging, { recursive: true, errorOnExist: false, force: false });
    const manifest = { package: 'hireseeker-cli', version: VERSION, hashes: await hashes(staging) };
    await writeFile(join(staging, MARKER), JSON.stringify(manifest));
    if (await exists(target.path)) {
      if (!await owned(target.path)) return { agent: target.agent, path: target.path, status: 'skipped', reason: 'existing_skill_modified_or_unowned' };
      backup = `${staging}-previous`;
      await rename(target.path, backup);
    }
    try { await rename(staging, target.path); staging = undefined; }
    catch (error) {
      if (backup) {
        try { await rename(backup, target.path); backup = undefined; }
        catch { return { agent: target.agent, path: target.path, status: 'failed', reason: 'skill_restore_failed', recovery_path: backup }; }
      }
      throw error;
    }
    if (backup) {
      try { await rm(backup, { recursive: true }); backup = undefined; }
      catch { return { agent: target.agent, path: target.path, status: 'installed', reason: 'skill_cleanup_pending', recovery_path: backup }; }
    }
    return { agent: target.agent, path: target.path, status: 'installed' };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const reasons: Record<string, string> = { EACCES: 'skill_permission_denied', EPERM: 'skill_permission_denied', ENOTDIR: 'skill_not_directory', ENOSPC: 'skill_disk_full', EROFS: 'skill_read_only', ENOENT: 'skill_missing_path' };
    const reason = code === 'EEXIST' && !lockAttempted ? 'skill_not_directory'
      : code === 'EEXIST' && !locked ? 'installation_locked' : reasons[code ?? ''] ?? 'skill_install_failed';
    return { agent: target.agent, path: target.path, status: 'failed', reason };
  } finally {
    if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    if (locked) await rm(lock, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Проверяем источник до установки: локальный дефект пакета не является сетевой ошибкой. */
async function prepareSource(options: SetupOptions): Promise<string> {
  const source = join(options.packageRoot ?? PACKAGE_ROOT, 'skills', 'hireseeker');
  try {
    const entry = await lstat(join(source, 'SKILL.md'));
    if (!entry.isFile() || entry.size === 0) throw new Error('invalid_skill');
    await hashes(source);
    return source;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError('skill_missing', 'Пакет не содержит skill. Переустановите CLI.');
    }
    throw new CliError('skill_invalid', 'Skill в пакете повреждён или недоступен. Переустановите CLI.');
  }
}

async function installSkillsWithOperations(options: SetupOptions, operations: SkillFileOperations): Promise<{ skill: string; agents: InstallResult[]; ok: boolean }> {
  checkAgents(options.agents);
  const env = options.env ?? process.env;
  const source = await prepareSource(options);
  const results: InstallResult[] = [];
  for (const target of targets(env, options.home ?? homedir())) {
    if (options.agents && !options.agents.includes(target.agent)) continue;
    if (options.signal?.aborted) throw new CliError('cancelled', 'Установка отменена.', options.signal.reason === 143 ? 143 : 130);
    if (!options.agents) {
      try { if (!(await stat(target.home)).isDirectory()) continue; }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTDIR') results.push({ agent: target.agent, path: target.path, status: 'failed', reason: 'skill_detection_failed' });
        continue;
      }
    }
    results.push(await installOne(target, source, operations));
  }
  return { skill: 'hireseeker', agents: results, ok: results.length > 0 && results.every(result => result.status === 'installed') };
}

/** Инъекция файловых операций позволяет детерминированно проверить отказ замены и отката. */
export function createSkillInstaller(operations: Partial<SkillFileOperations> = {}) {
  const files = { rename, rm, ...operations };
  return (options: SetupOptions = {}) => installSkillsWithOperations(options, files);
}
export const installSkills = createSkillInstaller();

export async function initialize(options: SetupOptions = {}, runner: NpmRunner = installGlobal): Promise<Record<string, unknown>> {
  checkAgents(options.agents);
  await prepareSource(options);
  let installed = false;
  let failure: NpmInstallError | undefined;
  try { installed = await runner(VERSION, options.env ?? process.env, options.signal); }
  catch (error) {
    if (options.signal?.aborted) throw new CliError('cancelled', 'Установка отменена.', options.signal.reason === 143 ? 143 : 130);
    if (error instanceof NpmInstallError) failure = error;
  }
  if (options.signal?.aborted) throw new CliError('cancelled', 'Установка отменена.', options.signal.reason === 143 ? 143 : 130);
  const skills = await installSkills(options);
  return { version: VERSION, global: { installed, reason: installed ? null : failure?.reason ?? 'npm_install_failed', ...failure?.details }, ...skills, ok: installed && skills.ok };
}
