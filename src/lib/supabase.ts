// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

const url =
  import.meta.env.SUPABASE_URL ||
  import.meta.env.PUBLIC_SUPABASE_URL;

const key =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Supabase URL:', url);
console.log('URLあり:', !!url);
console.log('キーあり:', !!key);

export const supabase =
  url && key ? createClient(url, key) : null;

export function getSupabase() {
  return supabase;
}