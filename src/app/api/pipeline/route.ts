import { NextResponse } from 'next/server';
import { queryAll, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

const KEYWORDS = [
  'cogrow',
  'prospect',
  'outreach',
  'lead',
  'follow up',
  'follow-up',
  'discovery call',
  'pipeline',
] as const;

const PROSPECT_TABLE_CANDIDATES = [
  'cogrow_prospects',
  'prospects',
  'leads',
  'pipeline_prospects',
  'sales_prospects',
] as const;

const OUTREACH_TABLE_CANDIDATES = [
  'cogrow_outreach',
  'outreach',
  'outreach_events',
  'outreach_log',
  'prospect_outreach',
  'sales_outreach',
] as const;

type SourceStatus = 'ok' | 'empty' | 'missing' | 'error';

interface SourceAttempt {
  id: string;
  label: string;
  target: string;
  status: SourceStatus;
  attempted: boolean;
  count: number;
  detail: string;
}

interface ProspectItem {
  id: string;
  name: string;
  company: string | null;
  stage: string | null;
  status: string | null;
  updated_at: string | null;
  source: string;
}

interface OutreachItem {
  id: string;
  prospect_name: string | null;
  channel: string | null;
  status: string | null;
  owner: string | null;
  activity_at: string | null;
  notes: string;
  source: string;
}

interface SqliteTableRow {
  name: string;
}

interface SqlitePragmaRow {
  name: string;
}

interface CountRow {
  count: number;
}

interface RawProspectRow {
  source_id: string;
  prospect_name: string;
  company_name: string | null;
  stage_value: string | null;
  status_value: string | null;
  updated_value: string | null;
}

interface RawOutreachRow {
  source_id: string;
  prospect_name: string | null;
  channel_value: string | null;
  status_value: string | null;
  owner_value: string | null;
  sent_value: string | null;
  replied_value: string | null;
  notes_value: string | null;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function pickColumn(columns: string[], candidates: readonly string[]): string | null {
  const byLower = new Map(columns.map((name) => [name.toLowerCase(), name]));
  for (const candidate of candidates) {
    const found = byLower.get(candidate.toLowerCase());
    if (found) {
      return found;
    }
  }
  return null;
}

function buildKeywordPredicate(expression: string): string {
  return KEYWORDS.map(() => `${expression} LIKE ?`).join(' OR ');
}

function buildKeywordParams(): string[] {
  return KEYWORDS.map((keyword) => `%${keyword.toLowerCase()}%`);
}

function parseEpoch(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeText(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.trim();
}

function compact<T>(rows: T[]): T[] {
  return rows.filter(Boolean);
}

function inferChannel(input: string): string | null {
  const value = input.toLowerCase();
  if (value.includes('linkedin')) return 'linkedin';
  if (value.includes('email') || value.includes('mail')) return 'email';
  if (value.includes('call') || value.includes('phone')) return 'call';
  if (value.includes('sms') || value.includes('text')) return 'sms';
  return null;
}

function inferOutreachStatus(input: string): string | null {
  const value = input.toLowerCase();
  if (value.includes('replied') || value.includes('reply')) return 'replied';
  if (value.includes('sent') || value.includes('contacted')) return 'sent';
  if (value.includes('bounce') || value.includes('failed')) return 'failed';
  if (value.includes('scheduled')) return 'scheduled';
  return null;
}

function parseMetadata(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function readMetadataString(
  metadata: Record<string, unknown> | null,
  keys: readonly string[]
): string | null {
  if (!metadata) {
    return null;
  }

  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function truncate(value: string, max = 180): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function upsertProspects(target: ProspectItem[], rows: ProspectItem[]): void {
  const existing = new Set(target.map((item) => item.id));
  for (const row of rows) {
    if (!existing.has(row.id)) {
      target.push(row);
      existing.add(row.id);
    }
  }
}

function upsertOutreach(target: OutreachItem[], rows: OutreachItem[]): void {
  const existing = new Set(target.map((item) => item.id));
  for (const row of rows) {
    if (!existing.has(row.id)) {
      target.push(row);
      existing.add(row.id);
    }
  }
}

export async function GET() {
  try {
    const sources: SourceAttempt[] = [];
    const prospects: ProspectItem[] = [];
    const outreach: OutreachItem[] = [];

    const tables = queryAll<SqliteTableRow>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    );
    const tableSet = new Set(tables.map((row) => row.name.toLowerCase()));

    const hasTable = (table: string): boolean => tableSet.has(table.toLowerCase());

    const foundProspectTables = PROSPECT_TABLE_CANDIDATES.filter((table) => hasTable(table));

    if (foundProspectTables.length === 0) {
      sources.push({
        id: 'prospects_dedicated_tables',
        label: 'Dedicated Prospects Source',
        target: PROSPECT_TABLE_CANDIDATES.join(', '),
        status: 'missing',
        attempted: true,
        count: 0,
        detail: 'No dedicated prospects table exists in local SQLite schema.',
      });
    } else {
      let loadedRows = 0;
      let loadErrors = 0;
      let totalRows = 0;

      for (const table of foundProspectTables) {
        try {
          const columns = queryAll<SqlitePragmaRow>(
            `PRAGMA table_info(${quoteIdentifier(table)})`
          ).map((column) => column.name);

          const idColumn = pickColumn(columns, ['id', 'prospect_id', 'lead_id']);
          const nameColumn = pickColumn(columns, [
            'name',
            'prospect_name',
            'lead_name',
            'contact_name',
            'full_name',
          ]);
          const companyColumn = pickColumn(columns, ['company', 'company_name', 'organization']);
          const stageColumn = pickColumn(columns, ['stage', 'pipeline_stage']);
          const statusColumn = pickColumn(columns, ['status', 'state']);
          const updatedColumn = pickColumn(columns, [
            'updated_at',
            'last_updated_at',
            'last_contact_at',
            'created_at',
          ]);

          const idExpr = idColumn ? quoteIdentifier(idColumn) : 'rowid';
          const nameExpr = nameColumn
            ? `CAST(${quoteIdentifier(nameColumn)} AS TEXT)`
            : companyColumn
              ? `CAST(${quoteIdentifier(companyColumn)} AS TEXT)`
              : "''";
          const companyExpr = companyColumn ? `CAST(${quoteIdentifier(companyColumn)} AS TEXT)` : 'NULL';
          const stageExpr = stageColumn ? `CAST(${quoteIdentifier(stageColumn)} AS TEXT)` : 'NULL';
          const statusExpr = statusColumn ? `CAST(${quoteIdentifier(statusColumn)} AS TEXT)` : 'NULL';
          const updatedExpr = updatedColumn ? `CAST(${quoteIdentifier(updatedColumn)} AS TEXT)` : 'NULL';
          const orderByExpr = updatedColumn ? quoteIdentifier(updatedColumn) : idExpr;

          totalRows +=
            queryOne<CountRow>(`SELECT COUNT(*) as count FROM ${quoteIdentifier(table)}`)?.count ?? 0;

          const rows = queryAll<RawProspectRow>(
            `SELECT
               CAST(${idExpr} AS TEXT) AS source_id,
               TRIM(COALESCE(${nameExpr}, '')) AS prospect_name,
               NULLIF(TRIM(COALESCE(${companyExpr}, '')), '') AS company_name,
               NULLIF(TRIM(COALESCE(${stageExpr}, '')), '') AS stage_value,
               NULLIF(TRIM(COALESCE(${statusExpr}, '')), '') AS status_value,
               NULLIF(TRIM(COALESCE(${updatedExpr}, '')), '') AS updated_value
             FROM ${quoteIdentifier(table)}
             ORDER BY ${orderByExpr} DESC
             LIMIT 120`
          );

          const mapped = compact(
            rows.map((row) => {
              const name = safeText(row.prospect_name) || safeText(row.company_name) || '(unnamed prospect)';
              return {
                id: `${table}:${row.source_id}`,
                name,
                company: row.company_name,
                stage: row.stage_value,
                status: row.status_value,
                updated_at: row.updated_value,
                source: `table:${table}`,
              } satisfies ProspectItem;
            })
          );

          loadedRows += mapped.length;
          upsertProspects(prospects, mapped);
        } catch (error) {
          console.error(`[pipeline] Failed to query prospects table ${table}:`, error);
          loadErrors += 1;
        }
      }

      const status: SourceStatus = loadErrors > 0 && loadedRows === 0
        ? 'error'
        : totalRows === 0
          ? 'empty'
          : 'ok';

      const detail = status === 'error'
        ? 'Dedicated prospects table exists but queries failed.'
        : status === 'empty'
          ? `Dedicated prospects tables found (${foundProspectTables.join(', ')}) but contain no rows.`
          : `Loaded ${loadedRows} rows from dedicated prospects table(s): ${foundProspectTables.join(', ')}.`;

      sources.push({
        id: 'prospects_dedicated_tables',
        label: 'Dedicated Prospects Source',
        target: foundProspectTables.join(', '),
        status,
        attempted: true,
        count: loadedRows,
        detail,
      });
    }

    const foundOutreachTables = OUTREACH_TABLE_CANDIDATES.filter((table) => hasTable(table));

    if (foundOutreachTables.length === 0) {
      sources.push({
        id: 'outreach_dedicated_tables',
        label: 'Dedicated Outreach Source',
        target: OUTREACH_TABLE_CANDIDATES.join(', '),
        status: 'missing',
        attempted: true,
        count: 0,
        detail: 'No dedicated outreach table exists in local SQLite schema.',
      });
    } else {
      let loadedRows = 0;
      let loadErrors = 0;
      let totalRows = 0;

      for (const table of foundOutreachTables) {
        try {
          const columns = queryAll<SqlitePragmaRow>(
            `PRAGMA table_info(${quoteIdentifier(table)})`
          ).map((column) => column.name);

          const idColumn = pickColumn(columns, ['id', 'outreach_id']);
          const prospectColumn = pickColumn(columns, [
            'prospect_name',
            'lead_name',
            'contact_name',
            'name',
          ]);
          const channelColumn = pickColumn(columns, ['channel', 'method', 'type']);
          const statusColumn = pickColumn(columns, ['status', 'state', 'outcome']);
          const ownerColumn = pickColumn(columns, ['owner', 'owner_name', 'agent', 'sender']);
          const sentColumn = pickColumn(columns, ['sent_at', 'contacted_at', 'created_at']);
          const repliedColumn = pickColumn(columns, ['replied_at', 'response_at']);
          const notesColumn = pickColumn(columns, ['notes', 'message', 'content', 'subject']);

          const idExpr = idColumn ? quoteIdentifier(idColumn) : 'rowid';
          const prospectExpr = prospectColumn ? `CAST(${quoteIdentifier(prospectColumn)} AS TEXT)` : 'NULL';
          const channelExpr = channelColumn ? `CAST(${quoteIdentifier(channelColumn)} AS TEXT)` : 'NULL';
          const statusExpr = statusColumn ? `CAST(${quoteIdentifier(statusColumn)} AS TEXT)` : 'NULL';
          const ownerExpr = ownerColumn ? `CAST(${quoteIdentifier(ownerColumn)} AS TEXT)` : 'NULL';
          const sentExpr = sentColumn ? `CAST(${quoteIdentifier(sentColumn)} AS TEXT)` : 'NULL';
          const repliedExpr = repliedColumn ? `CAST(${quoteIdentifier(repliedColumn)} AS TEXT)` : 'NULL';
          const notesExpr = notesColumn ? `CAST(${quoteIdentifier(notesColumn)} AS TEXT)` : 'NULL';
          const orderByExpr = repliedColumn
            ? quoteIdentifier(repliedColumn)
            : sentColumn
              ? quoteIdentifier(sentColumn)
              : idExpr;

          totalRows +=
            queryOne<CountRow>(`SELECT COUNT(*) as count FROM ${quoteIdentifier(table)}`)?.count ?? 0;

          const rows = queryAll<RawOutreachRow>(
            `SELECT
               CAST(${idExpr} AS TEXT) AS source_id,
               NULLIF(TRIM(COALESCE(${prospectExpr}, '')), '') AS prospect_name,
               NULLIF(TRIM(COALESCE(${channelExpr}, '')), '') AS channel_value,
               NULLIF(TRIM(COALESCE(${statusExpr}, '')), '') AS status_value,
               NULLIF(TRIM(COALESCE(${ownerExpr}, '')), '') AS owner_value,
               NULLIF(TRIM(COALESCE(${sentExpr}, '')), '') AS sent_value,
               NULLIF(TRIM(COALESCE(${repliedExpr}, '')), '') AS replied_value,
               NULLIF(TRIM(COALESCE(${notesExpr}, '')), '') AS notes_value
             FROM ${quoteIdentifier(table)}
             ORDER BY ${orderByExpr} DESC
             LIMIT 120`
          );

          const mapped = compact(
            rows.map((row) => ({
              id: `${table}:${row.source_id}`,
              prospect_name: row.prospect_name,
              channel: row.channel_value,
              status: row.status_value,
              owner: row.owner_value,
              activity_at: row.replied_value || row.sent_value,
              notes: truncate(safeText(row.notes_value) || '(no note)'),
              source: `table:${table}`,
            } satisfies OutreachItem))
          );

          loadedRows += mapped.length;
          upsertOutreach(outreach, mapped);
        } catch (error) {
          console.error(`[pipeline] Failed to query outreach table ${table}:`, error);
          loadErrors += 1;
        }
      }

      const status: SourceStatus = loadErrors > 0 && loadedRows === 0
        ? 'error'
        : totalRows === 0
          ? 'empty'
          : 'ok';

      const detail = status === 'error'
        ? 'Dedicated outreach table exists but queries failed.'
        : status === 'empty'
          ? `Dedicated outreach tables found (${foundOutreachTables.join(', ')}) but contain no rows.`
          : `Loaded ${loadedRows} rows from dedicated outreach table(s): ${foundOutreachTables.join(', ')}.`;

      sources.push({
        id: 'outreach_dedicated_tables',
        label: 'Dedicated Outreach Source',
        target: foundOutreachTables.join(', '),
        status,
        attempted: true,
        count: loadedRows,
        detail,
      });
    }

    if (hasTable('tasks')) {
      const predicate = buildKeywordPredicate(
        "LOWER(COALESCE(t.title, '') || ' ' || COALESCE(t.description, ''))"
      );
      const taskRows = queryAll<{
        id: string;
        title: string;
        description: string | null;
        status: string | null;
        priority: string | null;
        updated_at: string | null;
        created_at: string | null;
      }>(
        `SELECT t.id, t.title, t.description, t.status, t.priority, t.updated_at, t.created_at
         FROM tasks t
         WHERE ${predicate}
         ORDER BY COALESCE(t.updated_at, t.created_at) DESC
         LIMIT 120`,
        buildKeywordParams()
      );

      upsertProspects(
        prospects,
        taskRows.map((row) => ({
          id: `tasks:${row.id}`,
          name: safeText(row.title) || '(untitled task)',
          company: null,
          stage: row.status,
          status: row.priority,
          updated_at: row.updated_at || row.created_at,
          source: 'fallback:tasks_keyword_scan',
        }))
      );

      sources.push({
        id: 'tasks_keyword_scan',
        label: 'Tasks Keyword Scan',
        target: 'tasks.title + tasks.description',
        status: taskRows.length > 0 ? 'ok' : 'empty',
        attempted: true,
        count: taskRows.length,
        detail:
          taskRows.length > 0
            ? `Matched ${taskRows.length} rows via CoGrow/prospect/outreach keywords.`
            : 'No keyword matches found in tasks table.',
      });
    } else {
      sources.push({
        id: 'tasks_keyword_scan',
        label: 'Tasks Keyword Scan',
        target: 'tasks.title + tasks.description',
        status: 'missing',
        attempted: true,
        count: 0,
        detail: 'tasks table is missing.',
      });
    }

    if (hasTable('events')) {
      const predicate = buildKeywordPredicate(
        "LOWER(COALESCE(e.type, '') || ' ' || COALESCE(e.message, '') || ' ' || COALESCE(e.metadata, ''))"
      );
      const eventRows = queryAll<{
        id: string;
        type: string;
        message: string;
        metadata: string | null;
        created_at: string | null;
        agent_name: string | null;
      }>(
        `SELECT e.id, e.type, e.message, e.metadata, e.created_at, a.name as agent_name
         FROM events e
         LEFT JOIN agents a ON a.id = e.agent_id
         WHERE ${predicate}
         ORDER BY e.created_at DESC
         LIMIT 120`,
        buildKeywordParams()
      );

      const mapped = eventRows.map((row) => {
        const metadata = parseMetadata(row.metadata);
        const metadataSerialized = row.metadata ?? '';
        const lookupText = `${row.type} ${row.message} ${metadataSerialized}`;
        return {
          id: `events:${row.id}`,
          prospect_name:
            readMetadataString(metadata, ['prospect_name', 'prospect', 'lead_name', 'lead', 'contact_name']) ?? null,
          channel: readMetadataString(metadata, ['channel', 'method']) || inferChannel(lookupText),
          status: readMetadataString(metadata, ['status', 'outcome']) || inferOutreachStatus(lookupText) || row.type,
          owner: row.agent_name,
          activity_at: row.created_at,
          notes: truncate(safeText(row.message) || '(empty event message)'),
          source: 'fallback:events_keyword_scan',
        } satisfies OutreachItem;
      });

      upsertOutreach(outreach, mapped);

      sources.push({
        id: 'events_keyword_scan',
        label: 'Events Keyword Scan',
        target: 'events.type + events.message + events.metadata',
        status: eventRows.length > 0 ? 'ok' : 'empty',
        attempted: true,
        count: eventRows.length,
        detail:
          eventRows.length > 0
            ? `Matched ${eventRows.length} event rows via CoGrow/prospect/outreach keywords.`
            : 'No keyword matches found in events table.',
      });
    } else {
      sources.push({
        id: 'events_keyword_scan',
        label: 'Events Keyword Scan',
        target: 'events.type + events.message + events.metadata',
        status: 'missing',
        attempted: true,
        count: 0,
        detail: 'events table is missing.',
      });
    }

    if (hasTable('task_activities')) {
      const predicate = buildKeywordPredicate(
        "LOWER(COALESCE(ta.activity_type, '') || ' ' || COALESCE(ta.message, '') || ' ' || COALESCE(ta.metadata, ''))"
      );
      const activityRows = queryAll<{
        id: string;
        activity_type: string;
        message: string;
        metadata: string | null;
        created_at: string | null;
        agent_name: string | null;
      }>(
        `SELECT ta.id, ta.activity_type, ta.message, ta.metadata, ta.created_at, a.name as agent_name
         FROM task_activities ta
         LEFT JOIN agents a ON a.id = ta.agent_id
         WHERE ${predicate}
         ORDER BY ta.created_at DESC
         LIMIT 120`,
        buildKeywordParams()
      );

      const mapped = activityRows.map((row) => {
        const metadata = parseMetadata(row.metadata);
        const lookupText = `${row.activity_type} ${row.message} ${row.metadata || ''}`;
        return {
          id: `task_activities:${row.id}`,
          prospect_name:
            readMetadataString(metadata, ['prospect_name', 'prospect', 'lead_name', 'lead', 'contact_name']) ?? null,
          channel: readMetadataString(metadata, ['channel', 'method']) || inferChannel(lookupText),
          status:
            readMetadataString(metadata, ['status', 'outcome']) ||
            inferOutreachStatus(lookupText) ||
            row.activity_type,
          owner: row.agent_name,
          activity_at: row.created_at,
          notes: truncate(safeText(row.message) || '(empty activity message)'),
          source: 'fallback:task_activities_keyword_scan',
        } satisfies OutreachItem;
      });

      upsertOutreach(outreach, mapped);

      sources.push({
        id: 'task_activities_keyword_scan',
        label: 'Task Activities Keyword Scan',
        target: 'task_activities.activity_type + message + metadata',
        status: activityRows.length > 0 ? 'ok' : 'empty',
        attempted: true,
        count: activityRows.length,
        detail:
          activityRows.length > 0
            ? `Matched ${activityRows.length} task-activity rows via CoGrow/prospect/outreach keywords.`
            : 'No keyword matches found in task_activities table.',
      });
    } else {
      sources.push({
        id: 'task_activities_keyword_scan',
        label: 'Task Activities Keyword Scan',
        target: 'task_activities.activity_type + message + metadata',
        status: 'missing',
        attempted: true,
        count: 0,
        detail: 'task_activities table is missing.',
      });
    }

    if (hasTable('messages')) {
      const predicate = buildKeywordPredicate(
        "LOWER(COALESCE(m.content, '') || ' ' || COALESCE(m.metadata, ''))"
      );
      const messageRows = queryAll<{
        id: string;
        content: string;
        metadata: string | null;
        created_at: string | null;
        sender_name: string | null;
      }>(
        `SELECT m.id, m.content, m.metadata, m.created_at, a.name as sender_name
         FROM messages m
         LEFT JOIN agents a ON a.id = m.sender_agent_id
         WHERE ${predicate}
         ORDER BY m.created_at DESC
         LIMIT 120`,
        buildKeywordParams()
      );

      const mapped = messageRows.map((row) => {
        const metadata = parseMetadata(row.metadata);
        const lookupText = `${row.content} ${row.metadata || ''}`;
        return {
          id: `messages:${row.id}`,
          prospect_name:
            readMetadataString(metadata, ['prospect_name', 'prospect', 'lead_name', 'lead', 'contact_name']) ?? null,
          channel: readMetadataString(metadata, ['channel', 'method']) || inferChannel(lookupText),
          status: readMetadataString(metadata, ['status', 'outcome']) || inferOutreachStatus(lookupText),
          owner: row.sender_name,
          activity_at: row.created_at,
          notes: truncate(safeText(row.content) || '(empty message)'),
          source: 'fallback:messages_keyword_scan',
        } satisfies OutreachItem;
      });

      upsertOutreach(outreach, mapped);

      sources.push({
        id: 'messages_keyword_scan',
        label: 'Messages Keyword Scan',
        target: 'messages.content + messages.metadata',
        status: messageRows.length > 0 ? 'ok' : 'empty',
        attempted: true,
        count: messageRows.length,
        detail:
          messageRows.length > 0
            ? `Matched ${messageRows.length} message rows via CoGrow/prospect/outreach keywords.`
            : 'No keyword matches found in messages table.',
      });
    } else {
      sources.push({
        id: 'messages_keyword_scan',
        label: 'Messages Keyword Scan',
        target: 'messages.content + messages.metadata',
        status: 'missing',
        attempted: true,
        count: 0,
        detail: 'messages table is missing.',
      });
    }

    const sortedProspects = [...prospects]
      .sort((a, b) => parseEpoch(b.updated_at) - parseEpoch(a.updated_at))
      .slice(0, 200);
    const sortedOutreach = [...outreach]
      .sort((a, b) => parseEpoch(b.activity_at) - parseEpoch(a.activity_at))
      .slice(0, 200);

    const lastActivityAt = [
      ...sortedProspects.map((item) => item.updated_at),
      ...sortedOutreach.map((item) => item.activity_at),
    ]
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => parseEpoch(b) - parseEpoch(a))[0] ?? null;

    const summary = {
      prospects_total: sortedProspects.length,
      outreach_total: sortedOutreach.length,
      sources_ok: sources.filter((source) => source.status === 'ok').length,
      sources_missing: sources.filter((source) => source.status === 'missing').length,
      sources_error: sources.filter((source) => source.status === 'error').length,
      last_activity_at: lastActivityAt,
    };

    return NextResponse.json(
      {
        generated_at: new Date().toISOString(),
        refresh_ms: 15000,
        keywords: KEYWORDS,
        summary,
        sources,
        prospects: sortedProspects,
        outreach: sortedOutreach,
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('[pipeline] Failed to load pipeline data:', error);
    return NextResponse.json(
      {
        error: 'Failed to load pipeline data',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
