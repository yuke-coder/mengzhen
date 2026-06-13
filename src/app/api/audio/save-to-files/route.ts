import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase-client";
import { getAuthUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
    }

    const body = await request.json();
    const { fileKey, name, size, mime_type } = body;

    if (!fileKey || !name) {
      return NextResponse.json({ success: false, error: "缺少必要参数" }, { status: 400 });
    }

    const pathParts = fileKey.split("/");
    const pathUserId = pathParts.length >= 2 ? pathParts[1] : null;

    if (!pathUserId || pathUserId !== user.id) {
      return NextResponse.json({ success: false, error: "无权操作此文件" }, { status: 403 });
    }

    const supabase = getSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: "服务器配置错误" }, { status: 500 });
    }

    const { data: bucketData } = await supabase.storage.getBucket("audios");
    const bucketId = bucketData?.id || "00000000-0000-0000-0000-000000000000";

    const { error } = await supabase.from("audio_files").insert({
      user_id: user.id,
      bucket_id: bucketId,
      path: fileKey,
      name,
      size: size || 0,
      mime_type: mime_type || "audio/mpeg",
    });

    if (error) {
      console.error("[save-to-files] 插入失败:", error);
      if (error.code === "23505") {
        return NextResponse.json({ success: true, message: "已存在" });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[save-to-files] 异常:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "服务器错误" },
      { status: 500 }
    );
  }
}
