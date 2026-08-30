import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://caslrvzsrxguqgzvhyug.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc2xydnpzcnhndXFnenZoeXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzczMzIsImV4cCI6MjEwMTU1MzMzMn0.V2-hIDweOcRBX7iYIaGqcCIgvC0LPL-z82Fn6iRLWlo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
  },
});

const TBDA_TABLE_NAME = 'TBDA';
const TBDA_COLUMNS = Array.from({ length: 31 }, (_, i) => `${i + 1}`);
const TBDA_CACHE_KEY = 'sabae.tbda.cache';
const TBDA_LAST_SEARCH_KEY = 'sabae.tbda.last-search';
const TBDA_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const TBDA_CACHE_VERSION = 3;
const TBDA_METADATA_COLUMNS = ['NOME', 'TURMA', 'TURNO', 'STATUS'];
export const ATTENDANCE_CACHE_KEY = 'sabae.attendance.cache';
const TBDA_SELECT = [
  ...TBDA_METADATA_COLUMNS.map((column) => `"${column}"`),
  ...TBDA_COLUMNS.map((column) => `"${column}"`),
].join(',');
let tbdaCacheSyncPromise: Promise<Record<string, unknown>[]> | null = null;

type TbdaCachePayload = {
  version: number;
  timestamp: number;
  data: Record<string, unknown>[];
};

function formatSaoPauloDateTime(value: number | Date = Date.now()): string {
  const date = typeof value === 'number' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

export function setTbdaLastSearchLabel(value: number | Date = Date.now()): string {
  const formatted = formatSaoPauloDateTime(value);
  try {
    localStorage.setItem(TBDA_LAST_SEARCH_KEY, formatted);
  } catch {}
  return formatted;
}

export function getTbdaLastSearchLabel(): string {
  try {
    return localStorage.getItem(TBDA_LAST_SEARCH_KEY) || '';
  } catch {
    return '';
  }
}

export async function syncTbdaCache(useSessionStorage = false): Promise<Record<string, unknown>[]> {
  const client = useSessionStorage ? supabaseWithSessionStorage : supabase;
  const result = await client
    .from(TBDA_TABLE_NAME)
    .select(TBDA_SELECT);

  if (result.error) {
    throw result.error;
  }

  const rows = Array.isArray(result.data)
    ? (result.data as unknown as Record<string, unknown>[])
    : [];
  const requestedAt = Date.now();
  const payload: TbdaCachePayload = {
    version: TBDA_CACHE_VERSION,
    timestamp: requestedAt,
    data: rows,
  };

  try {
    localStorage.setItem(TBDA_CACHE_KEY, JSON.stringify(payload));
  } catch {}
  setTbdaLastSearchLabel(requestedAt);
  return rows;
}

export async function ensureTbdaCache(useSessionStorage = false): Promise<Record<string, unknown>[]> {
  const cachedRows = getTbdaCache();
  if (cachedRows !== null) {
    return cachedRows;
  }

  if (!tbdaCacheSyncPromise) {
    tbdaCacheSyncPromise = syncTbdaCache(useSessionStorage).finally(() => {
      tbdaCacheSyncPromise = null;
    });
  }

  return tbdaCacheSyncPromise;
}

export type AttendanceCacheStatus = 'P' | 'FNJ' | 'FJ';

export type AttendanceCacheStudent = {
  name: string;
  registration: string;
  status: AttendanceCacheStatus | null;
};

export type AttendanceCacheEntry = {
  room: string;
  series: string;
  className: string;
  month: string;
  day: string;
  savedAt: number;
  students: AttendanceCacheStudent[];
};

export function saveAttendanceCacheEntry(entry: AttendanceCacheEntry): AttendanceCacheEntry[] {
  const currentEntries = getAttendanceCache();
  const normalizedEntry: AttendanceCacheEntry = {
    room: String(entry.room ?? '').trim(),
    series: String(entry.series ?? '').trim() || String(entry.room ?? '').trim(),
    className: String(entry.className ?? '').trim() || (String(entry.room ?? '').trim().split(/\s+/).at(-1) ?? ''),
    month: String(entry.month ?? '').trim(),
    day: String(entry.day ?? '').trim(),
    savedAt: Number(entry.savedAt ?? Date.now()),
    students: Array.isArray(entry.students) ? entry.students.map(student => ({
      name: String(student?.name ?? '').trim(),
      registration: String(student?.registration ?? '').trim(),
      status: student?.status === 'P' || student?.status === 'FNJ' || student?.status === 'FJ' ? student.status : null,
    })) : [],
  };

  const nextEntries = [...currentEntries, normalizedEntry];

  try {
    localStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(nextEntries));
  } catch {}

  return nextEntries;
}

