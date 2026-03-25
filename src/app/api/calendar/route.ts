import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 15_000;
const MAX_BUFFER_BYTES = 3 * 1024 * 1024;
const DEFAULT_GWS_BINARY = '/usr/local/lib/node_modules/@googleworkspace/cli/node_modules/.bin_real/gws';

type CalendarCategory = 'work' | 'family' | 'home' | 'other';
type CalendarSource = 'gws' | 'accli' | 'none';

interface NormalizedCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  category: CalendarCategory;
  calendarName: string;
  calendarId?: string;
  location?: string;
  description?: string;
  sourceColor?: string;
}

interface CalendarResponsePayload {
  source: CalendarSource;
  range: {
    start: string;
    end: string;
  };
  generatedAt: string;
  events: NormalizedCalendarEvent[];
  sourceError?: string;
}

interface DateRange {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  startDate: string;
  endDate: string;
}

interface SelectableCalendar {
  id: string;
  name: string;
  primary?: boolean;
  sourceColor?: string;
}

interface SourceResult {
  source: Exclude<CalendarSource, 'none'>;
  events: NormalizedCalendarEvent[];
}

let cachedGwsBinary: string | null | undefined;

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRange(): DateRange {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 8);

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseJsonFromOutput(stdout: string, stderr: string): unknown | null {
  const text = stdout.trim() || stderr.trim();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Buffer) {
    return value.toString('utf8');
  }
  return '';
}

function extractErrorMessage(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }

  const errorValue = root.error;
  if (!errorValue) {
    return null;
  }

  if (typeof errorValue === 'string') {
    return errorValue;
  }

  const errorRecord = asRecord(errorValue);
  if (!errorRecord) {
    return 'Unknown source error';
  }

  if (typeof errorRecord.message === 'string' && errorRecord.message.length > 0) {
    return errorRecord.message;
  }

  if (typeof errorRecord.code === 'string' && errorRecord.code.length > 0) {
    return errorRecord.code;
  }

  return 'Unknown source error';
}

function normalizeCommandError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown command failure';
}

