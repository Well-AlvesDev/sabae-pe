import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://caslrvzsrxguqgzvhyug.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhc2xydnpzcnhndXFnenZoeXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzczMzIsImV4cCI6MjEwMTU1MzMzMn0.V2-hIDweOcRBX7iYIaGqcCIgvC0LPL-z82Fn6iRLWlo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
  },
});

export const supabaseWithSessionStorage = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: sessionStorage,
    },
  }
);
