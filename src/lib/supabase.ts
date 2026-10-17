// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// デフォルトのインスタンス（ビルド時・ローカル用）
const defaultUrl = import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || '';
const defaultKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(defaultUrl, defaultKey);

// 動的に環境変数を受け取る関数
export function getSupabase(runtimeEnv?: any) {
  const supabaseUrl = runtimeEnv?.SUPABASE_URL || import.meta.env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL or Key is missing in environment variables.');
  }

  return createClient(supabaseUrl, supabaseKey);
}