async function runJsonCommand(command: string, args: string[]): Promise<unknown> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
    });

    const parsed = parseJsonFromOutput(stdout, stderr);
    if (parsed === null) {
      throw new Error(`${command} returned non-JSON output`);
    }
    return parsed;
  } catch (error) {
    const commandError = error as Error & {
      stdout?: unknown;
      stderr?: unknown;
    };

    const parsed = parseJsonFromOutput(
      toText(commandError.stdout),
      toText(commandError.stderr)
    );
    if (parsed !== null) {
      return parsed;
    }

    throw new Error(`${command} ${args.join(' ')} failed: ${normalizeCommandError(error)}`);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getWorkingGwsBinary(): Promise<string | null> {
  if (cachedGwsBinary !== undefined) {
    return cachedGwsBinary;
  }

  const candidates = [process.env.GWS_BIN, DEFAULT_GWS_BINARY, 'gws']
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .filter((value, index, array) => array.indexOf(value) === index);

  for (const candidate of candidates) {
    if (candidate.includes('/') && !(await fileExists(candidate))) {
      continue;
    }

    try {
      const probe = await runJsonCommand(candidate, ['schema', 'calendar.events.list']);
      const probeRecord = asRecord(probe);
      if (probeRecord && probeRecord.parameters) {
        cachedGwsBinary = candidate;
        return candidate;
      }
    } catch {
      continue;
    }
  }

  cachedGwsBinary = null;
  return null;
}

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function inferCategory(input: string): CalendarCategory {
  const value = input.toLowerCase();
  if (value.includes('work')) return 'work';
  if (value.includes('family')) return 'family';
  if (value.includes('home')) return 'home';
  return 'other';
}

function pickTargetCalendars(calendars: SelectableCalendar[]): SelectableCalendar[] {
  if (calendars.length === 0) {
    return [];
  }

  const byId = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const envIds = parseCsvEnv(process.env.JOSH_CALENDAR_IDS);
  const envNames = parseCsvEnv(process.env.JOSH_CALENDAR_NAMES).map((name) => name.toLowerCase());

  const selectedById = envIds
    .map((id) => byId.get(id))
    .filter((calendar): calendar is SelectableCalendar => Boolean(calendar));
  if (selectedById.length > 0) {
    return selectedById;
  }

  if (envNames.length > 0) {
    const selectedByName = calendars.filter((calendar) => envNames.includes(calendar.name.toLowerCase()));
    if (selectedByName.length > 0) {
      return selectedByName;
    }
  }

  const joshCalendars = calendars.filter((calendar) => {
    const haystack = `${calendar.name} ${calendar.id}`.toLowerCase();
    return haystack.includes('josh');
  });
  if (joshCalendars.length > 0) {
    return joshCalendars;
  }

  const categoryCalendars = calendars.filter((calendar) => {
    const name = calendar.name.toLowerCase();
    return name.includes('work') || name.includes('family') || name.includes('home');
  });
  if (categoryCalendars.length > 0) {
    return categoryCalendars;
  }

  const primary = calendars.find((calendar) => calendar.primary);
  if (primary) {
    return [primary];
  }

  return [calendars[0]];
}

function sortEvents(events: NormalizedCalendarEvent[]): NormalizedCalendarEvent[] {
  return events.sort((a, b) => {
    const aTime = new Date(a.start).getTime();
    const bTime = new Date(b.start).getTime();
    return aTime - bTime;
  });
}

async function fetchFromGws(range: DateRange): Promise<SourceResult> {
  const binary = await getWorkingGwsBinary();
  if (!binary) {
    throw new Error('gws binary not available');
  }

  const calendarsPayload = await runJsonCommand(binary, [
    'calendar',
    'calendarList',
    'list',
    '--params',
    JSON.stringify({
      minAccessRole: 'reader',
      showHidden: false,
      maxResults: 250,
    }),
  ]);

  const calendarsError = extractErrorMessage(calendarsPayload);
  if (calendarsError) {
    throw new Error(calendarsError);
  }

  const calendarsRoot = asRecord(calendarsPayload);
  const calendarsItems = Array.isArray(calendarsRoot?.items) ? calendarsRoot.items : [];

  const calendars: SelectableCalendar[] = calendarsItems
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      name:
        typeof item.summary === 'string' && item.summary.length > 0
          ? item.summary
          : (typeof item.id === 'string' ? item.id : 'Unknown'),
      primary: Boolean(item.primary),
      sourceColor: typeof item.backgroundColor === 'string' ? item.backgroundColor : undefined,
    }))
    .filter((calendar) => calendar.id.length > 0);

  const selectedCalendars = pickTargetCalendars(calendars);
  if (selectedCalendars.length === 0) {
    return { source: 'gws', events: [] };
  }

  const collectedEvents: NormalizedCalendarEvent[] = [];
  const errors: string[] = [];
  let successfulCalendars = 0;

  await Promise.all(
    selectedCalendars.map(async (calendar) => {
      try {
        const eventsPayload = await runJsonCommand(binary, [
          'calendar',
          'events',
          'list',
          '--params',
          JSON.stringify({
            calendarId: calendar.id,
            timeMin: range.startIso,
            timeMax: range.endIso,
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
            showDeleted: false,
          }),
        ]);

        const eventsError = extractErrorMessage(eventsPayload);
        if (eventsError) {
          errors.push(`${calendar.name}: ${eventsError}`);
          return;
        }

        successfulCalendars += 1;
        const eventsRoot = asRecord(eventsPayload);
        const items = Array.isArray(eventsRoot?.items) ? eventsRoot.items : [];

        for (const rawItem of items) {
          const item = asRecord(rawItem);
          if (!item || item.status === 'cancelled') {
            continue;
          }

          const startRecord = asRecord(item.start);
          const endRecord = asRecord(item.end);
          const allDay = Boolean(startRecord?.date && !startRecord?.dateTime);
          const start =
            (typeof startRecord?.dateTime === 'string' ? startRecord.dateTime : undefined) ??
            (typeof startRecord?.date === 'string' ? startRecord.date : undefined);
          const end =
            (typeof endRecord?.dateTime === 'string' ? endRecord.dateTime : undefined) ??
            (typeof endRecord?.date === 'string' ? endRecord.date : undefined);

          if (!start || !end) {
            continue;
          }

          const title =
            typeof item.summary === 'string' && item.summary.trim().length > 0
              ? item.summary.trim()
              : '(Untitled event)';

          collectedEvents.push({
            id:
              typeof item.id === 'string' && item.id.length > 0
                ? item.id
                : `${calendar.id}:${start}:${title}`,
            title,
            start,
            end,
            allDay,
            category: inferCategory(`${calendar.name} ${title}`),
            calendarName: calendar.name,
            calendarId: calendar.id,
            location: typeof item.location === 'string' ? item.location : undefined,
            description: typeof item.description === 'string' ? item.description : undefined,
            sourceColor: calendar.sourceColor,
          });
        }
      } catch (error) {
        errors.push(`${calendar.name}: ${normalizeCommandError(error)}`);
      }
    })
  );

  if (successfulCalendars === 0 && errors.length > 0) {
    throw new Error(errors.join(' | '));
  }

  return { source: 'gws', events: sortEvents(collectedEvents) };
}

