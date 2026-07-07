# RFC1918 Windows Upgrade Handoff

Updated on 2026-07-07 for the `open-design` 0.13.1 maintenance task.

## Goal

Update the checkout to the latest official upstream release line, check whether
upstream already allows LAN/RFC1918 BYOK provider endpoints, reapply the local
LAN allowlist patch if upstream still blocks them, keep project-tab runs alive
when switching tabs, validate the change, and produce a fresh Windows installer
for upgrade.

## Checkout

- Repo: `/home/linky/workspace/open-design`
- Current release branch: `release/v0.13.1`
- Official upstream baseline: `open-design-v0.13.0` /
  `origin/release/v0.13.0` at
  `94f8ea2a15a536ba5857264091b985f212ac0705`
- Official upstream `open-design-v*` tags checked on 2026-07-07:
  `open-design-v0.13.0` is the latest formal release tag. An upstream
  `release/v0.14.0` branch exists, but there is no formal
  `open-design-v0.14.0` release tag at the time of this handoff.
- Fork package version: `apps/packaged/package.json` is `0.13.1`.
- Fork patch commits on this branch:
  - LAN/RFC1918 BYOK allowlist.
  - Project tab keep-alive so runs continue after switching tabs.
  - Linux-hosted Docker/Wine Windows packaging fixes.

## Status

Official `open-design-v0.13.0` blocks RFC1918 LAN targets by default for
provider/BYOK base URLs. The fork therefore keeps the local BYOK private
allowlist patch on top of the official release tag and packages it as `0.13.1`.

The project-tab issue reported in this maintenance pass is fixed in the fork by
keeping open project tabs mounted. Non-active `ProjectView` instances no longer
write route state, so their in-flight runs can continue without fighting the
currently active tab.

## Current Windows Artifacts

Target 2026-07-07 build output:

```text
.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/OpenDesign-V0.13.1-local_allow_by_linky.exe
.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/Open Design-default-setup.exe
.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/latest.yml
.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/payload/Open Design-default-payload.7z
.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/win-unpacked/
```

User-facing upgrade installer:

```text
OpenDesign-V0.13.1-local_allow_by_linky.exe
```

Verified artifact metadata after the fresh build:

```text
2026-07-08 00:02:53.481323671 +0800 275156141 .tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/OpenDesign-V0.13.1-local_allow_by_linky.exe
2026-07-08 00:02:53.481323671 +0800 275156141 .tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/Open Design-default-setup.exe
2026-07-08 00:02:58.685375908 +0800 366 .tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/latest.yml
```

`file` verification:

```text
.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/OpenDesign-V0.13.1-local_allow_by_linky.exe: PE32 executable for MS Windows 4.00 (GUI), Intel i386, Nullsoft Installer self-extracting archive, 5 sections
```

Installer SHA512:

```text
d20e1eae68235d6ce0b852518ba57bf4dc89c3b1e6e8c797dc51aedbc5de175c86726acf2bbafbac4bee2828c4d0066cdaec54d457baca5d0ccaa7c728f97afa
```

`latest.yml` reports:

```yaml
version: "0.13.1"
files:
  - url: "Open Design-default-setup.exe"
    sha512: "0g4ermgjXWzguFJRi6V79NyJw7Hm6MeX3FGu28XeF1yGcmrPK7r7rEvuKCjE0AZs2uxU1Fe6yl0MyqfHKPl6+g=="
    size: 275156141
path: "Open Design-default-setup.exe"
sha512: "0g4ermgjXWzguFJRi6V79NyJw7Hm6MeX3FGu28XeF1yGcmrPK7r7rEvuKCjE0AZs2uxU1Fe6yl0MyqfHKPl6+g=="
releaseDate: "2026-07-07T16:02:58.684Z"
```

Packaged contents check:

- `win-unpacked/resources/app/prebundled/daemon/...` contains
  `DEFAULT_BYOK_PRIVATE_CIDR_ALLOWLIST`.
- The packaged daemon allowlist includes `10.0.0.0/8`, `172.16.0.0/12`, and
  `192.168.0.0/16`.
- `better_sqlite3.node` inside `win-unpacked` is
  `PE32+ executable for MS Windows 6.00 (DLL), x86-64`.
- `win-unpacked/resources/open-design-web-standalone/apps/web/.next/static/...`
  contains `workspace-shell__project-stack`, `workspace-shell__project-pane`,
  and `activeWorkspaceProject`.

## Patch Semantics

