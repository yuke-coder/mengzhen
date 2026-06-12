import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "服务器配置错误" }, { status: 500 });

  const { data, error } = await supabase
    .from("audios")
    .select("id, title, file_url, file_key, file_name, file_size, duration, mime_type, created_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Audio MyList] 查询失败:", error);
    return NextResponse.json({ error: "获取历史记录失败" }, { status: 500 });
  }

  return NextResponse.json({ success: true, audios: data || [] });
}
