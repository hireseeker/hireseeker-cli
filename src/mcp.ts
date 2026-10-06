
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, McpError, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { endpoint, REQUEST_TIMEOUT_MS, VERSION } from './config.js';
import { CliError, clean } from './errors.js';

export class HireSeekerClient {
  constructor(private readonly client: Client, readonly tools: Tool[], private readonly signal: AbortSignal) {}

  async call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    if (!this.tools.some(tool => tool.name === name)) throw new CliError('contract_error', 'Сервис не объявляет нужный инструмент.');
    const result = await this.client.callTool({ name, arguments: args }, undefined, { signal: this.signal, timeout: REQUEST_TIMEOUT_MS }).catch(error => {
      if (error instanceof McpError && (error.code === ErrorCode.InvalidRequest || error.code === ErrorCode.InvalidParams || error.code === ErrorCode.MethodNotFound)) {
        throw new CliError('contract_error', 'Сервис отклонил MCP-контракт запроса или ответа.');
      }
      throw error;
    });
    if (result.isError) {
      const content = Array.isArray(result.content) ? result.content : [];
      const message = content.filter(item => item.type === 'text').map(item => String(item.text)).join('\n');
      throw new CliError('tool_error', clean(message).slice(0, 2000) || 'Сервис не выполнил запрос.');
    }
    const parsed = schema.safeParse(result.structuredContent);
    if (!parsed.success) throw new CliError('contract_error', 'Ответ сервиса не соответствует контракту CLI.');
    // Проверяем shape, но возвращаем исходный объект: JSON-поля API не теряются.
    return result.structuredContent as T;
  }
}

export async function withClient<T>(env: NodeJS.ProcessEnv, signal: AbortSignal | undefined, action: (client: HireSeekerClient) => Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const url = endpoint(env);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  timeout.unref();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const client = new Client({ name: 'hireseeker-cli', version: VERSION }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(url, {
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, combined]) : combined }),
  });
  try {
    await client.connect(transport, { signal: combined, timeout: timeoutMs });
    const listed = await client.listTools({}, { signal: combined, timeout: timeoutMs });
    return await action(new HireSeekerClient(client, listed.tools, combined));
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw new CliError('network_timeout', 'Сервис не ответил за отведённое время.');
    if (error instanceof StreamableHTTPError && error.code === 429) throw new CliError('rate_limited', 'Лимит запросов исчерпан. Повторите запрос позже.');
    throw error;
  } finally {
    clearTimeout(timeout);
    await client.close().catch(() => undefined);
  }
}
