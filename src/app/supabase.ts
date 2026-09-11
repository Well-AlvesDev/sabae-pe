import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yoejlumglxbzxtzknsuy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvZWpsdW1nbHhienh0emtuc3V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2OTkyMTYsImV4cCI6MjA4NzI3NTIxNn0.5fhGV2K4G-yzzA84vwISSZLk-KWhnRoowFbhnVTNz7Q';

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

export const ACCESS_MODULES = [
  { label: 'ESCOLA DOM BOSCO', table: 'TBDA' },
  { label: 'ESCOLA LUIZ IGNACIO', table: 'USINA' },
] as const;

export type AccessModule = typeof ACCESS_MODULES[number];

const ACTIVE_TABLE_KEY = 'sabae.active-table';

export function setActiveTable(tableName: string): void {
  const module = ACCESS_MODULES.find(item => item.table === tableName);
  if (!module) {
    throw new Error('Módulo de acesso inválido.');
  }

  localStorageStore.setItem(ACTIVE_TABLE_KEY, module.table);
}

export function getActiveTable(): string {
  const storedTable = localStorageStore.getItem(ACTIVE_TABLE_KEY);
  return ACCESS_MODULES.find(item => item.table === storedTable)?.table
    ?? ACCESS_MODULES[0].table;
}

export function getActiveModuleLabel(): string {
  const activeTable = getActiveTable();
  return ACCESS_MODULES.find(item => item.table === activeTable)?.label
    ?? ACCESS_MODULES[0].label;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorageStore,
  },
});

const TBDA_COLUMNS = Array.from({ length: 31 }, (_, i) => `${i + 1}`);
const TBDA_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const TBDA_CACHE_VERSION = 4;
const TBDA_METADATA_COLUMNS = ['MAT', 'NOME', 'TURMA', 'TURNO', 'STATUS'];
function getAttendanceCacheKey(): string {
  return `sabae.attendance.cache.${getActiveTable()}`;
}
const TBDA_SELECT = [
  ...TBDA_METADATA_COLUMNS.map((column) => `"${column}"`),
  ...TBDA_COLUMNS.map((column) => `"${column}"`),
].join(',');
const tbdaCacheSyncPromises = new Map<string, Promise<Record<string, unknown>[]>>();

function getTbdaCacheKey(): string {
  return `sabae.tbda.cache.${getActiveTable()}`;
}

function getTbdaLastSearchKey(): string {
  return `sabae.tbda.last-search.${getActiveTable()}`;
}

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
    localStorageStore.setItem(getTbdaLastSearchKey(), formatted);
  } catch {}
  return formatted;
}

export function getTbdaLastSearchLabel(): string {
  try {
    return localStorageStore.getItem(getTbdaLastSearchKey()) || '';
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
    .from(getActiveTable())
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
    localStorageStore.setItem(getTbdaCacheKey(), JSON.stringify(payload));
  } catch {}
  setTbdaLastSearchLabel(requestedAt);
  return rows;
}

export async function ensureTbdaCache(useSessionStorage = false): Promise<Record<string, unknown>[]> {
  const cachedRows = getTbdaCache();
  if (cachedRows !== null) {
    return cachedRows;
  }

  const tableName = getActiveTable();
  const cachedSyncPromise = tbdaCacheSyncPromises.get(tableName);
  if (cachedSyncPromise) {
    return cachedSyncPromise;
  }

  const syncPromise = syncTbdaCache(useSessionStorage).finally(() => {
    tbdaCacheSyncPromises.delete(tableName);
  });
  tbdaCacheSyncPromises.set(tableName, syncPromise);
  return syncPromise;
}

export type AttendanceCacheStatus = 'P' | 'FNJ' | 'FJ' | 'Transferido' | 'Matriculado';

