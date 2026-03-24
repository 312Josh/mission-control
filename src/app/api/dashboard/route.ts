import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

const AGENT_ROSTER = [
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
];

export async function GET() {
  try {
    // Get sessions via the gateway REST-like call using curl + WS
    // The /api/openclaw/status endpoint returns all sessions in its response
    let sessions: any[] = [];
    try {
      const statusUrl = `http://localhost:${process.env.PORT || 3001}/api/openclaw/status`;
      const res = await fetch(statusUrl, {
        cache: 'no-store',
        headers: { 'Referer': statusUrl },
      });
      if (res.ok) {
        const data = await res.json();
        sessions = data?.sessions?.sessions ?? [];
      }
    } catch (e) {
      console.error('[dashboard] Failed to get sessions:', e);
    }

    // Map to agent cards
    const agents = AGENT_ROSTER.map((agent) => {
      // Match sessions to this agent (primary sessions, not crons)
      const matching = sessions.filter((s: any) => {
        const key = s.key || '';
        return key.startsWith(`agent:${agent.id}:`) && !key.includes(':cron:') && !key.includes(':subagent:');
      });
      const session = matching.sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0] ?? null;

      const contextTokens = session?.contextTokens ?? 0;
      const totalTokens = session?.totalTokens ?? 0;
      const pct = contextTokens > 0 ? Math.round((totalTokens / contextTokens) * 100) : 0;
      const lastActive = session?.updatedAt ? new Date(session.updatedAt).toISOString() : null;
      const ago = lastActive ? Date.now() - new Date(lastActive).getTime() : Infinity;
      const status = pct >= 85 ? 'needs-reset' : (ago > 7200000 ? 'idle' : 'active');

      return {
        ...agent,
        contextTokens,
        totalTokens,
        contextPercent: pct,
        lastActive,
        model: session?.model ?? null,
        status,
        sessionKey: session?.key ?? null,
      };
    });

    // Disk health
    let diskFreeGb = 0, diskTotalGb = 0, diskPercent = 0;
    try {
      const df = execSync('df -h /').toString().split('\n');
      if (df.length >= 2) {
        const p = df[1].split(/\s+/);
        const parse = (s: string) => {
          const m = s.match(/^([\d.]+)(K|M|G|T)?i?$/i);
          if (!m) return 0;
          const v = parseFloat(m[1]);
          switch ((m[2] || '').toUpperCase()) {
            case 'T': return v * 1024;
            case 'G': return v;
            case 'M': return v / 1024;
            default: return v;
          }
        };
        diskTotalGb = Math.round(parse(p[1]) * 10) / 10;
        diskFreeGb = Math.round(parse(p[3]) * 10) / 10;
        diskPercent = parseInt(p[4]?.replace('%', ''), 10) || 0;
      }
    } catch {}

    const health = {
      activeSessions: agents.filter((a) => a.status === 'active').length,
      diskFreeGb,
      diskTotalGb,
      diskPercent,
      agentsNeedingReset: agents.filter((a) => a.contextPercent >= 85).map((a) => a.name),
    };

    return NextResponse.json({ agents, health }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[dashboard] Error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
