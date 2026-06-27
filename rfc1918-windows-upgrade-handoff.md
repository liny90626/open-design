# RFC1918 Windows Upgrade Handoff

Updated on 2026-06-27 for the `open-design` maintenance task.

## Goal

Update the checkout to the latest official upstream, check whether upstream already allows LAN/RFC1918 BYOK provider endpoints, reapply the local LAN allowlist patch if upstream still blocks them, validate the change, and produce a fresh Windows installer for upgrade.

## Checkout

- Repo: `/home/linky/workspace/open-design`
- Branch: `od-rfc1918-windows-upgrade`
- Upstream baseline: `origin/main` at `b784c86507449d057ba50058f70cc9af27c5d026`
- Latest upstream subject: `feat(landing): first-touch attribution cookie for source→payment (#4820)`
- Patch state: LAN allowlist and Linux-hosted Windows packaging fixes reapplied and validated on this branch.

## Status

Official upstream at the baseline above still blocks RFC1918/private BYOK provider endpoints by default. The LAN allowlist patch has been reapplied on top of the 2026-06-27 official baseline and a fresh Windows NSIS installer has been built successfully using the documented Docker/Wine path.

Do not use historical installers from 2026-06-06 or 2026-06-24. The current upgrade artifact is the 2026-06-27 build listed below.

## Current Windows Artifacts

Fresh build output:

```text
.tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/Open Design-default-setup.exe
.tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/latest.yml
.tmp/open-design-pack-win-default-lan/out/win/namespaces/default/payload/Open Design-default-payload.7z
.tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/win-unpacked/
```

Verified artifact metadata:

```text
2026-06-27 21:03:18.139058389 +0800 273670226 .tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/Open Design-default-setup.exe
2026-06-27 21:03:19.970076907 +0800 366 .tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/latest.yml
2026-06-27 21:05:14.271232724 +0800 258792547 .tmp/open-design-pack-win-default-lan/out/win/namespaces/default/payload/Open Design-default-payload.7z
```

`file` verification:

```text
Open Design-default-setup.exe: PE32 executable for MS Windows 4.00 (GUI), Intel i386, Nullsoft Installer self-extracting archive, 5 sections
Open Design-default-payload.7z: 7-zip archive data, version 0.4
```

`latest.yml` reports version `0.11.1`, size `273670226`, sha512 `EKcFAgNyUFR6aBLMoHp1Lobiq4sUri5MhkbU91HcINzs+/fnX6PhujC6JCTU8g7kKth2QQkZ3mQsme3Sg4z1/g==`, and `releaseDate: "2026-06-27T13:03:19.970Z"`.

Packaged contents check:

- `win-unpacked/resources/app/prebundled/daemon/...` contains `DEFAULT_BYOK_PRIVATE_CIDR_ALLOWLIST`.
- The packaged allowlist includes `10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16`.
- `better_sqlite3.node` inside `win-unpacked` is `PE32+ executable for MS Windows 6.00 (DLL), x86-64`.

## Files Changed

RFC1918/BYOK behavior:

