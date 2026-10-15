// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// 環境変数からのみ取得する（直書きしないのでGitHubに怒られません）
const url = import.meta.env.PUBLIC_SUPABASE_URL || import.meta.env.SUPABASE_URL || 'https://dpirhczosxernkvgwxqc.supabase.co';
const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_S1mIwWP8TlShb-JK4RR-zg_szbfsPr2';

export const supabase = createClient(url, key);

export function getSupabase() {
  return supabase;
}
