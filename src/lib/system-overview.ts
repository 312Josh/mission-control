import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { queryAll, queryOne } from '@/lib/db';
import { getActiveConnectionCount } from '@/lib/events';
import { getOpenClawClient } from '@/lib/openclaw/client';
import type {
  ProcessEntry,
  RateLimitStatus,
  ScheduledEntry,
  SessionOverviewEntry,
  SystemOverview,
} from '@/lib/system-overview.types';

interface AgentStatusRow {
  status: 'working' | 'standby' | 'offline';
  count: number;
}

interface CountRow {
  count: number;
}

interface RawSession {
  key?: string;
  id?: string;
  model?: string;
  channel?: string;
  status?: string;
  contextTokens?: number;
  totalTokens?: number;
  updatedAt?: number | string;
}

interface SessionListPayload {
  sessions: RawSession[];
  rateLimit: RateLimitStatus;
}

const EMPTY_RATE_LIMIT: RateLimitStatus = {
  available: false,
  limit: null,
  remaining: null,
  reset_at: null,
  retry_after_seconds: null,
  source: null,
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}

function runCommand(command: string): string {
  return execSync(command, {
    encoding: 'utf8',
    timeout: 3000,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024,
  }).trim();
}

function toGb(bytes: number): number {
  return Number((bytes / (1024 ** 3)).toFixed(2));
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toIsoTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const epochMs = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(epochMs).toISOString();
  }

  if (typeof value === 'string') {
    const numeric = Number.parseFloat(value);
    if (Number.isFinite(numeric)) {
      const epochMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
      return new Date(epochMs).toISOString();
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
}

function parseRateLimitObject(value: unknown, source: string): RateLimitStatus | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const obj = value as Record<string, unknown>;
  const limit = toFiniteNumber(obj.limit ?? obj.max ?? obj.total ?? obj['x-ratelimit-limit']);
  const remaining = toFiniteNumber(
    obj.remaining ?? obj.left ?? obj.available ?? obj['x-ratelimit-remaining']
  );
  const resetAt = toIsoTime(obj.reset_at ?? obj.resetAt ?? obj.reset ?? obj['x-ratelimit-reset']);
  const retryAfter = toFiniteNumber(
    obj.retry_after_seconds ?? obj.retryAfterSeconds ?? obj.retry_after ?? obj['retry-after']
  );

  if (limit === null && remaining === null && resetAt === null && retryAfter === null) {
    return null;
  }

  return {
    available: true,
    limit,
    remaining,
    reset_at: resetAt,
    retry_after_seconds: retryAfter,
    source,
  };
}

function parseRateLimitStatus(payload: unknown): RateLimitStatus {
  if (!payload || typeof payload !== 'object') {
    return EMPTY_RATE_LIMIT;
  }

  const root = payload as Record<string, unknown>;
  const candidates: { value: unknown; source: string }[] = [
    { value: root.rate_limit, source: 'rate_limit' },
    { value: root.rateLimit, source: 'rateLimit' },
    { value: root.ratelimit, source: 'ratelimit' },
    { value: root.limits, source: 'limits' },
    { value: root.headers, source: 'headers' },
    { value: root.meta, source: 'meta' },
    { value: root, source: 'payload' },
  ];

  if (root.meta && typeof root.meta === 'object') {
    const meta = root.meta as Record<string, unknown>;
    candidates.unshift(
      { value: meta.rate_limit, source: 'meta.rate_limit' },
      { value: meta.rateLimit, source: 'meta.rateLimit' },
      { value: meta.ratelimit, source: 'meta.ratelimit' },
      { value: meta.headers, source: 'meta.headers' }
    );
  }

  for (const candidate of candidates) {
    const parsed = parseRateLimitObject(candidate.value, candidate.source);
    if (parsed) {
      return parsed;
    }
  }

  return EMPTY_RATE_LIMIT;
}

