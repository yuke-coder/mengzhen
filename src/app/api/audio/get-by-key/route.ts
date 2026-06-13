import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase-client";
import { getAuthUser } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "服务器配置错误" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const fileKey = searchParams.get("fileKey");
  if (!fileKey) return NextResponse.json({ error: "缺少 fileKey" }, { status: 400 });

  // 先查 audio_files 表
  const { data: fileData, error: fileError } = await supabase
    .from("audio_files")
    .select("id, user_id, path, name, size, mime_type, metadata, created_at")
    .eq("user_id", user.id)
    .eq("path", fileKey)
    .maybeSingle();

  if (fileData && !fileError) {
    const { data: urlData } = supabase.storage.from("audios").getPublicUrl(fileKey);
    return NextResponse.json({
      success: true,
      audio: {
        id: fileData.id,
        name: fileData.name,
        path: fileData.path,
        size: fileData.size,
        mime_type: fileData.mime_type,
        metadata: fileData.metadata,
        created_at: fileData.created_at,
        serverUrl: urlData?.publicUrl || `/api/audio/proxy?key=${encodeURIComponent(fileKey)}`,
      }
    });
  }

  // 回退查 audios 表（save_to_files=false 时记录在此）
  const { data: audioData, error: audioError } = await supabase
    .from("audios")
    .select("id, title, file_key, file_name, file_size, mime_type, duration, created_at")
    .eq("user_id", user.id)
    .eq("file_key", fileKey)
    .maybeSingle();

  if (audioError || !audioData) {
    return NextResponse.json({ error: "音频不存在" }, { status: 404 });
  }

  const { data: urlData } = supabase.storage.from("audios").getPublicUrl(fileKey);

  return NextResponse.json({
    success: true,
    audio: {
      id: audioData.id,
      name: audioData.file_name || audioData.title,
      path: audioData.file_key,
      size: audioData.file_size,
      mime_type: audioData.mime_type,
      metadata: { duration: audioData.duration },
      created_at: audioData.created_at,
      serverUrl: urlData?.publicUrl || `/api/audio/proxy?key=${encodeURIComponent(fileKey)}`,
    }
  });
}