- `packages/contracts/src/api/connectionTest.ts`
- `packages/contracts/tests/connection-test.test.ts`
- `apps/daemon/src/connectionTest.ts`
- `apps/daemon/tests/connection-test.test.ts`
- `apps/daemon/tests/proxy-routes.test.ts`
- `apps/web/src/components/byok/validation.ts`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/SettingsDialog.test.ts`
- `apps/web/src/i18n/locales/*.ts`

Windows Linux+Wine packaging support:

- `tools/pack/src/win/custom-installer.ts`
- `tools/pack/src/win/payload.ts`
- `tools/pack/tests/win-builder.test.ts`
- `tools/pack/tests/launcher-payload.test.ts`

Handoff:

- `rfc1918-windows-upgrade-handoff.md`

## Patch Semantics

The patch adds a default BYOK/private provider allowlist for RFC1918 IPv4 ranges:

- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`

Other internal or unsafe targets remain blocked by default. Link-local, CGNAT, multicast, and IPv6 private ranges are not broadly opened.

Important behavior split:

- User/operator configured provider endpoints use `validateUserProviderBaseUrl` and honor the BYOK private allowlist.
- Asset/download URLs use strict validation with `allowlist: null`, so API response download targets do not inherit the BYOK LAN relaxation.

The UI validation copy now says a valid `http://` or `https://` URL is required instead of requiring a public URL.

## Packaging Fixes

Native Linux still has no `wine` binary, so the successful build used the previously working Docker image:

```text
electronuserland/builder:wine
node v24.15.0
npm 11.12.1
wine-11.0
```

The build command that completed successfully:

```bash
docker run --rm --network host --name open-design-win-pack-lan-default --user 1000:1000 -e HOME=/project/.tmp/open-design-docker-home -e COREPACK_HOME=/project/.tmp/open-design-corepack -e ELECTRON_CACHE=/project/.tmp/open-design-electron-cache -e ELECTRON_BUILDER_CACHE=/project/.tmp/open-design-electron-builder-cache -e npm_config_cache=/project/.tmp/open-design-npm-cache -e http_proxy=http://127.0.0.1:21080 -e https_proxy=http://127.0.0.1:21080 -e HTTP_PROXY=http://127.0.0.1:21080 -e HTTPS_PROXY=http://127.0.0.1:21080 -e ASTRO_TELEMETRY_DISABLED=1 -e XDG_CONFIG_HOME=/project/.tmp/open-design-docker-home/.config -v /home/linky/workspace/open-design:/project -w /project electronuserland/builder:wine corepack pnpm tools-pack win build --dir /project/.tmp/open-design-pack-win-default-lan --to nsis --portable --json
```

2026-06-27 build notes:

- The cleanup before this run had removed the Docker HOME/Wine prefix. Recreate it with `mkdir -p .tmp/open-design-docker-home/.wine` before running Docker, otherwise electron-builder can fail while invoking Wine tools with `wine: chdir to /project/.tmp/open-design-docker-home/.wine : No such file or directory`.
- Current upstream uses electron-builder `26.8.1`. Its NSIS cache layout is resolved through `electron-builder`'s actual `app-builder-lib/out/targets/nsis/nsisUtil.js` path and `NSIS_PATH()`, not only the older fixed cache path. The successful build downloaded/resolved NSIS under `.tmp/open-design-electron-builder-cache/nsis/nsis-3.0.4.1-nsis-3.0.4.1/`.
- The final `makensis.exe` invocation ran through Wine and converted POSIX paths to `Z:\project\...`.

## Windows Rebuild Runbook

Use this when the LAN allowlist patch has to be rebuilt into a Windows upgrade installer again.

1. Work from the repo root:

   ```bash
   cd /home/linky/workspace/open-design
   ```

2. If the host shell does not have `pnpm` on `PATH`, use the preserved local Node toolchain:

   ```bash
   export PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH"
   node --version
   pnpm --version
   ```

   Expected versions for this run were Node `v24.17.0` on the host helper toolchain and pnpm `10.33.2` from the repo package manager pin. The Docker image itself reported Node `v24.15.0`, npm `11.12.1`, and Wine `11.0`.

3. Build Windows NSIS output through Docker/Wine. Keep `--network host` if using the local proxy at `127.0.0.1:21080`; otherwise remove the proxy environment variables only after confirming network access from inside Docker.

   ```bash
   mkdir -p .tmp/open-design-docker-home/.wine
   docker run --rm --network host --name open-design-win-pack-lan-default --user 1000:1000 -e HOME=/project/.tmp/open-design-docker-home -e COREPACK_HOME=/project/.tmp/open-design-corepack -e ELECTRON_CACHE=/project/.tmp/open-design-electron-cache -e ELECTRON_BUILDER_CACHE=/project/.tmp/open-design-electron-builder-cache -e npm_config_cache=/project/.tmp/open-design-npm-cache -e http_proxy=http://127.0.0.1:21080 -e https_proxy=http://127.0.0.1:21080 -e HTTP_PROXY=http://127.0.0.1:21080 -e HTTPS_PROXY=http://127.0.0.1:21080 -e ASTRO_TELEMETRY_DISABLED=1 -e XDG_CONFIG_HOME=/project/.tmp/open-design-docker-home/.config -v /home/linky/workspace/open-design:/project -w /project electronuserland/builder:wine corepack pnpm tools-pack win build --dir /project/.tmp/open-design-pack-win-default-lan --to nsis --portable --json
   ```

4. Confirm the fresh installer and update metadata:

   ```bash
   stat -c '%y %s %n' ".tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/Open Design-default-setup.exe" ".tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/latest.yml"
   file ".tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/Open Design-default-setup.exe"
   sed -n '1,80p' ".tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/latest.yml"
   ```

   For this build, the installer timestamp was `2026-06-27 21:03:18 +0800`, size `273670226`, and `latest.yml` timestamp was `2026-06-27 21:03:19 +0800`.

5. Confirm the packaged app actually contains the LAN allowlist patch and Windows-native dependencies:

   ```bash
   rg -n "DEFAULT_BYOK_PRIVATE_CIDR_ALLOWLIST|10\\.0\\.0\\.0/8|172\\.16\\.0\\.0/12|192\\.168\\.0\\.0/16" .tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/win-unpacked/resources/app/prebundled/daemon
   find .tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/win-unpacked -name better_sqlite3.node -print -exec file {} \;
   ```

6. Keep these files as the upgrade deliverable:

   ```text
   .tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/Open Design-default-setup.exe
   .tmp/open-design-pack-win-default-lan/out/win/namespaces/default/builder/latest.yml
   ```

   The payload archive under `.tmp/open-design-pack-win-default-lan/out/win/namespaces/default/payload/` is useful for inspection but the user-facing Windows upgrade file is the NSIS setup `.exe`.

7. After a successful build, process caches can be cleaned to save disk, but do not delete the installer directory above. In the current cleanup, `.tmp/open-design-pack-win-default-lan` and `.tmp/toolchains` were intentionally preserved; transient Docker/Corepack/npm/Electron caches were removed.

To make current upstream buildable with the previous Docker/Wine scheme, `tools-pack` was patched so Windows `.exe` tools run through Wine on non-Windows hosts:

- NSIS `makensis.exe` receives Wine-compatible `Z:\project\...` paths.
- 7z calls used by NSIS payloads and launcher payloads reuse the same Wine invocation/path conversion.
- NSIS runtime log paths no longer embed Linux build paths when compiling from POSIX; they resolve under `$APPDATA\Open Design\namespaces\<namespace>\logs` unless a real Windows path is provided.

## Verification

Passed:

```bash
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/tools-pack test -- tests/win-builder.test.ts tests/launcher-payload.test.ts
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/tools-pack typecheck
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/tools-pack build
PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm exec vitest run tests/connection-test.test.ts
PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm exec vitest run -c vitest.config.ts tests/connection-test.test.ts tests/proxy-routes.test.ts -t "RFC1918|BYOK private target allowlist|non-RFC1918 internal|IPv6 loopback" --hookTimeout 60000 --testTimeout 60000
PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm exec vitest run -c vitest.config.ts tests/components/SettingsDialog.test.ts -t "accepts public http/https URLs, loopback local providers, and RFC1918 BYOK targets|requires key, valid base URL, and a supported protocol" --testTimeout 60000
PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm exec vitest run -c vitest.config.ts tests/components/SettingsDialog.test.ts tests/components/SettingsDialog.execution.test.tsx --testTimeout 60000
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm i18n:check
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/contracts typecheck
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/web typecheck
PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm exec tsc -p tsconfig.json --noEmit
PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm exec tsc -p tsconfig.tests.json --noEmit
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm guard
PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" ASTRO_TELEMETRY_DISABLED=1 XDG_CONFIG_HOME=/home/linky/workspace/open-design/.tmp/xdg-config pnpm run typecheck
git diff --check
```

Notes:

- `pnpm i18n:check` and `pnpm guard` needed to run outside the sandbox because `tsx` creates a local IPC pipe under `/tmp/tsx-1000/*.pipe`, which the sandbox blocked with `listen EPERM`.
- daemon HTTP tests needed to run outside the sandbox because the sandbox blocked temporary `127.0.0.1` listeners with `listen EPERM`.
- `apps/landing-page` typecheck needed `ASTRO_TELEMETRY_DISABLED=1 XDG_CONFIG_HOME=/home/linky/workspace/open-design/.tmp/xdg-config`; without this, Astro telemetry tried to create `/home/linky/.config/astro`, outside the writable sandbox.
- A full `pnpm typecheck` run with the Astro env completed successfully after the final tools-pack changes.
- The early `pnpm --filter ... test -- <pattern>` attempts were too broad in this repo and triggered many unrelated suites. They were interrupted or replaced with precise `pnpm exec vitest run ... <file> -t ...` commands.

## Risks And Open Items

- The final installer is unsigned; this matches the local packaging path unless signing credentials are provided.
- Host Linux still has no native `wine`; future Linux-hosted Windows packaging should use Docker/Wine or install Wine.
- The Windows installer and build output live under `.tmp/` and are intentionally not committed to git.