function extractRawSessions(payload: unknown): RawSession[] {
  if (Array.isArray(payload)) {
    return payload as RawSession[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const directArrayKeys = ['sessions', 'entries', 'items', 'data', 'result'];

  for (const key of directArrayKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value as RawSession[];
    }
  }

  if (record.sessions && typeof record.sessions === 'object') {
    const sessionsRecord = record.sessions as Record<string, unknown>;
    for (const key of ['entries', 'items', 'data']) {
      const value = sessionsRecord[key];
      if (Array.isArray(value)) {
        return value as RawSession[];
      }
    }
  }

  return [];
}

function parseSessionListPayload(payload: unknown): SessionListPayload {
  return {
    sessions: extractRawSessions(payload),
    rateLimit: parseRateLimitStatus(payload),
  };
}

function sanitizeCommand(command: string): string {
  return command
    .replace(/([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z0-9_]*=)(\S+)/gi, '$1[redacted]')
    .replace(/(--(?:token|key|secret|password)\s+)(\S+)/gi, '$1[redacted]');
}

function parseDiskHealth(): {
  totalGb: number | null;
  freeGb: number | null;
  usedPercent: number | null;
} {
  try {
    const output = runCommand('df -kP /');
    const lines = output.split('\n');
    if (lines.length < 2) {
      return { totalGb: null, freeGb: null, usedPercent: null };
    }

    const parts = lines[1].trim().split(/\s+/);
    if (parts.length < 6) {
      return { totalGb: null, freeGb: null, usedPercent: null };
    }

    const totalKb = Number.parseFloat(parts[1]);
    const freeKb = Number.parseFloat(parts[3]);
    const usedPercent = Number.parseInt(parts[4].replace('%', ''), 10);

    return {
      totalGb: Number.isFinite(totalKb) ? Number((totalKb / (1024 * 1024)).toFixed(2)) : null,
      freeGb: Number.isFinite(freeKb) ? Number((freeKb / (1024 * 1024)).toFixed(2)) : null,
      usedPercent: Number.isFinite(usedPercent) ? usedPercent : null,
    };
  } catch {
    return { totalGb: null, freeGb: null, usedPercent: null };
  }
}

function parseProcesses(): ProcessEntry[] {
  try {
    const output = runCommand('ps -axo pid,pcpu,pmem,etime,comm,args');
    const lines = output.split('\n').slice(1);
    const tracked = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\S+)\s+(\S+)\s+(.+)$/);
        if (!match) {
          return null;
        }

        const [, pidRaw, cpuRaw, memRaw, elapsed, comm, args] = match;
        return {
          pid: Number.parseInt(pidRaw, 10),
          cpu_percent: Number.parseFloat(cpuRaw),
          mem_percent: Number.parseFloat(memRaw),
          elapsed,
          command: args || comm,
        };
      })
      .filter((entry): entry is ProcessEntry => Boolean(entry))
      .filter((entry) => /(openclaw|mission-control|next|pm2|node)/i.test(entry.command))
      .sort((a, b) => b.cpu_percent - a.cpu_percent)
      .slice(0, 15);

    return tracked;
  } catch {
    return [];
  }
}

