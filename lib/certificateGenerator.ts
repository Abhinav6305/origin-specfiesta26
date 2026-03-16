import { EventConfig, validateEventConfig } from './events';

const CSV_CACHE_TTL_MS = 60_000;
type CachedRows = {
  fetchedAt: number;
  rows: string[][];
};

type ColumnIndexes = {
  name: number;
  roll: number;
  email: number;
  year: number;
  branch: number;
  college: number;
};

const csvCache = new Map<string, CachedRows>();

// Parse Google Sheets CSV while preserving commas and line breaks in quoted cells.
function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }

      currentRow.push(currentField.trim());
      currentField = '';

      if (currentRow.some((field) => field.length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function getCachedRows(eventId: string) {
  const cached = csvCache.get(eventId);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.fetchedAt > CSV_CACHE_TTL_MS) {
    csvCache.delete(eventId);
    return null;
  }

  return cached.rows;
}

async function fetchEventRows(event: EventConfig): Promise<string[][]> {
  const cachedRows = getCachedRows(event.id);
  if (cachedRows) {
    console.log('Using cached CSV rows for event:', event.name);
    return cachedRows;
  }

  console.log('Fetching CSV for event:', event.name, 'URL:', event.csvUrl);
  const response = await fetch(event.csvUrl, {
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CSV for ${event.name}: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();
  const rows = parseCSV(csvText);
  csvCache.set(event.id, {
    fetchedAt: Date.now(),
    rows,
  });

  console.log('CSV fetched for event:', event.name, 'Rows:', rows.length);
  return rows;
}

export interface Participant {
  name: string;
  roll: string;
  email: string;
  year: string;
  branch: string;
  college: string;
}

export interface ParticipantLookupResult {
  found: boolean;
  eventName: string;
  participant?: Participant;
  error?: string;
}

export interface EventConnectivityStatus {
  eventId: string;
  eventName: string;
  spreadsheetOk: boolean;
  spreadsheetRowCount: number;
  error?: string;
}

function normalizeHeader(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ');
}

function getColumnIndexes(headers: string[] | undefined): ColumnIndexes {
  const defaults: ColumnIndexes = {
    name: 1,
    roll: 2,
    email: 3,
    year: 4,
    branch: 5,
    college: 6,
  };

  if (!headers || !headers.length) {
    return defaults;
  }

  const normalized = headers.map(normalizeHeader);
  const findIndex = (patterns: RegExp[], fallback: number) => {
    const index = normalized.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
    return index >= 0 ? index : fallback;
  };

  return {
    name: findIndex([/^name$/, /participant name/], defaults.name),
    roll: findIndex([/^roll$/, /^roll no$/, /^roll number$/, /^rollno$/], defaults.roll),
    email: findIndex([/^email$/, /^mail$/, /^e mail$/], defaults.email),
    year: findIndex([/^year$/, /academic year/], defaults.year),
    branch: findIndex([/^branch$/, /department/], defaults.branch),
    college: findIndex([/^college$/, /institution/], defaults.college),
  };
}

function getCell(row: string[], index: number): string {
  return String(row[index] ?? '').trim();
}

function normalizeYear(value: string): string {
  const normalizedValue = String(value || '').trim();
  const match = normalizedValue.match(/\b([1-4](?:st|nd|rd|th))\b/i);

  if (match) {
    return match[1].toLowerCase();
  }

  const numberMatch = normalizedValue.match(/\b([1-4])\b/);
  if (!numberMatch) {
    return normalizedValue;
  }

  const yearNumber = numberMatch[1];
  const suffixMap: Record<string, string> = {
    '1': '1st',
    '2': '2nd',
    '3': '3rd',
    '4': '4th',
  };

  return suffixMap[yearNumber] || normalizedValue;
}

function normalizeCollege(value: string): string {
  let normalizedValue = String(value || '').trim().replace(/\s+/g, ' ');

  if (!normalizedValue) {
    return normalizedValue;
  }

  normalizedValue = normalizedValue
    .replace(/\bst[.]?\s*peters\b/i, "St. Peter's")
    .replace(/\bst[.]?\s*peter'?s\b/i, "St. Peter's")
    .replace(/\bst[.]?\s*martin'?s\b/i, "St. Martin's");

  if (/engineering$/i.test(normalizedValue)) {
    normalizedValue = `${normalizedValue} College`;
  }

  if (
    /st\.\s*peter'?s engineering/i.test(normalizedValue) &&
    !/college$/i.test(normalizedValue)
  ) {
    normalizedValue = "St. Peter's Engineering College";
  }

  return normalizedValue;
}

function mapParticipant(row: string[], columns: ColumnIndexes): Participant {
  const name = getCell(row, columns.name);
  const roll = getCell(row, columns.roll);
  const email = getCell(row, columns.email);
  const year = normalizeYear(getCell(row, columns.year));
  const branch = getCell(row, columns.branch);
  const college = normalizeCollege(getCell(row, columns.college));

  console.log('Participant Found:', {
    name,
    roll,
    year,
    branch,
    college,
  });

  return {
    name,
    roll,
    email,
    year,
    branch,
    college,
  };
}

export async function fetchEventParticipants(
  rollNumber: string,
  event: EventConfig
): Promise<ParticipantLookupResult> {
  if (!validateEventConfig(event)) {
    return {
      found: false,
      eventName: event.name,
      error: `Invalid event config for ${event.name}`,
    };
  }

  try {
    const rows = await fetchEventRows(event);
    const normalizedRollNumber = String(rollNumber || '').trim().toUpperCase();

    if (!rows.length) {
      return {
        found: false,
        eventName: event.name,
        error: `No rows returned for ${event.name}`,
      };
    }

    const headers = rows[0];
    const columns = getColumnIndexes(headers);

    console.log('First row (headers) for event:', event.name, headers);
    console.log('Resolved columns for event:', event.name, columns);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      if (!row || row.every((cell) => String(cell || '').trim() === '')) {
        console.log('Row skipped - empty row', i, 'event:', event.name);
        continue;
      }

      if (row.length <= columns.roll) {
        console.log('Row skipped - insufficient columns', i, 'event:', event.name);
        continue;
      }

      const roll = getCell(row, columns.roll);

      console.log(
        'Checking row',
        i,
        'event:',
        event.name,
        'sheet roll:',
        roll,
        'search roll:',
        normalizedRollNumber
      );

      if (roll.toUpperCase() === normalizedRollNumber) {
        return {
          found: true,
          eventName: event.name,
          participant: mapParticipant(row, columns),
        };
      }
    }

    return {
      found: false,
      eventName: event.name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error fetching event participants for', event.name, message);
    return {
      found: false,
      eventName: event.name,
      error: message,
    };
  }
}

export async function generateCertificatesForParticipant(
  rollNumber: string,
  eventsList: EventConfig[]
): Promise<{ found: boolean; events: string[]; errors: string[] }> {
  const foundEvents: string[] = [];
  const errors: string[] = [];

  for (const event of eventsList) {
    const result = await fetchEventParticipants(rollNumber, event);

    if (result.found) {
      foundEvents.push(result.eventName);
    } else if (result.error) {
      errors.push(`${event.name}: ${result.error}`);
    }
  }

  return {
    found: foundEvents.length > 0,
    events: foundEvents,
    errors,
  };
}

export async function getEventSpreadsheetStatus(
  event: EventConfig
): Promise<EventConnectivityStatus> {
  try {
    const rows = await fetchEventRows(event);
    return {
      eventId: event.id,
      eventName: event.name,
      spreadsheetOk: true,
      spreadsheetRowCount: rows.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      eventId: event.id,
      eventName: event.name,
      spreadsheetOk: false,
      spreadsheetRowCount: 0,
      error: message,
    };
  }
}

export function clearEventCache() {
  csvCache.clear();
}
