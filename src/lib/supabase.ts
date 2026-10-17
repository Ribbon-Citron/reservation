// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

// 従来の `import { supabase } from ...` を使っているファイル用
const defaultUrl = env?.SUPABASE_URL || import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
const defaultKey = env?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!defaultUrl || !defaultKey) {
  console.warn('Supabase URL or Key is missing in default initialization.');
}

export const supabase = createClient(defaultUrl || '', defaultKey || '');

// 動的にランタイム環境を受け取ってクライアントを生成したい場合用
export function getSupabase(runtimeEnv?: any) {
  const supabaseUrl = env?.SUPABASE_URL || runtimeEnv?.SUPABASE_URL || import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = env?.SUPABASE_SERVICE_ROLE_KEY || runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is missing in environment variables.');
  }

  return createClient(supabaseUrl, supabaseKey);
}