export function getAttendanceCache(): AttendanceCacheEntry[] {
  try {
    const raw = localStorage.getItem(ATTENDANCE_CACHE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem(ATTENDANCE_CACHE_KEY);
      return [];
    }

    const normalizedEntries = parsed
      .filter((entry): entry is Partial<AttendanceCacheEntry> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => {
        const candidate = entry as Partial<AttendanceCacheEntry>;
        const room = typeof candidate.room === 'string' ? candidate.room.trim() : '';
        const month = typeof candidate.month === 'string' ? candidate.month.trim() : '';
        const day = typeof candidate.day === 'string' ? candidate.day.trim() : '';
        const students = Array.isArray(candidate.students) ? candidate.students : [];

        if (!room || !month || !day || !students.length) {
          return null;
        }

        return {
          room,
          series: typeof candidate.series === 'string' ? candidate.series.trim() : room,
          className: typeof candidate.className === 'string' ? candidate.className.trim() : '',
          month,
          day,
          savedAt: Number(candidate.savedAt ?? Date.now()),
          students: students.map(student => ({
            name: String(student?.name ?? '').trim(),
            registration: String(student?.registration ?? '').trim(),
            status: student?.status === 'P' || student?.status === 'FNJ' || student?.status === 'FJ' ? student.status : null,
          })),
        } satisfies AttendanceCacheEntry;
      })
      .filter((entry): entry is AttendanceCacheEntry => Boolean(entry));

    if (normalizedEntries.length !== parsed.length) {
      try {
        localStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(normalizedEntries));
      } catch {}
    }

    return normalizedEntries;
  } catch {
    try {
      localStorage.removeItem(ATTENDANCE_CACHE_KEY);
    } catch {}
    return [];
  }
}

export function removeAttendanceCacheEntry(savedAt: number): AttendanceCacheEntry[] {
  const currentEntries = getAttendanceCache();
  const nextEntries = currentEntries.filter(entry => Number(entry.savedAt) !== Number(savedAt));

  try {
    localStorage.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(nextEntries));
  } catch {}

  return nextEntries;
}

export function getTbdaClassrooms(rows: Record<string, unknown>[] | null = getTbdaCache()): string[] {
  if (!rows) {
    return [];
  }

  return Array.from(
    new Set(
      rows
        .map(row => String(row['TURMA'] ?? row['turma'] ?? '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function getTbdaCache(): Record<string, unknown>[] | null {
  try {
    const raw = localStorage.getItem(TBDA_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as TbdaCachePayload).data)) {
      const cachePayload = parsed as TbdaCachePayload;
      if (cachePayload.version !== TBDA_CACHE_VERSION) {
        localStorage.removeItem(TBDA_CACHE_KEY);
        return null;
      }

      const cacheAge = Date.now() - Number(cachePayload.timestamp || 0);
      if (cacheAge > TBDA_CACHE_TTL_MS) {
        localStorage.removeItem(TBDA_CACHE_KEY);
        return null;
      }

      const hasMetadata = cachePayload.data.every(row =>
        TBDA_METADATA_COLUMNS.every(column => Object.prototype.hasOwnProperty.call(row, column)),
      );
      if (!hasMetadata) {
        localStorage.removeItem(TBDA_CACHE_KEY);
        return null;
      }

      return cachePayload.data;
    }

    return null;
  } catch {
    return null;
  }
}

export const supabaseWithSessionStorage = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: sessionStorage,
    },
  }
);
