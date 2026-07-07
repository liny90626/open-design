// Result categories surfaced by the connection-test endpoint. The web UI
// translates each kind into user-facing copy; the daemon picks one per test
// and returns it inside a JSON envelope (always HTTP 200 — see notes in the
// daemon module for why).
import type { AgentCliEnvPrefs } from './app-config';
import type { ReasoningExecutionRequestFields } from './reasoningExecution';

export interface BaseUrlValidationResult {
  parsed?: ParsedBaseUrl;
  error?: string;
  forbidden?: boolean;
}

export interface ParsedBaseUrl {
  protocol: string;
  hostname: string;
  toString(): string;
}

declare const URL: {
  new(input: string): ParsedBaseUrl;
};

function normalizeBracketedIpv6(hostname: string): string {
  const stripped = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  // FQDN trailing-dot form (RFC 1034) resolves identically to the dotless form,
  // so `localhost.` must normalize to `localhost` before the equality check in
  // isLoopbackApiHost — and `0.0.0.0.`, `10.0.0.1.`, etc. must normalize before
  // isBlockedIpv4 parses them. Strips one or more trailing dots.
  return stripped.toLowerCase().replace(/\.+$/, '');
}

function parseIpv4(hostname: string): [number, number, number, number] | null {
  const parts = hostname.split('.');
  if (parts.length !== 4) return null;
  const parsed = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : null;
  });
  if (parsed.some((part) => part === null)) return null;
  return parsed as [number, number, number, number];
}

function isLoopbackIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  return Boolean(parts && parts[0] === 127);
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = parseIpv4(hostname);
  if (!parts) return false;
  const [a, b] = parts;
  return (
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    a >= 224
  );
}