export type AttendanceCacheStudent = {
  name: string;
  registration: string;
  room?: string;
  shift?: string;
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

  const monthTokenPattern = new RegExp(`^(?:P|FNJ|FJ):${normalizedMonth}$`);
  const withoutCurrentMonth = values.filter(value => !monthTokenPattern.test(value));

  return [...withoutCurrentMonth, token].join(',');
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

export type SentAttendanceReference = Pick<AttendanceCacheEntry, 'room' | 'month' | 'day'>;

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
    .filter(student => (student.status === 'P' || student.status === 'FNJ' || student.status === 'FJ') && student.registration)
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
): Promise<{ success: number; failed: number; errors: string[]; sentEntries: string[]; sentAttendances: SentAttendanceReference[]; failedEntries: string[]; total: number; processed: number }> {
  const cacheEntries = getAttendanceCache();
  const total = cacheEntries.length;

  if (total === 0) {
    return { success: 0, failed: 0, errors: [], sentEntries: [], sentAttendances: [], failedEntries: [], total: 0, processed: 0 };
  }

  let processed = 0;
  let success = 0;
  let failed = 0;
  const errors: string[] = [];
  const sentEntries: string[] = [];
  const sentAttendances: SentAttendanceReference[] = [];
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
      table_name: getActiveTable(),
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
      sentAttendances.push({ room: entry.room, month: entry.month, day: entry.day });
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
    sentAttendances,
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
    students: Array.isArray(entry.students) ? entry.students.map(student => {
      const shift = String(student?.shift ?? '').trim();
      return {
        name: String(student?.name ?? '').trim(),
        registration: String(student?.registration ?? '').trim(),
        room: String(student?.room ?? entry.room ?? '').trim(),
        ...(shift ? { shift } : {}),
        status: student?.status === 'P' || student?.status === 'FNJ' || student?.status === 'FJ'
          || student?.status === 'Transferido' || student?.status === 'Matriculado' ? student.status : null,
      };
    }).filter(student => student.name || student.registration) : [],
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
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(nextEntries));
  } catch {}

  return nextEntries;
}

export function updateAttendanceCacheEntry(entry: AttendanceCacheEntryInput): AttendanceCacheEntry[] {
  const currentEntries = getAttendanceCache();
  const normalizedEntry = normalizeAttendanceCacheEntry(entry);
  const deduplicatedEntries = currentEntries.filter(existing => existing.savedAt !== normalizedEntry.savedAt);
  const nextEntries = replaceDuplicateAttendanceEntry(deduplicatedEntries, normalizedEntry);

  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(nextEntries));
  } catch {}

  return nextEntries;
}

export function addStudentAsPresentToAttendanceCache(
  input: NewStudentInput,
  refreshedRows: Record<string, unknown>[] = [],
): AttendanceCacheEntry[] {
  const classroom = String(input.classroom ?? '').trim();
  const registration = String(input.registration ?? '').trim();
  const name = String(input.name ?? '').trim();
  const shift = String(input.shift ?? '').trim();
  const currentEntries = getAttendanceCache();
  const refreshedStudent = refreshedRows.find(row => matchesStudent(row, registration, name));
  const nextEntries = currentEntries.map(entry => {
    if (entry.room !== classroom) {
      return entry;
    }

    const hasStudent = entry.students.some(student =>
      (registration && student.registration === registration) || (!registration && student.name === name),
    );
    if (hasStudent) {
      return entry;
    }

    return {
      ...entry,
      students: [
        ...entry.students,
        {
          name: String(refreshedStudent?.['NOME'] ?? name).trim(),
          registration: String(refreshedStudent?.['MAT'] ?? registration).trim(),
          room: String(refreshedStudent?.['TURMA'] ?? classroom).trim(),
          shift: String(refreshedStudent?.['TURNO'] ?? shift).trim(),
          status: 'P' as const,
        },
      ],
    };
  });

  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(nextEntries));
  } catch {}

  return nextEntries;
}

export function getAttendanceCache(): AttendanceCacheEntry[] {
  try {
    const raw = localStorageStore.getItem(getAttendanceCacheKey());
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorageStore.removeItem(getAttendanceCacheKey());
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
          students: students.map((student): AttendanceCacheStudent => {
            const shift = String(student?.shift ?? '').trim();
            return {
              name: String(student?.name ?? '').trim(),
              registration: String(student?.registration ?? '').trim(),
              room: String(student?.room ?? room).trim(),
              ...(shift ? { shift } : {}),
              status: student?.status === 'P' || student?.status === 'FNJ' || student?.status === 'FJ'
                || student?.status === 'Transferido' || student?.status === 'Matriculado' ? student.status : null,
            };
          }),
        } satisfies AttendanceCacheEntry;
      })
      .filter((entry): entry is AttendanceCacheEntry => entry !== null);

    if (normalizedEntries.length !== parsed.length) {
      try {
        localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(normalizedEntries));
      } catch {}
    }

    return normalizedEntries;
  } catch {
    try {
      localStorageStore.removeItem(getAttendanceCacheKey());
    } catch {}
    return [];
  }
}

