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
const TBDA_SELECT = TBDA_COLUMNS.map((column) => `"${column}"`).join(',');

type TbdaCachePayload = {
  timestamp: number;
  data: Record<string, unknown>[];
};

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
  const payload: TbdaCachePayload = {
    timestamp: Date.now(),
    data: rows,
  };

  localStorage.setItem(TBDA_CACHE_KEY, JSON.stringify(payload));
  return rows;
}

export function getTbdaCache(): Record<string, unknown>[] | null {
  try {
    const raw = localStorage.getItem(TBDA_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as Record<string, unknown>[];
    }

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).data)) {
      return (parsed as any).data as Record<string, unknown>[];
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
