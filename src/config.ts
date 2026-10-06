
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CliError } from './errors.js';

export const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const VERSION: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_ENDPOINT = 'https://hireseeker.ru/mcp';

export function endpoint(env: NodeJS.ProcessEnv): URL {
  let url: URL;
  try { url = new URL(env.HIRESEEKER_MCP_URL || DEFAULT_ENDPOINT); }
  catch { throw new CliError('invalid_endpoint', 'Некорректный HIRESEEKER_MCP_URL.', 2); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) {
    throw new CliError('invalid_endpoint', 'Endpoint должен использовать HTTPS (HTTP разрешён для loopback), без credentials, query и fragment.', 2);
  }
  return url;
}
