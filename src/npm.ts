
import spawn from 'cross-spawn';

export type NpmRunner = (version: string, env: NodeJS.ProcessEnv, signal?: AbortSignal) => Promise<boolean>;
export class NpmInstallError extends Error {
  constructor(readonly reason: string, readonly details: { exit_code?: number; system_code?: string; signal?: string } = {}) {
    super(reason);
  }
}

/** Отдельный process group позволяет остановить npm вместе с дочерними процессами. */
export function createNpmRunner(timeoutMs = 180_000, stopTimeoutMs = 5_000): NpmRunner {
  return (version, env, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new NpmInstallError('npm_cancelled')); return; }
    const child = spawn('npm', ['install', '--global', '--ignore-scripts', '--no-audit', '--no-fund', `hireseeker-cli@${version}`], {
      env, stdio: 'ignore', detached: process.platform !== 'win32', windowsHide: true,
    });
    let failure: NpmInstallError | undefined;
    let finished = false;
    let stopping = false;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let killer: ReturnType<typeof spawn> | undefined;
    const finish = (error?: NpmInstallError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(stopTimer);
      signal?.removeEventListener('abort', cancel);
      if (error?.reason === 'npm_termination_failed') { child.unref(); killer?.unref(); }
      if (error) reject(error); else resolve(true);
    };
    const stop = (reason: string) => {
      if (finished || failure) return;
      failure = new NpmInstallError(reason);
      stopTimer = setTimeout(() => {
        killer?.kill('SIGKILL');
        finish(new NpmInstallError('npm_termination_failed'));
      }, stopTimeoutMs);
      if (!child.pid) return; // Ошибка запуска придёт через error; таймер ограничивает ожидание.
      if (process.platform === 'win32') {
        stopping = true;
        killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        killer.once('error', () => finish(new NpmInstallError('npm_termination_failed')));
        killer.once('close', code => finish(code === 0 ? failure : new NpmInstallError('npm_termination_failed')));
      } else {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') finish(new NpmInstallError('npm_termination_failed'));
        }
      }
    };
    const cancel = () => stop('npm_cancelled');
    const timer = setTimeout(() => stop('npm_install_timeout'), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    child.once('error', error => {
      const code = (error as NodeJS.ErrnoException).code;
      const safeCode = code && /^[A-Z][A-Z0-9_]{1,40}$/.test(code) ? code : undefined;
      finish(failure ?? new NpmInstallError(code === 'ENOENT' ? 'npm_not_found' : 'npm_spawn_failed', safeCode ? { system_code: safeCode } : {}));
    });
    child.once('close', (code, exitSignal) => {
      if (stopping) return; // taskkill сначала должен подтвердить завершение всего дерева.
      finish(failure ?? (code === 0 ? undefined : new NpmInstallError('npm_install_failed', {
        ...(code === null ? {} : { exit_code: code }), ...(exitSignal ? { signal: exitSignal } : {}),
      })));
    });
  });
}

export const installGlobal = createNpmRunner();
