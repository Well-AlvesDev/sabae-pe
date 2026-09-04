import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://caslrvzsrxguqgzvhyug.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc2xydnpzcnhndXFnenZoeXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzczMzIsImV4cCI6MjEwMTU1MzMzMn0.V2-hIDweOcRBX7iYIaGqcCIgvC0LPL-z82Fn6iRLWlo';

function createSafeStorage(): Storage {
  const browserStorage = typeof globalThis !== 'undefined'
    ? (globalThis as typeof globalThis & { localStorage?: Storage; sessionStorage?: Storage }).localStorage
    : undefined;

  if (browserStorage && typeof browserStorage.getItem === 'function' && typeof browserStorage.setItem === 'function') {
    return browserStorage;
  }

  const store = new Map<string, string>();
  const safeStorage: Storage = {
    length: 0,
    clear: () => { store.clear(); },
    getItem: (key: string) => (store.has(key) ? store.get(key) ?? null : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => { store.delete(key); },
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
  };

  Object.defineProperty(safeStorage, 'length', {
    get: () => store.size,
    enumerable: true,
    configurable: true,
  });

  return safeStorage;
}

const localStorageStore = createSafeStorage();
const sessionStorageStore = createSafeStorage();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorageStore,
  },
});

const TBDA_TABLE_NAME = 'TBDA';
const TBDA_COLUMNS = Array.from({ length: 31 }, (_, i) => `${i + 1}`);
const TBDA_CACHE_KEY = 'sabae.tbda.cache';
const TBDA_LAST_SEARCH_KEY = 'sabae.tbda.last-search';
const TBDA_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const TBDA_CACHE_VERSION = 4;
const TBDA_METADATA_COLUMNS = ['MAT', 'NOME', 'TURMA', 'TURNO', 'STATUS'];
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
    localStorageStore.setItem(TBDA_LAST_SEARCH_KEY, formatted);
  } catch {}
  return formatted;
}

export function getTbdaLastSearchLabel(): string {
  try {
    return localStorageStore.getItem(TBDA_LAST_SEARCH_KEY) || '';
  } catch {
    return '';
  }
}

export async function syncTbdaCache(
  useSessionStorage = false,
  validateRows?: (rows: Record<string, unknown>[]) => boolean,
): Promise<Record<string, unknown>[]> {
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

  if (validateRows && !validateRows(rows)) {
    throw new Error('Os dados de chamada enviados ainda não foram confirmados no TBDA.');
  }

  const requestedAt = Date.now();
  const payload: TbdaCachePayload = {
    version: TBDA_CACHE_VERSION,
    timestamp: requestedAt,
    data: rows,
  };

  try {
    localStorageStore.setItem(TBDA_CACHE_KEY, JSON.stringify(payload));
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

export type AttendanceCacheEntryInput = Omit<AttendanceCacheEntry, 'series' | 'className'> & {
  series?: string;
  className?: string;
};

export function normalizeAttendanceMonth(value: string | number): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }

  const numeric = Number.parseInt(raw, 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) {
    return String(numeric);
  }

  const monthMap: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  const normalizedKey = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const mappedMonth = monthMap[normalizedKey];
  return Number.isInteger(mappedMonth) ? String(mappedMonth) : '';
}

export function appendAttendanceCellValue(existingValue: unknown, status: AttendanceCacheStatus, month: number): string {
  const normalizedMonth = Number.isFinite(month) ? Number(month) : 0;
  const token = `${status}:${normalizedMonth}`;
  const rawText = String(existingValue ?? '').trim();

  if (!rawText) {
    return token;
  }

  const values = rawText
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  if (values.includes(token)) {
    return values.join(',');
  }

  return [...values, token].join(',');
}

export type AttendanceSendProgressUpdate = {
  total: number;
  processed: number;
  sent: number;
  failed: number;
  sentEntries: string[];
  failedEntries: string[];
  currentEntryLabel: string;
  completed: boolean;
};

export function getAttendanceEntryLabel(entry: AttendanceCacheEntry): string {
  const room = String(entry.room ?? '').trim();
  const series = String(entry.series ?? '').trim();
  const className = String(entry.className ?? '').trim();
  const base = [series || room, className].filter(Boolean).join(' ').trim();
  const day = String(entry.day ?? '').trim();
  const month = normalizeAttendanceMonth(entry.month);

  if (base) {
    return `${base} • ${day}/${month || '--'}`;
  }

  return `Chamada ${day}/${month || '--'}`;
}

