#!/usr/bin/env node

import { run } from '../dist/cli.js';

const controller = new AbortController();
const interrupt = () => controller.abort(130);
const terminate = () => controller.abort(143);
process.once('SIGINT', interrupt);
process.once('SIGTERM', terminate);
try {
  process.exitCode = await run(process.argv, { signal: controller.signal });
} finally {
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', terminate);
}
