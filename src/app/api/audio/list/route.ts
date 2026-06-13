import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase-client";
import { getAuthUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 获取用户上传的音频文件列表
export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "服务器配置错误" }, { status: 500 });
    }

    // 列出用户文件夹中的所有文件
    const folderPath = `${user.id}/`;
    const { data: files, error } = await supabase.storage
      .from("audios")
      .list(folderPath, {
        sortBy: { column: "created_at", order: "desc" },
      });

    if (error) {
      console.error("[Audio List] 列出文件失败:", error);
      return NextResponse.json({ error: "获取文件列表失败" }, { status: 500 });
    }

    // 转换为前端需要的格式
    const audios = (files || [])
      .filter(f => f.id && f.name) // 过滤文件夹和无效文件
      .map(f => ({
        name: f.name,
        size: f.metadata?.size || 0,
        created_at: f.created_at,
        file_key: `audios/${user.id}/${f.name}`,
      }));

    return NextResponse.json({ success: true, audios });
  } catch (err) {
    console.error("[Audio List] 异常:", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
