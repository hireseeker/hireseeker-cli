
import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function writeNpmExecutable(home, script) {
  const npm = join(home, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  await writeFile(npm, process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
    : `#!/usr/bin/env node\nimport(${JSON.stringify(pathToFileURL(script).href)});\n`);
  if (process.platform !== 'win32') await chmod(npm, 0o755);
  return npm;
}
