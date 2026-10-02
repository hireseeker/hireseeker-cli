/* eslint-disable no-control-regex -- Очистка управляющих символов терминала. */
import { CommanderError } from 'commander';

export class CliError extends Error {
  constructor(public readonly code: string, message: string, public readonly exitCode = 1) { super(message); }
}

/** Убирает управляющие последовательности из внешних данных для терминала. */
export function clean(value: unknown): string {
  // Удаляем целые ANSI/OSC-последовательности до удаления одиночных control chars.
  return String(value ?? '').replace(/\x1b][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

export function normalizeError(error: unknown, signal?: AbortSignal): CliError {
  if (signal?.aborted) {
    return new CliError('cancelled', 'Операция отменена.', signal.reason === 143 ? 143 : 130);
  }
  if (error instanceof CliError) return error;
  if (error instanceof CommanderError) return new CliError('invalid_arguments', clean(error.message), error.exitCode === 0 ? 0 : 2);
  // Системные ошибки могут включать URL или локальные пути; наружу отдаём свой текст.
  return new CliError('network_error', 'Запрос не выполнен. Проверьте соединение и доступность сервиса.');
}