async function fetchFromAccli(range: DateRange): Promise<SourceResult> {
  const calendarsPayload = await runJsonCommand('accli', ['calendars', '--json']);
  const calendarsError = extractErrorMessage(calendarsPayload);
  if (calendarsError) {
    throw new Error(calendarsError);
  }

  const calendarsRoot = asRecord(calendarsPayload);
  const calendarsItems = Array.isArray(calendarsRoot?.calendars) ? calendarsRoot.calendars : [];

  const calendars: SelectableCalendar[] = calendarsItems
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      name:
        typeof item.name === 'string' && item.name.length > 0
          ? item.name
          : (typeof item.id === 'string' ? item.id : 'Unknown'),
      primary: false,
    }))
    .filter((calendar) => calendar.id.length > 0);

  const selectedCalendars = pickTargetCalendars(calendars);
  if (selectedCalendars.length === 0) {
    return { source: 'accli', events: [] };
  }

  const collectedEvents: NormalizedCalendarEvent[] = [];
  const errors: string[] = [];
  let successfulCalendars = 0;

  await Promise.all(
    selectedCalendars.map(async (calendar) => {
      try {
        const eventsPayload = await runJsonCommand('accli', [
          'events',
          '--calendar-id',
          calendar.id,
          '--from',
          range.startDate,
          '--to',
          range.endDate,
          '--max',
          '250',
          '--json',
        ]);

        const eventsError = extractErrorMessage(eventsPayload);
        if (eventsError) {
          errors.push(`${calendar.name}: ${eventsError}`);
          return;
        }

        successfulCalendars += 1;
        const eventsRoot = asRecord(eventsPayload);
        const items = Array.isArray(eventsRoot?.events) ? eventsRoot.events : [];

        for (const rawItem of items) {
          const item = asRecord(rawItem);
          if (!item) {
            continue;
          }

          const allDay = Boolean(item.allDay);
          const start =
            (allDay && typeof item.start === 'string' ? item.start : undefined) ??
            (typeof item.startISO === 'string' ? item.startISO : undefined) ??
            (typeof item.start === 'string' ? item.start : undefined);
          const end =
            (allDay && typeof item.end === 'string' ? item.end : undefined) ??
            (typeof item.endISO === 'string' ? item.endISO : undefined) ??
            (typeof item.end === 'string' ? item.end : undefined);

          if (!start || !end) {
            continue;
          }

          const title =
            typeof item.summary === 'string' && item.summary.trim().length > 0
              ? item.summary.trim()
              : '(Untitled event)';
          const calendarName =
            typeof item.calendar === 'string' && item.calendar.length > 0 ? item.calendar : calendar.name;

          collectedEvents.push({
            id:
              typeof item.id === 'string' && item.id.length > 0
                ? item.id
                : `${calendar.id}:${start}:${title}`,
            title,
            start,
            end,
            allDay,
            category: inferCategory(`${calendarName} ${title}`),
            calendarName,
            calendarId: typeof item.calendarId === 'string' ? item.calendarId : calendar.id,
            location: typeof item.location === 'string' ? item.location : undefined,
            description: typeof item.description === 'string' ? item.description : undefined,
          });
        }
      } catch (error) {
        errors.push(`${calendar.name}: ${normalizeCommandError(error)}`);
      }
    })
  );

  if (successfulCalendars === 0 && errors.length > 0) {
    throw new Error(errors.join(' | '));
  }

  return { source: 'accli', events: sortEvents(collectedEvents) };
}

function buildResponse(
  source: CalendarSource,
  range: DateRange,
  events: NormalizedCalendarEvent[],
  sourceError?: string
): CalendarResponsePayload {
  return {
    source,
    range: {
      start: range.startIso,
      end: range.endIso,
    },
    generatedAt: new Date().toISOString(),
    events,
    ...(sourceError ? { sourceError } : {}),
  };
}

export async function GET() {
  const range = getRange();
  const sourceErrors: string[] = [];

  try {
    const gwsResult = await fetchFromGws(range);
    return NextResponse.json(buildResponse(gwsResult.source, range, gwsResult.events), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    sourceErrors.push(`gws: ${normalizeCommandError(error)}`);
  }

  try {
    const accliResult = await fetchFromAccli(range);
    return NextResponse.json(buildResponse(accliResult.source, range, accliResult.events), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    sourceErrors.push(`accli: ${normalizeCommandError(error)}`);
  }

  return NextResponse.json(
    buildResponse('none', range, [], sourceErrors.join(' | ')),
    {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
}
