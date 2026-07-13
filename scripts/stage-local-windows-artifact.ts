import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const LOCAL_RELEASE_VERSION = /^\d+\.\d+\.\d+-[1-9]\d*$/;

export interface StageLocalWindowsArtifactOptions {
  outputRoot: string;
  sourcePath: string;
  version: string;
}

export interface StagedLocalWindowsArtifact {
  artifactPath: string;
  fileName: string;
  sha256: string;
  size: number;
  version: string;
}

export function assertLocalReleaseVersion(version: string): void {
  if (!LOCAL_RELEASE_VERSION.test(version)) {
    throw new Error(`local release version must match X.Y.Z-N, received: ${version}`);
  }
}

export function localWindowsArtifactName(version: string): string {
  assertLocalReleaseVersion(version);
  return `OpenDesign-${version}-local-allow-by-linky.exe`;
}

export function defaultLocalWindowsSetupPath(workspaceRoot: string, version: string): string {
  assertLocalReleaseVersion(version);
  return join(
    workspaceRoot,
    '.tmp',
    `open-design-pack-win-v${version}-minimal-stable`,
    'out',
    'win',
    'namespaces',
    'release-stable-win',
    'builder',
    'Open Design-release-stable-win-setup.exe',
  );
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function describeArtifact(
  artifactPath: string,
  version: string,
): Promise<StagedLocalWindowsArtifact> {
  const artifactStat = await stat(artifactPath);
  if (!artifactStat.isFile()) throw new Error(`artifact is not a file: ${artifactPath}`);
  return {
    artifactPath,
    fileName: localWindowsArtifactName(version),
    sha256: await sha256(artifactPath),
    size: artifactStat.size,
    version,
  };
}

export async function stageLocalWindowsArtifact(
  options: StageLocalWindowsArtifactOptions,
): Promise<StagedLocalWindowsArtifact> {
  const version = options.version.trim();
  assertLocalReleaseVersion(version);

  const sourcePath = resolve(options.sourcePath);
  const artifactPath = resolve(
    options.outputRoot,
    version,
    localWindowsArtifactName(version),
  );
  const [sourceExists, artifactExists] = await Promise.all([
    fileExists(sourcePath),
    fileExists(artifactPath),
  ]);

  if (!sourceExists) {
    if (artifactExists) return describeArtifact(artifactPath, version);
    throw new Error(`Windows installer not found: ${sourcePath}`);
  }
  if (artifactExists) {
    throw new Error(`staged artifact already exists: ${artifactPath}`);
  }

  const sourceHash = await sha256(sourcePath);
  await mkdir(dirname(artifactPath), { recursive: true });
  await rename(sourcePath, artifactPath);
  const staged = await describeArtifact(artifactPath, version);
  if (staged.sha256 !== sourceHash) {
    throw new Error(`artifact hash changed during rename: ${artifactPath}`);
  }
  return staged;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'output-root': { type: 'string' },
      source: { type: 'string' },
      version: { type: 'string' },
    },
    strict: true,
  });
  if (!values.version) throw new Error('--version is required');

  const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
  const sourcePath = values.source
    ? resolve(values.source)
    : defaultLocalWindowsSetupPath(workspaceRoot, values.version);
  const outputRoot = values['output-root']
    ? resolve(values['output-root'])
    : join(workspaceRoot, 'out', 'releases');
  const staged = await stageLocalWindowsArtifact({ outputRoot, sourcePath, version: values.version });
  process.stdout.write(`${JSON.stringify(staged, null, 2)}\n`);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
