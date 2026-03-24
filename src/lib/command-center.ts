/**
 * Command Center Data Layer
 * Provides agent roster, session fetching, and system health for the dashboard.
 */

import { execSync } from 'child_process';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentRosterEntry {
  id: string;
  name: string;
  emoji: string;
  role: string;
}

export type AgentStatusType = 'active' | 'idle' | 'needs-reset';

export interface AgentCard extends AgentRosterEntry {
  contextTokens: number;
  totalTokens: number;
  contextPercent: number;
  lastActive: string | null;
  model: string | null;
  status: AgentStatusType;
  sessionKey: string | null;
}

export interface SessionData {
  key: string;
  sessionId?: string;
  model?: string;
  contextTokens?: number;
  totalTokens?: number;
  updatedAt?: number;
  channel?: string;
  label?: string;
  displayName?: string;
  [key: string]: unknown;
}

export interface SystemHealth {
  activeSessions: number;
  diskFreeGb: number;
  diskTotalGb: number;
  diskPercent: number;
  agentsNeedingReset: string[];
}

// ─── Agent Roster ────────────────────────────────────────────────────────────

export const AGENT_ROSTER: AgentRosterEntry[] = [
  { id: 'main', name: 'Janet', emoji: '✨', role: 'Chief of staff, coordinator' },
  { id: 'ted-lasso', name: 'Ted Lasso', emoji: '🏈', role: 'Work PA, coaching, Toast sales' },
  { id: 'dinesh', name: 'Dinesh', emoji: '💻', role: 'Engineer, Concept OS / Coursed' },
  { id: 'gilfoyle', name: 'Gilfoyle', emoji: '🛠️', role: 'Homelab, servers, networking' },
  { id: 'ray-arnold', name: 'Ray Arnold', emoji: '🦖', role: 'Smart home, Home Assistant' },
  { id: 'ben-wyatt', name: 'Ben Wyatt', emoji: '💰', role: 'Finance, budgets' },
  { id: 'donna-paulsen', name: 'Donna Paulsen', emoji: '🔍', role: 'Research' },
  { id: 'goggins', name: 'Andrew Huberman', emoji: '🧬', role: 'Health' },
  { id: 'phil-dunphy', name: 'Phil Dunphy', emoji: '✈️', role: 'Travel' },
  { id: 'jesse-waters', name: 'Jesse Waters', emoji: '📰', role: 'Content/social' },
  { id: 'chris-camillo', name: 'Chris Camillo', emoji: '💼', role: 'Coursed business' },
  { id: 'taylor-mason', name: 'Taylor Mason', emoji: '📊', role: 'Polymarket quant, arb trading' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NEEDS_RESET_THRESHOLD = 85;
const WARNING_THRESHOLD = 70;

function normalizeGatewayUrl(url: string): string {
  return url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}

function getStatus(contextPercent: number, lastActive: string | null): AgentStatusType {
  if (contextPercent >= NEEDS_RESET_THRESHOLD) return 'needs-reset';
  if (!lastActive) return 'idle';
  const ago = Date.now() - new Date(lastActive).getTime();
  if (ago > 2 * 60 * 60 * 1000) return 'idle'; // 2 hours
  return 'active';
}

// ─── Fetch Agent Cards ──────────────────────────────────────────────────────

export async function fetchAgentCards(gatewayUrl: string, token: string): Promise<AgentCard[]> {
  let sessions: SessionData[] = [];
  try {
    // Use the OpenClaw WS client (same one used by /api/openclaw/sessions)
    const { getOpenClawClient } = await import('./openclaw/client');
    const client = getOpenClawClient();
    if (!client.isConnected()) {
      await client.connect();
    }
    const rawSessions = await client.listSessions();
    sessions = (rawSessions ?? []) as unknown as SessionData[];
  } catch (e) {
    console.error('[command-center] Failed to fetch sessions:', e);
  }

  return AGENT_ROSTER.map((agent) => {
    // Find the best matching session for this agent
    const matching = sessions.filter((s) => {
      const key = s.key || '';
      return key.includes(`agent:${agent.id}:`);
    });

    // Pick the most recently active session
    const session = matching.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;

    const contextTokens = (session?.contextTokens as number) ?? 0;
    const totalTokens = (session?.totalTokens as number) ?? 0;
    const contextPercent = contextTokens > 0 ? Math.round((totalTokens / contextTokens) * 100) : 0;
    const updatedAt = session?.updatedAt ? new Date(session.updatedAt as number).toISOString() : null;
    const model = (session?.model as string) ?? null;

    return {
      ...agent,
      contextTokens,
      totalTokens,
      contextPercent,
      lastActive: updatedAt,
      model,
      status: getStatus(contextPercent, updatedAt),
      sessionKey: (session?.key as string) ?? null,
    };
  });
}

// ─── Fetch System Health ────────────────────────────────────────────────────

export async function fetchSystemHealth(agentCards?: AgentCard[]): Promise<SystemHealth> {
  let diskFreeGb = 0;
  let diskTotalGb = 0;
  let diskPercent = 0;

  try {
    const dfOutput = execSync('df -h /').toString();
    const lines = dfOutput.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      // macOS format: Filesystem Size Used Avail Capacity ...
      const sizeStr = parts[1] ?? '0';
      const availStr = parts[3] ?? '0';
      const capStr = parts[4] ?? '0%';

      const parseSize = (s: string): number => {
        const match = s.match(/^([\d.]+)(K|M|G|T)?i?$/i);
        if (!match) return 0;
        const val = parseFloat(match[1]);
        const unit = (match[2] ?? '').toUpperCase();
        switch (unit) {
          case 'T': return val * 1024;
          case 'G': return val;
          case 'M': return val / 1024;
          case 'K': return val / (1024 * 1024);
          default: return val;
        }
      };

      diskTotalGb = Math.round(parseSize(sizeStr) * 10) / 10;
      diskFreeGb = Math.round(parseSize(availStr) * 10) / 10;
      diskPercent = parseInt(capStr.replace('%', ''), 10) || 0;
    }
  } catch (e) {
    console.error('[command-center] Failed to get disk usage:', e);
  }

  const needsReset = (agentCards ?? [])
    .filter((c) => c.contextPercent >= NEEDS_RESET_THRESHOLD)
    .map((c) => c.name);

  const activeSessions = (agentCards ?? []).filter((c) => c.status === 'active').length;

  return {
    activeSessions,
    diskFreeGb,
    diskTotalGb,
    diskPercent,
    agentsNeedingReset: needsReset,
  };
}
