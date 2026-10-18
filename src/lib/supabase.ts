// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

// Cloudflareの実行時環境変数を優先し、
// ローカル開発では import.meta.env も利用する
const url =
  env.SUPABASE_URL || import.meta.env.SUPABASE_URL;

const key =
  env.SUPABASE_SERVICE_ROLE_KEY ||
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase =
  url && key ? createClient(url, key) : null;

export function getSupabase() {
  return supabase;
}
