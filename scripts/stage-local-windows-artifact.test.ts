import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import {
  assertLocalReleaseVersion,
  localWindowsArtifactName,
  stageLocalWindowsArtifact,
} from './stage-local-windows-artifact.ts';

test('accepts numeric local iterations and rejects other release shapes', () => {
  for (const version of ['0.14.0-2', '0.14.1-5', '0.14.2-2']) {
    assert.doesNotThrow(() => assertLocalReleaseVersion(version));
  }
  for (const version of ['0.14.1', '0.14.1-beta.1', '0.14.1-0', 'v0.14.1-2']) {
    assert.throws(() => assertLocalReleaseVersion(version), /must match X\.Y\.Z-N/);
  }
});

test('uses the required local Windows artifact name', () => {
  assert.equal(
    localWindowsArtifactName('0.14.1-2'),
    'OpenDesign-0.14.1-2-local-allow-by-linky.exe',
  );
});

test('renames an installer without changing its bytes and is idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'open-design-local-artifact-'));
  try {
    const sourcePath = join(root, 'builder', 'Open Design-release-stable-win-setup.exe');
    const outputRoot = join(root, 'out');
    await mkdir(join(root, 'builder'));
    await writeFile(sourcePath, Buffer.from('fake-windows-installer'));

    const first = await stageLocalWindowsArtifact({
      outputRoot,
      sourcePath,
      version: '0.14.1-2',
    });
    assert.equal(first.fileName, 'OpenDesign-0.14.1-2-local-allow-by-linky.exe');
    assert.equal(await readFile(first.artifactPath, 'utf8'), 'fake-windows-installer');
    await assert.rejects(access(sourcePath));

    const second = await stageLocalWindowsArtifact({
      outputRoot,
      sourcePath,
      version: '0.14.1-2',
    });
    assert.deepEqual(second, first);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