export function removeAttendanceCacheEntry(savedAt: number): AttendanceCacheEntry[] {
  const currentEntries = getAttendanceCache();
  const nextEntries = currentEntries.filter(entry => Number(entry.savedAt) !== Number(savedAt));

  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(nextEntries));
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

export function getTbdaShifts(rows: Record<string, unknown>[] | null = getTbdaCache()): string[] {
  if (!rows) {
    return [];
  }

  return Array.from(
    new Set(
      rows
        .map(row => String(row['TURNO'] ?? row['turno'] ?? '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function getTbdaCache(): Record<string, unknown>[] | null {
  try {
    const raw = localStorageStore.getItem(getTbdaCacheKey());
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as TbdaCachePayload).data)) {
      const cachePayload = parsed as TbdaCachePayload;
      if (cachePayload.version !== TBDA_CACHE_VERSION) {
        localStorageStore.removeItem(getTbdaCacheKey());
        return null;
      }

      const cacheAge = Date.now() - Number(cachePayload.timestamp || 0);
      if (cacheAge > TBDA_CACHE_TTL_MS) {
        localStorageStore.removeItem(getTbdaCacheKey());
        return null;
      }

      const hasMetadata = cachePayload.data.every(row =>
        TBDA_METADATA_COLUMNS.every(column => Object.prototype.hasOwnProperty.call(row, column)),
      );
      if (!hasMetadata) {
        localStorageStore.removeItem(getTbdaCacheKey());
        return null;
      }

      return cachePayload.data;
    }

    return null;
  } catch {
    return null;
  }
}

export function clearTbdaCache(): void {
  try {
    localStorageStore.removeItem(getTbdaCacheKey());
  } catch {}
}

export type StudentAdministrativeStatus = 'Transferido' | 'Matriculado';

export type NewStudentInput = {
  name: string;
  registration: string;
  classroom: string;
  shift: string;
};

export async function insertStudent(input: NewStudentInput): Promise<void> {
  const name = String(input.name ?? '').trim();
  const registration = String(input.registration ?? '').trim();
  const classroom = String(input.classroom ?? '').trim();
  const shift = String(input.shift ?? '').trim();

  if (!name || !registration || !classroom || !shift) {
    throw new Error('Preencha nome, matrícula, turma e turno para inserir o aluno.');
  }

  const result = await supabase
    .from(getActiveTable())
    .insert({ MAT: registration, NOME: name, TURMA: classroom, TURNO: shift, STATUS: 'Matriculado' })
    .select(TBDA_SELECT)
    .single();

  if (result.error) {
    throw result.error;
  }

  const attendanceBackfill = await supabase.rpc('backfill_student_attendance', {
    p_mat: registration,
    p_turma: classroom,
    p_table_name: getActiveTable(),
  });
  if (attendanceBackfill.error) {
    throw attendanceBackfill.error;
  }

  const refreshedRows = await syncTbdaCache();
  addStudentAsPresentToAttendanceCache({ name, registration, classroom, shift }, refreshedRows);
  refreshAttendanceCacheFromTbda(refreshedRows);
}

function refreshAttendanceCacheFromTbda(rows: Record<string, unknown>[]): void {
  const attendanceEntries = getAttendanceCache();
  const updatedEntries = attendanceEntries.map(entry => ({
    ...entry,
    students: entry.students.map(student => {
      const refreshedStudent = rows.find(row => matchesStudent(row, student.registration, student.name));
      if (!refreshedStudent) {
        return student;
      }

      return {
        ...student,
        name: String(refreshedStudent['NOME'] ?? refreshedStudent['nome'] ?? student.name).trim(),
        room: String(refreshedStudent['TURMA'] ?? refreshedStudent['turma'] ?? student.room ?? '').trim(),
        shift: String(refreshedStudent['TURNO'] ?? refreshedStudent['turno'] ?? student.shift ?? '').trim() || student.shift,
      };
    }),
  }));

  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(updatedEntries));
  } catch {}
}

