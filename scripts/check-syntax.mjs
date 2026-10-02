import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';

// Только parser: без разрешения imports, проверки типов и генерации файлов.
const root = fileURLToPath(new URL('../', import.meta.url));
const files = process.argv.slice(2);
if (!files.length) files.push(...readdirSync(join(root, 'src'), { recursive: true })
  .filter(name => name.endsWith('.ts')).map(name => join(root, 'src', name)));
const diagnostics = files.flatMap(file => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS).parseDiagnostics);
if (diagnostics.length) {
  process.stderr.write(ts.formatDiagnostics(diagnostics, { getCanonicalFileName: name => name, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  process.exitCode = 1;
} else console.log(`Синтаксис ${files.length} TypeScript-файлов проверен без typecheck/build.`);
