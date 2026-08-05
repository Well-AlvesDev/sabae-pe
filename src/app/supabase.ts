import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yoejlumglxbzxtzknsuy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlvZWpsdW1nbHhienh0emtuc3V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2OTkyMTYsImV4cCI6MjA4NzI3NTIxNn0.5fhGV2K4G-yzzA84vwISSZLk-KWhnRoowFbhnVTNz7Q';

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