The fork adds a default BYOK/private provider allowlist for RFC1918 IPv4 ranges:

- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`

Other internal or unsafe targets remain blocked by default. Link-local, CGNAT,
multicast, metadata-service, and IPv6 private ranges are not broadly opened.

Important behavior split:

- User/operator configured provider endpoints use `validateUserProviderBaseUrl`
  and honor the BYOK private allowlist plus upstream's
  `OD_ALLOWED_INTERNAL_HOSTS`.
- Asset/download URLs use strict validation with `allowlist: null`, so API
  response download targets do not inherit the BYOK LAN relaxation.
- The UI validation copy now says a valid `http://` or `https://` URL is
  required instead of requiring a public URL.

## Packaging Fixes

Native Linux still has no `wine` binary in this environment, so Windows builds
should use the existing Docker/Wine path:

```text
electronuserland/builder:wine
```

The NSIS payload compression timeout must stay at `30 * 60 * 1000`. Prior
successful Windows builds needed about 451 seconds for the base payload under
Wine, so the default 300 second timeout is too short.

## Windows Rebuild Runbook

Use this when the LAN allowlist patch has to be rebuilt into a Windows upgrade
installer again.

1. Work from the repo root:

   ```bash
   cd /home/linky/workspace/open-design
   ```

2. If the host shell does not have `pnpm` on `PATH`, use the preserved local
   Node toolchain:

   ```bash
   export PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH"
   node --version
   pnpm --version
   ```

3. Build the workspace packages needed by `tools-pack` before packaging:

   ```bash
   PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/contracts build
   PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/tools-pack build
   ```

4. In an unrestricted trusted local shell, the historical Docker/Wine command is:

   ```bash
   mkdir -p .tmp/open-design-docker-home/.wine
   docker run --rm --network host --name open-design-win-pack-v0131-lan-keepalive-20260707 --user 1000:1000 -e HOME=/project/.tmp/open-design-docker-home -e COREPACK_HOME=/project/.tmp/open-design-corepack -e ELECTRON_CACHE=/project/.tmp/open-design-electron-cache -e ELECTRON_BUILDER_CACHE=/project/.tmp/open-design-electron-builder-cache -e npm_config_cache=/project/.tmp/open-design-npm-cache -e http_proxy=http://127.0.0.1:21080 -e https_proxy=http://127.0.0.1:21080 -e HTTP_PROXY=http://127.0.0.1:21080 -e HTTPS_PROXY=http://127.0.0.1:21080 -e ASTRO_TELEMETRY_DISABLED=1 -e XDG_CONFIG_HOME=/project/.tmp/open-design-docker-home/.config -v /home/linky/workspace/open-design:/project -w /project electronuserland/builder:wine corepack pnpm tools-pack win build --dir /project/.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707 --to nsis --portable --json
   ```

   Keep `--network host` only when the build needs the local proxy at
   `127.0.0.1:21080`.

   In the Codex restricted environment on 2026-07-07, the host-network +
   full read-write repository mount was rejected by the permission policy. The
   successful safer path was:

   ```bash
   PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" ASTRO_TELEMETRY_DISABLED=1 XDG_CONFIG_HOME="$PWD/.tmp/xdg-config" pnpm tools-pack win build --dir "$PWD/.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707" --to dir --portable --json
   ```

   If native `wine` is missing on the host, this prewarm command can fail later
   with `wine is required`; it is still useful once `workspace-build` has
   completed because it fills the build cache. In this checkout,
   `workspace-build` writes package `dist/` outputs, so a read-only repository
   mount can fail with `EACCES`. Use a no-network Docker/Wine build with the
   repository mounted read-write and npm forced to use the warmed local cache:

   ```bash
   docker run --rm --network none --name open-design-win-pack-v0131-lan-keepalive-20260707 --user 1000:1000 -e HOME=/home/linky/workspace/open-design/.tmp/open-design-docker-home -e COREPACK_HOME=/home/linky/workspace/open-design/.tmp/open-design-corepack -e ELECTRON_CACHE=/home/linky/workspace/open-design/.tmp/open-design-electron-cache -e ELECTRON_BUILDER_CACHE=/home/linky/workspace/open-design/.tmp/open-design-electron-builder-cache -e npm_config_cache=/home/linky/workspace/open-design/.tmp/open-design-npm-cache -e npm_config_offline=true -e npm_config_prefer_offline=true -e npm_config_fetch_retries=0 -e npm_config_audit=false -e npm_config_fund=false -e ASTRO_TELEMETRY_DISABLED=1 -e XDG_CONFIG_HOME=/home/linky/workspace/open-design/.tmp/open-design-docker-home/.config -v /home/linky/workspace/open-design:/home/linky/workspace/open-design:rw -w /home/linky/workspace/open-design electronuserland/builder:wine bash -lc 'PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm tools-pack win build --dir /home/linky/workspace/open-design/.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707 --to nsis --portable --json'
   ```

   The 2026-07-07 no-network Docker/Wine run succeeded after a stale
   `.tmp/tools-pack/cache/locks/global.lock` directory from an interrupted
   container was moved aside. If a retry fails with `timed out waiting for lock`
   and `docker ps` shows no matching build container, move the stale lock
   directory before rerunning:

   ```bash
   mv .tmp/tools-pack/cache/locks/global.lock .tmp/tools-pack/cache/locks/global.lock.stale-$(date -u +%Y%m%dT%H%M%SZ)
   ```

   Notable timings from the successful run: `workspace-build` cache hit took
   about 16 seconds, `resource-tree` about 165 seconds,
   `electron-builder-raw:process` about 310 seconds,
   `installer:materialize-unpacked` about 213 seconds,
   `nsis:payload-base-7z:process` about 351 seconds,
   `nsis:payload-overlay-7z:process` about 61 seconds,
   `nsis:makensis:process` about 75 seconds, and
   `launcher-payload:archive-cache` about 644 seconds.