function parseCronEntries(): { available: boolean; error: string | null; entries: ScheduledEntry[] } {
  try {
    const output = runCommand('crontab -l');
    const entries: ScheduledEntry[] = [];

    output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .forEach((line) => {
        const parts = line.split(/\s+/);
        if (parts.length < 6) {
          return;
        }

        entries.push({
          source: 'crontab',
          label: 'user-cron',
          schedule: parts.slice(0, 5).join(' '),
          command: sanitizeCommand(parts.slice(5).join(' ')),
        });
      });

    return { available: true, error: null, entries: entries.slice(0, 20) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read crontab';
    if (message.toLowerCase().includes('no crontab')) {
      return { available: true, error: null, entries: [] };
    }
    return { available: false, error: message, entries: [] };
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseCalendarSchedule(value: unknown): string {
  const rows = Array.isArray(value) ? value : [value];
  return rows
    .filter((row) => row && typeof row === 'object')
    .slice(0, 3)
    .map((row) => {
      return Object.entries(row as Record<string, unknown>)
        .map(([key, val]) => `${key}=${String(val)}`)
        .join(', ');
    })
    .join(' | ');
}

function parseLaunchdEntries(): { available: boolean; error: string | null; entries: ScheduledEntry[] } {
  const plistDirs = [
    path.join(os.homedir(), 'Library/LaunchAgents'),
    '/Library/LaunchAgents',
    '/Library/LaunchDaemons',
  ];

  const files = plistDirs
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => {
      try {
        return fs.readdirSync(dir)
          .filter((name) => name.endsWith('.plist'))
          .map((name) => path.join(dir, name));
      } catch {
        return [];
      }
    })
    .slice(0, 200);

  if (files.length === 0) {
    return { available: true, error: null, entries: [] };
  }

  const entries: ScheduledEntry[] = [];
  let lastError: string | null = null;

  for (const file of files) {
    try {
      const output = runCommand(`plutil -convert json -o - ${shellEscape(file)}`);
      const parsed = JSON.parse(output) as Record<string, unknown>;

      const label = typeof parsed.Label === 'string'
        ? parsed.Label
        : path.basename(file, '.plist');

      const scheduleParts: string[] = [];
      if (typeof parsed.StartInterval === 'number') {
        scheduleParts.push(`every ${parsed.StartInterval}s`);
      }
      if (parsed.StartCalendarInterval) {
        const cal = parseCalendarSchedule(parsed.StartCalendarInterval);
        if (cal) {
          scheduleParts.push(`calendar ${cal}`);
        }
      }
      if (parsed.KeepAlive === true || (parsed.KeepAlive && typeof parsed.KeepAlive === 'object')) {
        scheduleParts.push('keepalive');
      }

      if (scheduleParts.length === 0) {
        continue;
      }

      const command = Array.isArray(parsed.ProgramArguments)
        ? parsed.ProgramArguments.map((v) => String(v)).join(' ')
        : typeof parsed.Program === 'string'
          ? parsed.Program
          : '(command unavailable)';

      entries.push({
        source: 'launchd',
        label,
        schedule: scheduleParts.join(' · '),
        command: sanitizeCommand(command),
        path: file,
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Failed to parse launchd plists';
    }
  }

  return {
    available: true,
    error: lastError,
    entries: entries.slice(0, 30),
  };
}

function formatSessionUpdatedAt(value: number | string | undefined): string | null {
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return null;
}

function toSessionEntry(session: RawSession): SessionOverviewEntry {
  const contextTokens = Number.isFinite(session.contextTokens) ? Number(session.contextTokens) : 0;
  const totalTokens = Number.isFinite(session.totalTokens) ? Number(session.totalTokens) : 0;
  const updatedAt = formatSessionUpdatedAt(session.updatedAt);
  const contextPercent = contextTokens > 0
    ? Math.round((totalTokens / contextTokens) * 100)
    : 0;

  return {
    key: session.key || '(unknown)',
    id: session.id || null,
    model: session.model || null,
    channel: session.channel || null,
    status: session.status || null,
    updated_at: updatedAt,
    total_tokens: totalTokens,
    context_tokens: contextTokens,
    context_percent: contextPercent,
  };
}

export async function buildSystemOverview(): Promise<SystemOverview> {
  const agentRows = queryAll<AgentStatusRow>(
    'SELECT status, COUNT(*) as count FROM agents GROUP BY status'
  );
  const totalAgents = agentRows.reduce((sum, row) => sum + row.count, 0);
  const countByStatus = {
    working: 0,
    standby: 0,
    offline: 0,
  };
  agentRows.forEach((row) => {
    countByStatus[row.status] = row.count;
  });

  const activeLinks = queryOne<CountRow>(
    "SELECT COUNT(*) as count FROM openclaw_sessions WHERE status = 'active'"
  )?.count ?? 0;

  let sessionEntries: SessionOverviewEntry[] = [];
  let sessionsConnected = false;
  let sessionsError: string | null = null;
  let sessionRateLimit: RateLimitStatus = EMPTY_RATE_LIMIT;

  try {
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await withTimeout(client.connect(), 4500, 'Timed out connecting to OpenClaw');
    }

    sessionsConnected = client.isConnected();

    if (sessionsConnected) {
      const payload = await withTimeout(
        client.call<unknown>('sessions.list'),
        4500,
        'Timed out loading OpenClaw sessions'
      );
      const parsedPayload = parseSessionListPayload(payload);
      sessionRateLimit = parsedPayload.rateLimit;

      sessionEntries = parsedPayload.sessions
        .map(toSessionEntry)
        .sort((a, b) => {
          const aTs = a.updated_at ? Date.parse(a.updated_at) : 0;
          const bTs = b.updated_at ? Date.parse(b.updated_at) : 0;
          return bTs - aTs;
        })
        .slice(0, 50);
    }
  } catch (error) {
    sessionsError = error instanceof Error ? error.message : 'Failed to load OpenClaw sessions';
  }

  const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
  const activeRecent = sessionEntries.filter((entry) => {
    if (!entry.updated_at) {
      return false;
    }
    return Date.parse(entry.updated_at) >= fifteenMinutesAgo;
  }).length;

  const cron = parseCronEntries();
  const launchd = parseLaunchdEntries();
  const scheduledEntries = [...cron.entries, ...launchd.entries];

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const disk = parseDiskHealth();
  const loadAvg = os.loadavg();
  const cpuCores = os.cpus().length || 1;
  const loadPercent = Number(((loadAvg[0] / cpuCores) * 100).toFixed(1));

  return {
    generated_at: new Date().toISOString(),
    agent_status: {
      total: totalAgents,
      working: countByStatus.working,
      standby: countByStatus.standby,
      offline: countByStatus.offline,
      active_links: activeLinks,
    },
    sessions: {
      connected: sessionsConnected,
      error: sessionsError,
      gateway_url: process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789',
      total: sessionEntries.length,
      active_recent: activeRecent,
      rate_limit: sessionRateLimit,
      entries: sessionEntries,
    },
    connections: {
      dashboard_sse_clients: getActiveConnectionCount(),
    },
    scheduled: {
      cron_available: cron.available,
      cron_error: cron.error,
      launchd_available: launchd.available,
      launchd_error: launchd.error,
      total: scheduledEntries.length,
      entries: scheduledEntries.slice(0, 50),
    },
    system_health: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
      uptime_seconds: os.uptime(),
      cpu_cores: cpuCores,
      cpu_load_percent: loadPercent,
      load_avg: [
        Number(loadAvg[0].toFixed(2)),
        Number(loadAvg[1].toFixed(2)),
        Number(loadAvg[2].toFixed(2)),
      ],
      memory_total_gb: toGb(totalMem),
      memory_used_gb: toGb(usedMem),
      memory_used_percent: Number(((usedMem / totalMem) * 100).toFixed(1)),
      disk_total_gb: disk.totalGb,
      disk_free_gb: disk.freeGb,
      disk_used_percent: disk.usedPercent,
      node_version: process.version,
      processes: parseProcesses(),
    },
  };
}