export function getAttendanceRegistrationPayloadsForEntry(entry: AttendanceCacheEntry): Array<{ savedAt: number; dia: number; mes: number; mat: string; nome: string; presenca: string }> {
  const monthValue = Number.parseInt(normalizeAttendanceMonth(entry.month), 10);
  const dayValue = Number.parseInt(String(entry.day ?? '').trim(), 10);

  return entry.students
    .filter(student => student.status && student.registration)
    .map(student => ({
      savedAt: Number(entry.savedAt ?? Date.now()),
      dia: Number.isFinite(dayValue) ? dayValue : 0,
      mes: Number.isFinite(monthValue) ? monthValue : 0,
      mat: String(student.registration),
      nome: String(student.name ?? ''),
      presenca: String(student.status),
    }));
}

export function getAttendanceRegistrationPayloads(): Array<{ savedAt: number; dia: number; mes: number; mat: string; nome: string; presenca: string }> {
  return getAttendanceCache().flatMap((entry) => getAttendanceRegistrationPayloadsForEntry(entry));
}

export async function sendAttendanceCacheToTbda(
  onProgress?: (update: AttendanceSendProgressUpdate) => void,
): Promise<{ success: number; failed: number; errors: string[]; sentEntries: string[]; failedEntries: string[]; total: number; processed: number }> {
  const cacheEntries = getAttendanceCache();
  const total = cacheEntries.length;

  if (total === 0) {
    return { success: 0, failed: 0, errors: [], sentEntries: [], failedEntries: [], total: 0, processed: 0 };
  }

  let processed = 0;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const sentEntries: string[] = [];
  const failedEntries: string[] = [];

  onProgress?.({
    total,
    processed,
    sent: success,
    failed,
    sentEntries,
    failedEntries,
    currentEntryLabel: 'Preparando envio...',
    completed: false,
  });

  for (const entry of cacheEntries) {
    const currentEntryLabel = getAttendanceEntryLabel(entry);
    const attendancePayload = getAttendanceRegistrationPayloadsForEntry(entry);

    onProgress?.({
      total,
      processed,
      sent: success,
      failed,
      sentEntries,
      failedEntries,
      currentEntryLabel: `Enviando ${currentEntryLabel}`,
      completed: false,
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    if (attendancePayload.length === 0) {
      processed += 1;
      failed += 1;
      failedEntries.push(currentEntryLabel);
      errors.push(`Nenhuma presença válida para: ${currentEntryLabel}`);
      onProgress?.({
        total,
        processed,
        sent: success,
        failed,
        sentEntries,
        failedEntries,
        currentEntryLabel,
        completed: processed >= total,
      });
      continue;
    }

    const rpcResult = await supabase.rpc('send_attendance_cache', {
      attendance_data: attendancePayload,
    });

    await new Promise(resolve => setTimeout(resolve, 120));

    if (rpcResult.error) {
      processed += 1;
      failed += 1;
      failedEntries.push(currentEntryLabel);
      errors.push(`Erro na RPC para ${currentEntryLabel}: ${rpcResult.error.message}`);
      onProgress?.({
        total,
        processed,
        sent: success,
        failed,
        sentEntries,
        failedEntries,
        currentEntryLabel,
        completed: processed >= total,
      });
      continue;
    }

    const result = rpcResult.data as { success: number; failed: number; errors: string[] };

    if (result.failed === 0 && result.success === attendancePayload.length) {
      success += 1;
      sentEntries.push(currentEntryLabel);
      removeAttendanceCacheEntry(entry.savedAt);
    } else {
      failed += 1;
      failedEntries.push(currentEntryLabel);
      const responseErrors = result.errors ?? [];
      errors.push(
        ...(responseErrors.length
          ? responseErrors
          : [`A RPC confirmou ${result.success} de ${attendancePayload.length} registros para ${currentEntryLabel}.`]
        ).map(error => `${currentEntryLabel}: ${error}`),
      );
    }

    processed += 1;

    onProgress?.({
      total,
      processed,
      sent: success,
      failed,
      sentEntries,
      failedEntries,
      currentEntryLabel,
      completed: processed >= total,
    });
  }

  return {
    success,
    failed,
    errors,
    sentEntries,
    failedEntries,
    total,
    processed,
  };
}

function normalizeAttendanceCacheEntry(entry: AttendanceCacheEntryInput): AttendanceCacheEntry {
  return {
    room: String(entry.room ?? '').trim(),
    series: String(entry.series ?? '').trim() || String(entry.room ?? '').trim(),
    className: String(entry.className ?? '').trim() || (String(entry.room ?? '').trim().split(/\s+/).at(-1) ?? ''),
    month: normalizeAttendanceMonth(entry.month),
    day: String(entry.day ?? '').trim(),
    savedAt: Number(entry.savedAt ?? Date.now()),
    students: Array.isArray(entry.students) ? entry.students.map(student => ({
      name: String(student?.name ?? '').trim(),
      registration: String(student?.registration ?? '').trim(),
      status: student?.status === 'P' || student?.status === 'FNJ' || student?.status === 'FJ' ? student.status : null,
    })).filter(student => student.name || student.registration) : [],
  };
}

function replaceDuplicateAttendanceEntry(currentEntries: AttendanceCacheEntry[], normalizedEntry: AttendanceCacheEntry): AttendanceCacheEntry[] {
  const duplicateIndex = currentEntries.findIndex(existing =>
    existing.room === normalizedEntry.room &&
    existing.month === normalizedEntry.month &&
    existing.day === normalizedEntry.day &&
    Number(existing.savedAt) !== Number(normalizedEntry.savedAt)
  );

  if (duplicateIndex === -1) {
    return [...currentEntries, normalizedEntry];
  }

  return currentEntries.map((existing, index) => (index === duplicateIndex ? normalizedEntry : existing));
}

export function saveAttendanceCacheEntry(entry: AttendanceCacheEntryInput): AttendanceCacheEntry[] {
  const currentEntries = getAttendanceCache();
  const normalizedEntry = normalizeAttendanceCacheEntry(entry);
  const nextEntries = replaceDuplicateAttendanceEntry(currentEntries, normalizedEntry);

  try {
    localStorageStore.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(nextEntries));
  } catch {}

  return nextEntries;
}

export function updateAttendanceCacheEntry(entry: AttendanceCacheEntryInput): AttendanceCacheEntry[] {
  const currentEntries = getAttendanceCache();
  const normalizedEntry = normalizeAttendanceCacheEntry(entry);
  const deduplicatedEntries = currentEntries.filter(existing => existing.savedAt !== normalizedEntry.savedAt);
  const nextEntries = replaceDuplicateAttendanceEntry(deduplicatedEntries, normalizedEntry);

  try {
    localStorageStore.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(nextEntries));
  } catch {}

  return nextEntries;
}