5. Rename or link the generated installer:

   ```bash
   ln -f ".tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/Open Design-default-setup.exe" ".tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/OpenDesign-V0.13.1-local_allow_by_linky.exe"
   ```

6. Confirm the fresh installer and update metadata:

   ```bash
   stat -c '%y %s %n' ".tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/OpenDesign-V0.13.1-local_allow_by_linky.exe" ".tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/latest.yml"
   file ".tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/OpenDesign-V0.13.1-local_allow_by_linky.exe"
   sed -n '1,80p' ".tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/latest.yml"
   sha512sum ".tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/OpenDesign-V0.13.1-local_allow_by_linky.exe"
   ```

7. Confirm the packaged app actually contains the LAN allowlist patch and
   Windows-native dependencies:

   ```bash
   rg -n "DEFAULT_BYOK_PRIVATE_CIDR_ALLOWLIST|10\\.0\\.0\\.0/8|172\\.16\\.0\\.0/12|192\\.168\\.0\\.0/16" .tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/win-unpacked/resources/app/prebundled/daemon
   find .tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/win-unpacked -name better_sqlite3.node -print -exec file {} \;
   ```

8. Confirm the packaged web bundle contains the keep-alive fix:

   ```bash
   rg -n -o "workspace-shell__project-stack|workspace-shell__project-pane|activeWorkspaceProject" .tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707/out/win/namespaces/default/builder/win-unpacked/resources/open-design-web-standalone/apps/web/.next/static
   ```

9. After a successful build, process caches can be cleaned to save disk, but do
   not delete the installer directory above. Preserve `.tmp/toolchains` unless
   you have a replacement Node 24/pnpm 10.33.2 toolchain ready.

## Verification Commands

Use the local Node 24 helper path when needed:

```bash
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/contracts build
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/tools-pack test -- tests/win-builder.test.ts tests/launcher-payload.test.ts
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/tools-pack build
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm exec vitest run packages/contracts/tests/connection-test.test.ts
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/daemon test -- tests/connection-test.test.ts tests/proxy-routes.test.ts
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/web test -- tests/components/SettingsDialog.test.ts tests/components/SettingsDialog.execution.test.tsx tests/components/WorkspaceTabsBar.test.tsx
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm i18n:check
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/contracts typecheck
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/web typecheck
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm --filter @open-design/tools-pack typecheck
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm guard
PATH="$PWD/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" ASTRO_TELEMETRY_DISABLED=1 XDG_CONFIG_HOME="$PWD/.tmp/xdg-config" pnpm run typecheck
git diff --check
```

Notes:

- `pnpm i18n:check`, `pnpm guard`, and daemon HTTP tests may need to run
  outside the sandbox because `tsx` and the daemon tests create local IPC or
  `127.0.0.1` listeners.
- `apps/landing-page` typecheck needs `ASTRO_TELEMETRY_DISABLED=1` and a
  writable `XDG_CONFIG_HOME`.

## Risks And Open Items

- The local Windows installer is unsigned unless signing credentials are
  provided.
- The Windows installer and build output live under `.tmp/` and are not
  committed to git.
