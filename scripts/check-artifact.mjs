import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Проверка receipt не устанавливает пакет и не запускает его lifecycle scripts. */
export function checkArtifact(directory, expectedCommit) {
  assert.match(expectedCommit ?? '', /^[a-f0-9]{40}$/, 'Укажите полный SHA ожидаемого commit.');
  const receipt = JSON.parse(readFileSync(join(directory, 'receipt.json'), 'utf8'));
  assert.ok(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'Некорректный receipt.');
  assert.equal(receipt.package, 'hireseeker-cli', 'Неверное имя пакета.');
  assert.match(receipt.version ?? '', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, 'Некорректная версия.');
  assert.equal(receipt.filename, `hireseeker-cli-${receipt.version}.tgz`, 'Неверное имя tarball.');
  assert.equal(basename(receipt.filename), receipt.filename, 'Tarball должен находиться в каталоге receipt.');
  assert.equal(receipt.commit, expectedCommit, 'Артефакт собран из другого commit.');
  assert.match(receipt.sha256 ?? '', /^[a-f0-9]{64}$/, 'Некорректный SHA256.');
  const tarball = join(directory, receipt.filename);
  assert.equal(createHash('sha256').update(readFileSync(tarball)).digest('hex'), receipt.sha256, 'SHA256 tarball не совпадает.');
  return { receipt, tarball };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { receipt } = checkArtifact(process.argv[2] ?? '.artifacts', process.argv[3]);
  console.log(`Проверен ${receipt.filename}, SHA ${receipt.commit}, SHA256 ${receipt.sha256}`);
}
