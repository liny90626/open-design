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
TBD
```

`file` verification:

```text
TBD
```

Installer SHA512:

```text
TBD
```

`latest.yml` should report version `0.13.1`; fill size, sha512, and
releaseDate after the fresh build.

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
   completed because it fills the build cache. Then run the no-network
   Docker/Wine build with source mounted read-only and only `.tmp` plus
   `node_modules` writable:

   ```bash
   docker run --rm --network none --name open-design-win-pack-v0131-lan-keepalive-20260707 --user 1000:1000 -e HOME=/home/linky/workspace/open-design/.tmp/open-design-docker-home -e COREPACK_HOME=/home/linky/workspace/open-design/.tmp/open-design-corepack -e ELECTRON_CACHE=/home/linky/workspace/open-design/.tmp/open-design-electron-cache -e ELECTRON_BUILDER_CACHE=/home/linky/workspace/open-design/.tmp/open-design-electron-builder-cache -e npm_config_cache=/home/linky/workspace/open-design/.tmp/open-design-npm-cache -e ASTRO_TELEMETRY_DISABLED=1 -e XDG_CONFIG_HOME=/home/linky/workspace/open-design/.tmp/open-design-docker-home/.config -v /home/linky/workspace/open-design:/home/linky/workspace/open-design:ro -v /home/linky/workspace/open-design/.tmp:/home/linky/workspace/open-design/.tmp:rw -v /home/linky/workspace/open-design/node_modules:/home/linky/workspace/open-design/node_modules:rw -w /home/linky/workspace/open-design electronuserland/builder:wine bash -lc 'PATH="/home/linky/workspace/open-design/.tmp/toolchains/node-v24.17.0-linux-x64/bin:$PATH" pnpm tools-pack win build --dir /home/linky/workspace/open-design/.tmp/open-design-pack-win-v0.13.1-local-keepalive-lan-20260707 --to nsis --portable --json'
   ```

   The 2026-07-07 no-network Docker/Wine run succeeded. Notable timings:
   `nsis:payload-base-7z:process` took about 91 seconds, `nsis:makensis:process`
   took about 22 seconds, and `launcher-payload:archive-cache` took about 18
   minutes.

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
