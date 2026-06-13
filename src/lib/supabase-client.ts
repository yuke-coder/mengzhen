import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

/**
 * 获取 Supabase 客户端实例（单例模式）
 * 必须设置环境变量 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
 */
export function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn("[Supabase] 缺少环境变量: SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
    console.warn("[Supabase] 当前 NODE_ENV:", process.env.NODE_ENV);
    console.warn("[Supabase] 已配置的 env 键:", Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('DATABASE') || k.includes('NEXT_PUBLIC_SUPABASE')).join(', '));
    return null;
  }

  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    } catch (error) {
      console.error("[Supabase] 初始化失败:", error);
      return null;
    }
  }

  return supabaseInstance;
}

/**
 * 检查 Supabase 是否已正确配置
 */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
