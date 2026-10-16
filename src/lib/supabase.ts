// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase =
  url && key ? createClient(url, key) : null;

export function getSupabase() {
  return supabase;
}