export async function updateStudentStatus(
  registration: string,
  name: string,
  status: StudentAdministrativeStatus,
): Promise<void> {
  const normalizedRegistration = String(registration ?? '').trim();
  const normalizedName = String(name ?? '').trim();
  if (!normalizedRegistration && !normalizedName) {
    throw new Error('Aluno sem matrícula ou nome para atualização.');
  }

  const [{ data: localSessionData }, { data: sessionSessionData }] = await Promise.all([
    supabase.auth.getSession(),
    supabaseWithSessionStorage.auth.getSession(),
  ]);
  const useSessionStorage = !!sessionSessionData?.session && !localSessionData?.session;
  const client = useSessionStorage ? supabaseWithSessionStorage : supabase;

  let query = client.from(getActiveTable()).update({ STATUS: status });
  const result = normalizedRegistration
    ? await query.eq('MAT', normalizedRegistration)
    : await query.eq('NOME', normalizedName);

  if (result.error) {
    throw result.error;
  }

  // Recarrega do Supabase para confirmar o update e renovar o cache persistido.
  const refreshedRows = await syncTbdaCache(useSessionStorage);
  const updatedStudent = refreshedRows.find(row => matchesStudent(row, normalizedRegistration, normalizedName));
  if (!updatedStudent || String(updatedStudent['STATUS'] ?? '').trim() !== status) {
    throw new Error('O status não foi confirmado na atualização do Supabase.');
  }

  const attendanceEntries = getAttendanceCache();
  const updatedEntries = attendanceEntries.map(entry => ({
    ...entry,
    students: entry.students.map(student =>
      matchesStudent(student, normalizedRegistration, normalizedName)
        ? {
            ...student,
            name: String(updatedStudent['NOME'] ?? updatedStudent['nome'] ?? student.name).trim(),
            room: String(updatedStudent['TURMA'] ?? updatedStudent['turma'] ?? student.room ?? '').trim(),
            shift: String(updatedStudent['TURNO'] ?? updatedStudent['turno'] ?? student.shift ?? '').trim() || student.shift,
            status: status === 'Matriculado' ? 'P' : status,
          }
        : student,
    ),
  }));
  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(updatedEntries));
  } catch {}
}

