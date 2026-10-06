
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkArtifact } from '../scripts/check-artifact.mjs';

const commit = 'a'.repeat(40);
const receipt = { package: 'hireseeker-cli', version: '0.1.0', filename: 'hireseeker-cli-0.1.0.tgz', commit,
  sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' };
function artifact(t, changed = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hireseeker-receipt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, 'receipt.json'), JSON.stringify({ ...receipt, ...changed }));
  writeFileSync(join(directory, receipt.filename), '');
  return directory;
}
test('Receipt подтверждает полный commit и реальные байты tarball', t => {
  const directory = artifact(t);
  assert.equal(checkArtifact(directory, commit).tarball, join(directory, receipt.filename));
});
test('Изменённые байты tarball отклоняются', t => {
  const directory = artifact(t); writeFileSync(join(directory, receipt.filename), 'changed');
  assert.throws(() => checkArtifact(directory, commit), /SHA256 tarball не совпадает/);
});
test('Артефакт другого commit и сокращённый ожидаемый SHA отклоняются', t => {
  const directory = artifact(t);
  assert.throws(() => checkArtifact(directory, 'b'.repeat(40)), /другого commit/);
  assert.throws(() => checkArtifact(directory, commit.slice(0, 7)), /полный SHA/);
});
for (const changed of [{ filename: '../outside.tgz' }, { package: 'other-cli' }, { sha256: 'invalid' }]) {
  test('Повреждённые metadata отклоняются до чтения произвольного файла', t => {
    assert.throws(() => checkArtifact(artifact(t, changed), commit));
  });
}
