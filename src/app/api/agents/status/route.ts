import { NextRequest, NextResponse } from 'next/server';
import { AGENT_ROSTER } from '@/lib/command-center';
import { getOpenClawClient } from '@/lib/openclaw/client';

export const dynamic = 'force-dynamic';

type QuickAction = 'reset' | 'new';

type GatewaySession = {
  key?: unknown;
  id?: unknown;
  model?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  contextTokens?: unknown;
  totalTokens?: unknown;
};

interface AgentStatusPayload {
  id: string;
  name: string;
  emoji: string;
  session_status: string | null;
  context_percent: number | null;
  model: string | null;
  last_activity: string | null;
  session_id: string | null;
  session_key: string | null;
}

interface AgentsStatusResponse {
  generated_at: string;
  connected: boolean;
  error: string | null;
  agents: AgentStatusPayload[];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
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

function parseGatewaySessions(raw: unknown): GatewaySession[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter((entry) => entry && typeof entry === 'object') as GatewaySession[];
}

function sessionTimestamp(session: GatewaySession): number {
  const iso = toIsoTimestamp(session.updatedAt);
  return iso ? Date.parse(iso) : 0;
}

function pickLatestSession(agentId: string, sessions: GatewaySession[]): GatewaySession | null {
  const matching = sessions
    .filter((session) => {
      const key = asString(session.key);
      return Boolean(key && key.includes(`agent:${agentId}:`));
    })
    .sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));

  return matching[0] ?? null;
}

function mapAgents(sessions: GatewaySession[]): AgentStatusPayload[] {
  return AGENT_ROSTER.map((agent) => {
    const session = pickLatestSession(agent.id, sessions);

    if (!session) {
      return {
        id: agent.id,
        name: agent.name,
        emoji: agent.emoji,
        session_status: null,
        context_percent: null,
        model: null,
        last_activity: null,
        session_id: null,
        session_key: null,
      };
    }

    const contextTokens = asNumber(session.contextTokens);
    const totalTokens = asNumber(session.totalTokens);
    const contextPercent = contextTokens && contextTokens > 0 && totalTokens !== null
      ? Math.round((totalTokens / contextTokens) * 100)
      : 0;

    return {
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji,
      session_status: asString(session.status),
      context_percent: contextPercent,
      model: asString(session.model),
      last_activity: toIsoTimestamp(session.updatedAt),
      session_id: asString(session.id),
      session_key: asString(session.key),
    };
  });
}

function buildResponse(connected: boolean, error: string | null, sessions: GatewaySession[]): AgentsStatusResponse {
  return {
    generated_at: new Date().toISOString(),
    connected,
    error,
    agents: mapAgents(sessions),
  };
}

async function ensureConnected() {
  const client = getOpenClawClient();

  if (!client.isConnected()) {
    await client.connect();
  }

  return client;
}

export async function GET() {
  let connected = false;
  let error: string | null = null;
  let sessions: GatewaySession[] = [];

  try {
    const client = await ensureConnected();
    connected = client.isConnected();

    if (connected) {
      const rawSessions = await client.listSessions();
      sessions = parseGatewaySessions(rawSessions);
    }
  } catch (requestError) {
    error = requestError instanceof Error ? requestError.message : 'Failed to load OpenClaw sessions';
  }

  return NextResponse.json(buildResponse(connected, error, sessions), {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { agentId?: string; action?: QuickAction };
    const action = body.action;
    const agentId = body.agentId;

    if (!agentId || !action || (action !== 'reset' && action !== 'new')) {
      return NextResponse.json(
        { error: 'agentId and action (reset|new) are required' },
        { status: 400 }
      );
    }

    const agent = AGENT_ROSTER.find((entry) => entry.id === agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Unknown agent id' }, { status: 404 });
    }

    const client = await ensureConnected();

    const createFreshSession = async (suffix: string) => {
      const channel = `agent:${agentId}:mission-control:${suffix}:${Date.now()}`;
      return client.createSession(channel, agent.name);
    };

    if (action === 'new') {
      const session = await createFreshSession('new');
      return NextResponse.json({ success: true, action, session });
    }

    let warning: string | null = null;

    try {
      const rawSessions = await client.listSessions();
      const current = pickLatestSession(agentId, parseGatewaySessions(rawSessions));
      const currentKey = asString(current?.key);

      if (currentKey) {
        await client.call('chat.send', {
          sessionKey: currentKey,
          message: '[Mission Control] Reset requested from /agents. Start a fresh session and confirm readiness.',
          idempotencyKey: `agents-reset-${agentId}-${Date.now()}`,
        });
      } else {
        warning = 'No active session found for reset signal. Opened a fresh session.';
      }
    } catch {
      warning = 'Failed to send reset signal. Opened a fresh session.';
    }

    const session = await createFreshSession('reset');

    return NextResponse.json({
      success: true,
      action,
      session,
      warning,
    });
  } catch (error) {
    console.error('[agents/status] quick action failed:', error);
    return NextResponse.json(
      { error: 'Failed to perform quick action' },
      { status: 500 }
    );
  }
}