export async function updateStudentClassroom(
  registration: string,
  name: string,
  classroom: string,
): Promise<void> {
  const normalizedRegistration = String(registration ?? '').trim();
  const normalizedName = String(name ?? '').trim();
  const normalizedClassroom = String(classroom ?? '').trim();
  if ((!normalizedRegistration && !normalizedName) || !normalizedClassroom) {
    throw new Error('Dados insuficientes para atualizar a turma.');
  }

  const tbdaRows = getTbdaCache();
  const attendanceEntries = getAttendanceCache();
  const matchingRows = tbdaRows?.filter(row => matchesStudent(row, normalizedRegistration, normalizedName)) ?? [];
  const studentRow = matchingRows[0];

  const [{ data: localSessionData }, { data: sessionSessionData }] = await Promise.all([
    supabase.auth.getSession(),
    supabaseWithSessionStorage.auth.getSession(),
  ]);
  const useSessionStorage = !!sessionSessionData?.session && !localSessionData?.session;
  const client = useSessionStorage ? supabaseWithSessionStorage : supabase;

  let query = client.from(getActiveTable()).update({ TURMA: normalizedClassroom });
  const result = normalizedRegistration
    ? await query.eq('MAT', normalizedRegistration)
    : await query.eq('NOME', normalizedName);

  if (result.error) {
    throw result.error;
  }

  const refreshedResult = normalizedRegistration
    ? await client.from(getActiveTable()).select(TBDA_SELECT).eq('MAT', normalizedRegistration).maybeSingle()
    : await client.from(getActiveTable()).select(TBDA_SELECT).eq('NOME', normalizedName).maybeSingle();

  if (refreshedResult.error) {
    throw refreshedResult.error;
  }

  const refreshedStudent = refreshedResult.data as unknown as Record<string, unknown> | null;
  if (!refreshedStudent || String(refreshedStudent['TURMA'] ?? '').trim() !== normalizedClassroom) {
    throw new Error('A alteração foi confirmada, mas a nova turma não foi retornada pelo Supabase.');
  }

  const cachedRows = getTbdaCache() ?? await syncTbdaCache(useSessionStorage);
  const cachedStudentFound = cachedRows.some(row => matchesStudent(row, normalizedRegistration, normalizedName));
  const updatedRows = cachedRows.map(row => matchesStudent(row, normalizedRegistration, normalizedName)
    ? { ...row, ...refreshedStudent, TURMA: normalizedClassroom }
    : row);
  if (!cachedStudentFound) {
    updatedRows.push({ ...refreshedStudent, TURMA: normalizedClassroom });
  }
  saveTbdaCache(updatedRows);

  const oldClassroom = String(studentRow?.['TURMA'] ?? studentRow?.['turma'] ?? '').trim();
  const studentMatches = (student: AttendanceCacheStudent): boolean =>
    matchesStudent(student, normalizedRegistration, normalizedName);
  const previousAttendanceByDate = new Map<string, AttendanceCacheStudent['status']>();
  attendanceEntries.forEach(entry => {
    const existingStudent = entry.students.find(studentMatches);
    if (existingStudent?.status) {
      previousAttendanceByDate.set(`${entry.month}:${entry.day}`, existingStudent.status);
    }
  });
  const buildUpdatedStudent = (entry: AttendanceCacheEntry, currentStudent?: AttendanceCacheStudent): AttendanceCacheStudent => {
    const attendanceStatus = previousAttendanceByDate.get(`${entry.month}:${entry.day}`);
    const isTransferred = String(refreshedStudent['STATUS'] ?? refreshedStudent['status'] ?? '')
      .trim()
      .toLocaleLowerCase('pt-BR') === 'transferido';
    return {
      name: String(refreshedStudent['NOME'] ?? refreshedStudent['nome'] ?? currentStudent?.name ?? normalizedName).trim(),
      registration: String(refreshedStudent['MAT'] ?? refreshedStudent['mat'] ?? currentStudent?.registration ?? normalizedRegistration).trim(),
      room: normalizedClassroom,
      shift: String(refreshedStudent['TURNO'] ?? refreshedStudent['turno'] ?? currentStudent?.shift ?? '').trim(),
      status: attendanceStatus ?? currentStudent?.status ?? (isTransferred ? null : 'P'),
    };
  };

  const updatedEntries = attendanceEntries
    .map(entry => {
      const studentIndex = entry.students.findIndex(studentMatches);
      const isNewClassroomEntry = entry.room === normalizedClassroom;
      const isOldClassroomEntry = entry.room === oldClassroom || (!oldClassroom && studentIndex !== -1);

      if (isOldClassroomEntry && !isNewClassroomEntry) {
        return {
          ...entry,
          students: entry.students.filter(student => !studentMatches(student)),
        };
      }

      if (!isNewClassroomEntry) {
        return entry;
      }

      const students = studentIndex === -1
        ? [...entry.students, buildUpdatedStudent(entry)]
        : entry.students.map((student, index) => index === studentIndex
          ? buildUpdatedStudent(entry, student)
          : student);
      return { ...entry, students };
    })
    .filter(entry => entry.students.length > 0);

  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(updatedEntries));
  } catch {}
}

type ClassroomAttendanceCell = {
  day: string;
  month: number;
};

function getClassroomAttendanceCells(
  rows: Record<string, unknown>[],
  entries: AttendanceCacheEntry[],
  classroom: string,
): ClassroomAttendanceCell[] {
  const cells = new Map<string, ClassroomAttendanceCell>();

  rows
    .filter(row => String(row['TURMA'] ?? row['turma'] ?? '').trim() === classroom)
    .forEach(row => {
      for (const day of TBDA_COLUMNS) {
        const value = String(row[day] ?? '').trim();
        for (const match of value.matchAll(/(?:P|FNJ|FJ):(\d{1,2})/g)) {
          const month = Number(match[1]);
          if (month >= 1 && month <= 12) {
            cells.set(`${day}:${month}`, { day, month });
          }
        }
      }
    });

  entries
    .filter(entry => entry.room === classroom)
    .forEach(entry => {
      const month = Number.parseInt(normalizeAttendanceMonth(entry.month), 10);
      const day = String(entry.day ?? '').trim();
      if (day && month >= 1 && month <= 12) {
        cells.set(`${day}:${month}`, { day, month });
      }
    });

  return Array.from(cells.values());
}

function hasAttendanceForMonth(value: unknown, month: number): boolean {
  return getAttendanceStatusForMonth(value, month) !== null;
}