function ipv4MappedToDotted(hostname: string): string | null {
  const host = normalizeBracketedIpv6(hostname);
  const mapped = /^::ffff:(.+)$/i.exec(host)?.[1];
  if (!mapped) return null;
  if (parseIpv4(mapped.toLowerCase())) return mapped.toLowerCase();
  const hexParts = mapped.split(':');
  if (
    hexParts.length !== 2 ||
    !hexParts.every((part) => /^[0-9a-f]{1,4}$/i.test(part))
  ) {
    return null;
  }
  const hi = hexParts[0];
  const lo = hexParts[1];
  if (!hi || !lo) return null;
  const value =
    (Number.parseInt(hi, 16) << 16) |
    Number.parseInt(lo, 16);
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

export function isLoopbackApiHost(hostname: string): boolean {
  const host = normalizeBracketedIpv6(hostname);
  if (host === 'localhost' || host === '::1') return true;
  if (isLoopbackIpv4(host)) return true;
  const mapped = ipv4MappedToDotted(host);
  return Boolean(mapped && isLoopbackIpv4(mapped));
}

export function isBlockedExternalApiHostname(hostname: string): boolean {
  const host = normalizeBracketedIpv6(hostname);
  if (host === '::') return true;
  if (isBlockedIpv4(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  const mapped = ipv4MappedToDotted(host);
  return Boolean(mapped && isBlockedIpv4(mapped));
}

// Normalized forms a hostname can be matched under: the bracket-stripped,
// lowercased, trailing-dot-stripped string plus, for IPv4-mapped IPv6
// literals, the dotted-quad form. Both an allowlist entry and a candidate
// host are reduced through this so `10.0.0.5`, `10.0.0.5.`, `[::ffff:10.0.0.5]`
// and `10.0.0.5` all compare equal.
function internalHostMatchForms(hostname: string): string[] {
  const normalized = normalizeBracketedIpv6(hostname);
  const forms = new Set<string>([normalized]);
  const mapped = ipv4MappedToDotted(hostname);
  if (mapped) forms.add(mapped.toLowerCase());
  return [...forms];
}

// Issue #3225 — explicit, operator-declared escape hatch from the
// default-deny internal-IP guard. Returns true only when `hostname` matches
// a host the operator deliberately trusted (see `OD_ALLOWED_INTERNAL_HOSTS`
// on the daemon). An empty/absent allowlist always returns false, so the
// strict default is preserved unless an operator opts in. This is consulted
// ONLY for user-configured provider endpoints, never for the
// attacker-controllable asset-download SSRF guard.
export function isAllowlistedInternalHost(
  hostname: string,
  allowedInternalHosts?: readonly string[],
): boolean {
  if (!allowedInternalHosts || allowedInternalHosts.length === 0) return false;
  const candidateForms = internalHostMatchForms(hostname);
  for (const entry of allowedInternalHosts) {
    if (typeof entry !== 'string' || !entry.trim()) continue;
    const entryForms = internalHostMatchForms(entry.trim());
    if (entryForms.some((form) => candidateForms.includes(form))) return true;
  }
  return false;
}

/** Read-only daemon policy for trusted internal BYOK/provider gateways. */
export interface ByokPrivateTargetAllowlist {
  hostnames: string[];
  cidrs: string[];
}

export interface ByokPrivateAllowlist {
  hostnames: ReadonlySet<string>;
  cidrs: readonly string[];
}

export const DEFAULT_BYOK_PRIVATE_CIDR_ALLOWLIST = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
] as const;

export function defaultByokPrivateAllowlist(): ByokPrivateAllowlist {
  return {
    hostnames: new Set(),
    cidrs: [...DEFAULT_BYOK_PRIVATE_CIDR_ALLOWLIST],
  };
}

function ipv4ToUint32(hostname: string): number | null {
  const parts = parseIpv4(normalizeBracketedIpv6(hostname));
  if (!parts) return null;
  return (
    ((parts[0] << 24) >>> 0) +
    (parts[1] << 16) +
    (parts[2] << 8) +
    parts[3]
  ) >>> 0;
}

function parseIpv4Cidr(cidr: string): { network: number; mask: number } | null {
  const trimmed = cidr.trim();
  const slash = trimmed.indexOf('/');
  if (slash <= 0) return null;
  const ipPart = trimmed.slice(0, slash);
  const prefix = Number(trimmed.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const network = ipv4ToUint32(ipPart);
  if (network === null) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { network: network & mask, mask };
}

export function ipv4MatchesCidr(ip: string, cidr: string): boolean {
  const parsed = parseIpv4Cidr(cidr);
  const value = ipv4ToUint32(ip);
  if (!parsed || value === null) return false;
  return (value & parsed.mask) === parsed.network;
}

function normalizeAllowlistHostToken(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    return normalizeBracketedIpv6(url.hostname);
  } catch {
    return normalizeBracketedIpv6(trimmed);
  }
}

export function parseByokPrivateAllowlistFromEnv(
  env: Record<string, string | undefined>,
): ByokPrivateAllowlist {
  const hostnames = new Set<string>();
  const rawHosts = [
    env.OD_BYOK_PRIVATE_HOST_ALLOWLIST,
    // Backwards-compatible spelling from the operator opt-in PR.
    env.OD_ALLOWED_INTERNAL_HOSTS,
  ].filter(Boolean).join(',');
  for (const entry of rawHosts.split(/[,\s]+/)) {
    const normalized = normalizeAllowlistHostToken(entry);
    if (normalized) hostnames.add(normalized);
  }

  const envCidrs = [
    env.OD_BYOK_PRIVATE_CIDR_ALLOWLIST,
    env.OD_ALLOWED_INTERNAL_CIDRS,
  ]
    .filter(Boolean)
    .join(',')
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const cidrs = new Set([
    ...DEFAULT_BYOK_PRIVATE_CIDR_ALLOWLIST,
    ...envCidrs,
  ]);

  return { hostnames, cidrs: [...cidrs] };
}

export function serializeByokPrivateAllowlist(
  allowlist: ByokPrivateAllowlist,
): ByokPrivateTargetAllowlist {
  return {
    hostnames: [...allowlist.hostnames],
    cidrs: [...allowlist.cidrs],
  };
}

export function byokAllowlistFromResponse(
  response: ByokPrivateTargetAllowlist | null | undefined,
): ByokPrivateAllowlist | null {
  if (!response) return defaultByokPrivateAllowlist();
  const hostnames = new Set<string>();
  for (const entry of response.hostnames ?? []) {
    const normalized = normalizeAllowlistHostToken(String(entry));
    if (normalized) hostnames.add(normalized);
  }
  const cidrs = (response.cidrs ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  if (hostnames.size === 0 && cidrs.length === 0) return null;
  return { hostnames, cidrs };
}

export function isPrivateTargetAllowedByAllowlist(
  hostname: string,
  allowlist: ByokPrivateAllowlist | null | undefined,
  resolvedIp?: string,
): boolean {
  if (!allowlist) return false;
  const normalizedHostname = normalizeBracketedIpv6(hostname);
  if (allowlist.hostnames.has(normalizedHostname)) return true;

  const candidateIp = resolvedIp ? normalizeBracketedIpv6(resolvedIp) : normalizedHostname;
  if (parseIpv4(candidateIp)) return allowlist.cidrs.some((cidr) => ipv4MatchesCidr(candidateIp, cidr));
  const mapped = ipv4MappedToDotted(candidateIp);
  return Boolean(mapped && allowlist.cidrs.some((cidr) => ipv4MatchesCidr(mapped, cidr)));
}

export interface ValidateBaseUrlOptions {
  // Hosts the operator has explicitly declared trusted (issue #3225). Each
  // entry is a bare hostname or IP literal; a host that matches is exempted
  // from the internal-IP block. Defaults to none, keeping the strict
  // default-deny behavior for every caller that does not opt in.
  allowedInternalHosts?: readonly string[];
  // Undefined means the BYOK/provider default allowlist applies. Null means
  // strict SSRF mode, used by asset/download validation.
  allowlist?: ByokPrivateAllowlist | null;
}

export function validateBaseUrl(
  baseUrl: string,
  options: ValidateBaseUrlOptions = {},
): BaseUrlValidationResult {
  let parsed: ParsedBaseUrl;
  try {
    parsed = new URL(String(baseUrl).replace(/\/+$/, ''));
  } catch {
    return { error: 'Invalid baseUrl' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: 'Only http/https allowed' };
  }
  const allowlist = options.allowlist === undefined
    ? defaultByokPrivateAllowlist()
    : options.allowlist;
  const hostname = parsed.hostname.toLowerCase();
  if (
    !isLoopbackApiHost(hostname) &&
    !isAllowlistedInternalHost(hostname, options.allowedInternalHosts) &&
    !isPrivateTargetAllowedByAllowlist(hostname, allowlist) &&
    isBlockedExternalApiHostname(hostname)
  ) {
    return { error: 'Internal IPs blocked', forbidden: true };
  }
  return { parsed };
}

export type ConnectionTestKind =
  | 'success'
  | 'auth_failed'
  | 'forbidden'
  | 'not_found_model'
  | 'invalid_model_id'
  | 'invalid_base_url'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'timeout'
  | 'agent_not_installed'
  | 'agent_auth_required'
  | 'agent_spawn_failed'
  | 'unknown';

// Phase markers describing how far the local agent connection test
// progressed before it produced its result. Used inside
// `ConnectionTestResponse.diagnostics.phase` and intended to be stable
// across daemon versions so Settings UI and CLI consumers can render
// phase-aware copy without re-deriving it from the free-form `detail`
// string. See issue #2248.
export type ConnectionTestPhase =
  | 'binary_resolution'
  | 'version_probe'
  | 'model_list'
  | 'spawn'
  | 'connection_smoke_test'
  | 'output_parse';

export interface ConnectionTestDiagnostics {
  // How far the test progressed before producing the result. Always
  // set on local agent test responses.
  phase: ConnectionTestPhase;
  // Absolute filesystem path of the executable the daemon actually
  // attempted to run, when resolution succeeded.
  binaryPath?: string;
  // Best-effort version string captured during `version_probe`. Null
  // when the CLI exposes no machine-parseable version output.
  binaryVersion?: string | null;
  // Child process exit metadata. Both fields keep the raw `code` /
  // `signal` shape from `child_process` so consumers can distinguish
  // a clean non-zero exit from a SIGTERM teardown. `signal` is typed as
  // `string | null` (not `NodeJS.Signals`) so the generated `.d.ts`
  // stays browser-safe — the daemon writes one of the
  // `NodeJS.Signals` literals here but consumers never need to import
  // ambient Node namespaces just to read an HTTP response shape.
  exitCode?: number | null;
  signal?: string | null;
  // Last ~400 bytes of the child's streams, already passed through
  // the daemon's secret redactor.
  stdoutTail?: string;
  stderrTail?: string;
}

export type ConnectionTestProtocol =
  | 'anthropic'
  | 'openai'
  | 'azure'
  | 'google'
  | 'ollama'
  | 'senseaudio'
  | 'aihubmix'
  | 'bedrock';

export interface ProviderTestRequest extends ReasoningExecutionRequestFields {
  protocol: ConnectionTestProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  // Azure only. When omitted, the daemon falls back to its default api-version.
  apiVersion?: string;
}

export interface AgentTestRequest {
  agentId: string;
  model?: string;
  reasoning?: string;
  agentCliEnv?: AgentCliEnvPrefs;
}

export type ConnectionTestRequest =
  | ({ mode: 'provider' } & ProviderTestRequest)
  | ({ mode: 'agent' } & AgentTestRequest);

export interface ConnectionTestResponse {
  ok: boolean;
  kind: ConnectionTestKind;
  latencyMs: number;
  // Model id or CLI default slot that this test exercised.
  model?: string;
  // Truncated assistant reply (≤ 120 chars) on success.
  sample?: string;
  // Upstream HTTP status when relevant (provider tests).
  status?: number;
  // Display name of the resolved agent (CLI tests).
  agentName?: string;
  // Free-form, redacted detail line — surfaced in the `unknown`,
  // `agent_spawn_failed`, and `upstream_unavailable` copy.
  detail?: string;
  // Optional executable-path diagnostics for Local CLI tests. Used by
  // Settings to explain whether a saved custom path worked, was ignored,
  // or required a PATH fallback.
  configuredExecutablePath?: string;
  detectedExecutablePath?: string;
  usedExecutablePath?: string;
  usedExecutableSource?: 'configured' | 'path' | 'fallback_invalid' | 'fallback_failed';
  // Structured diagnostics for the local agent connection test path
  // (#2248). Optional and additive: existing consumers that only read
  // `kind` and `detail` keep working unchanged. Populated on local
  // agent test responses — including early failures that never reach
  // the spawn step (unknown agent id, unresolved binary, preflight
  // auth probe). Provider tests omit it.
  diagnostics?: ConnectionTestDiagnostics;
}
