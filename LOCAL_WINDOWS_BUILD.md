# Local Windows Build

This fork builds Windows stable installers from the official Open Design source
plus the local LAN-provider and writable-workspace changes. Keep this workflow
stable so a new session does not recreate the toolchain or packaging cache.

## Release rules

- Base every release on an official `X.Y.Z` tag.
- Local versions use `X.Y.Z-N`, where `N` restarts from `1` for each new
  official base. Examples: `0.14.1-5`, `0.14.2-2`, `0.14.0-2`.
- The final Windows file name is always
  `OpenDesign-X.Y.Z-N-local-allow-by-linky.exe`.
- Build with namespace `release-stable-win`. Do not change the stable app name,
  install directory, registry identity, or user-data path.
- Rename only after validation. `scripts/stage-local-windows-artifact.ts` moves
  the completed EXE and verifies that its SHA256 did not change; it never edits
  or re-signs the executable.

## Retained offline environment

Do not delete these paths during routine cleanup:

- `.tmp/open-design-corepack/`
- `.tmp/open-design-docker-home/`
- `.tmp/open-design-electron-builder-cache/`
- `.tmp/open-design-electron-cache/`
- `.tmp/open-design-npm-cache/`
- `.tmp/toolchains/node-v24.17.0-linux-x64/`
- `.tmp/tools-pack/cache/`
- `.tmp/vela-cli-win32-x64-0.0.21.tgz`
- `node_modules/`

The pinned container is:

```text
electronuserland/builder:wine@sha256:41ae540902461b6cbc988987db79547fcc10cda04d2a6c6367504f59d4b37c64
```

The build stays offline (`--network none`) and uses the retained Node 24,
Corepack, Wine, Electron, NSIS, npm, tools-pack, and Vela caches.

## Build

Set `VERSION` to the next local iteration, then run from the repository root:

```bash
VERSION=0.14.1-2
ROOT="$(pwd)"
IMAGE='electronuserland/builder:wine@sha256:41ae540902461b6cbc988987db79547fcc10cda04d2a6c6367504f59d4b37c64'

docker run --rm --network none \
  --user "$(id -u):$(id -g)" \
  --volume "$ROOT:$ROOT" \
  --workdir "$ROOT" \
  --env HOME="$ROOT/.tmp/open-design-docker-home" \
  --env COREPACK_HOME="$ROOT/.tmp/open-design-corepack" \
  --env ELECTRON_CACHE="$ROOT/.tmp/open-design-electron-cache" \
  --env ELECTRON_BUILDER_CACHE="$ROOT/.tmp/open-design-electron-builder-cache" \
  --env npm_config_cache="$ROOT/.tmp/open-design-npm-cache" \
  --env PATH="$ROOT/.tmp/toolchains/node-v24.17.0-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  "$IMAGE" \
  corepack pnpm tools-pack win build \
    --dir "$ROOT/.tmp/open-design-pack-win-v${VERSION}-minimal-stable" \
    --namespace release-stable-win \
    --to nsis \
    --app-version "$VERSION" \
    --portable \
    --require-vela-cli \
    --json
```

Do not add `--cache-dir`; the repository hot cache is
`.tmp/tools-pack/cache/`.

After tests and overwrite-install validation pass, stage the final file:

```bash
.tmp/toolchains/node-v24.17.0-linux-x64/bin/node \
  --experimental-strip-types \
  scripts/stage-local-windows-artifact.ts \
  --version "$VERSION"
```

The result is written under `out/releases/$VERSION/`. The entire per-build
`.tmp/open-design-pack-win-v$VERSION-minimal-stable/` directory can then be
removed; keep the offline environment paths listed above.

## Git release

Tag the exact tested source commit, not a later documentation-only commit:

```bash
git status --short
git tag -a "$VERSION" -m "Open Design $VERSION"
git push origin main
git push origin "$VERSION"
```