export function getAttendanceCache(): AttendanceCacheEntry[] {
  try {
    const raw = localStorageStore.getItem(ATTENDANCE_CACHE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorageStore.removeItem(ATTENDANCE_CACHE_KEY);
      return [];
    }

    const normalizedEntries: AttendanceCacheEntry[] = parsed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object'))
      .map((entry) => {
        const candidate = entry as Partial<AttendanceCacheEntry>;
        const room = typeof candidate.room === 'string' ? candidate.room.trim() : '';
        const month = normalizeAttendanceMonth(typeof candidate.month === 'string' ? candidate.month : String(candidate.month ?? ''));
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
      .filter((entry): entry is AttendanceCacheEntry => entry !== null);

    if (normalizedEntries.length !== parsed.length) {
      try {
        localStorageStore.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(normalizedEntries));
      } catch {}
    }

    return normalizedEntries;
  } catch {
    try {
      localStorageStore.removeItem(ATTENDANCE_CACHE_KEY);
    } catch {}
    return [];
  }
}

export function removeAttendanceCacheEntry(savedAt: number): AttendanceCacheEntry[] {
  const currentEntries = getAttendanceCache();
  const nextEntries = currentEntries.filter(entry => Number(entry.savedAt) !== Number(savedAt));

  try {
    localStorageStore.setItem(ATTENDANCE_CACHE_KEY, JSON.stringify(nextEntries));
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
    const raw = localStorageStore.getItem(TBDA_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as TbdaCachePayload).data)) {
      const cachePayload = parsed as TbdaCachePayload;
      if (cachePayload.version !== TBDA_CACHE_VERSION) {
        localStorageStore.removeItem(TBDA_CACHE_KEY);
        return null;
      }

      const cacheAge = Date.now() - Number(cachePayload.timestamp || 0);
      if (cacheAge > TBDA_CACHE_TTL_MS) {
        localStorageStore.removeItem(TBDA_CACHE_KEY);
        return null;
      }

      const hasMetadata = cachePayload.data.every(row =>
        TBDA_METADATA_COLUMNS.every(column => Object.prototype.hasOwnProperty.call(row, column)),
      );
      if (!hasMetadata) {
        localStorageStore.removeItem(TBDA_CACHE_KEY);
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
      storage: sessionStorageStore,
    },
  }
);