function getAttendanceStatusForMonth(value: unknown, month: number): 'P' | 'FNJ' | 'FJ' | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const monthPattern = String(month).padStart(2, '0');
  const match = String(value ?? '')
    .split(',')
    .map(token => token.trim().match(/^(P|FNJ|FJ):0?(\d{1,2})$/))
    .find(candidate => candidate?.[2] === String(month) || candidate?.[2] === monthPattern);

  return (match?.[1] as 'P' | 'FNJ' | 'FJ' | undefined) ?? null;
}

export async function updateStudentShift(
  registration: string,
  name: string,
  shift: string,
): Promise<void> {
  const normalizedRegistration = String(registration ?? '').trim();
  const normalizedName = String(name ?? '').trim();
  const normalizedShift = String(shift ?? '').trim();
  if ((!normalizedRegistration && !normalizedName) || !normalizedShift) {
    throw new Error('Dados insuficientes para atualizar o turno.');
  }

  let query = supabase.from(getActiveTable()).update({ TURNO: normalizedShift });
  const result = normalizedRegistration
    ? await query.eq('MAT', normalizedRegistration)
    : await query.eq('NOME', normalizedName);

  if (result.error) {
    throw result.error;
  }

  const tbdaRows = getTbdaCache();
  if (tbdaRows) {
    const matchingRows = tbdaRows.filter(row => matchesStudent(row, normalizedRegistration, normalizedName));
    matchingRows.forEach(row => { row['TURNO'] = normalizedShift; });
    if (matchingRows.length) {
      saveTbdaCache(tbdaRows);
    }
  }

  const attendanceEntries = getAttendanceCache();
  const updatedEntries = attendanceEntries.map(entry => ({
    ...entry,
    students: entry.students.map(student =>
      matchesStudent(student, normalizedRegistration, normalizedName)
        ? { ...student, shift: normalizedShift }
        : student,
    ),
  }));
  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(updatedEntries));
  } catch {}
}

export async function updateStudentName(
  registration: string,
  currentName: string,
  newName: string,
): Promise<void> {
  const normalizedRegistration = String(registration ?? '').trim();
  const normalizedCurrentName = String(currentName ?? '').trim();
  const normalizedNewName = String(newName ?? '').trim();
  if ((!normalizedRegistration && !normalizedCurrentName) || !normalizedNewName) {
    throw new Error('Dados insuficientes para atualizar o nome.');
  }

  let query = supabase.from(getActiveTable()).update({ NOME: normalizedNewName });
  const result = normalizedRegistration
    ? await query.eq('MAT', normalizedRegistration)
    : await query.eq('NOME', normalizedCurrentName);

  if (result.error) {
    throw result.error;
  }

  const tbdaRows = getTbdaCache();
  if (tbdaRows) {
    const matchingRows = tbdaRows.filter(row => matchesStudent(row, normalizedRegistration, normalizedCurrentName));
    matchingRows.forEach(row => { row['NOME'] = normalizedNewName; });
    if (matchingRows.length) {
      saveTbdaCache(tbdaRows);
    }
  }

  const attendanceEntries = getAttendanceCache();
  const updatedEntries = attendanceEntries.map(entry => ({
    ...entry,
    students: entry.students.map(student =>
      matchesStudent(student, normalizedRegistration, normalizedCurrentName)
        ? { ...student, name: normalizedNewName }
        : student,
    ),
  }));
  try {
    localStorageStore.setItem(getAttendanceCacheKey(), JSON.stringify(updatedEntries));
  } catch {}
}

function matchesStudent(row: Record<string, unknown>, registration: string, name: string): boolean {
  const rowRegistration = String(row['MAT'] ?? row['MATRICULA'] ?? row['MATRÍCULA'] ?? row['registration'] ?? '').trim();
  const rowName = String(row['NOME'] ?? row['name'] ?? '').trim();
  if (registration && rowRegistration && rowRegistration === registration) {
    return true;
  }

  return Boolean(name) && normalizeStudentName(rowName) === normalizeStudentName(name);
}

function normalizeStudentName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

function saveTbdaCache(rows: Record<string, unknown>[]): void {
  const payload: TbdaCachePayload = {
    version: TBDA_CACHE_VERSION,
    timestamp: Date.now(),
    data: rows,
  };
  try {
    localStorageStore.setItem(getTbdaCacheKey(), JSON.stringify(payload));
  } catch {}
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
