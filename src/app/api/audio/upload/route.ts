import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const SESSION_COOKIE_NAME = "mindmap_session";

// 音频文件大小限制 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// 允许的音频类型
const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp3",
  "audio/x-m4a",
  "audio/flac",
  "audio/aac",
];

// 允许的扩展名（用于 fallback 校验）
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];

async function getUserIdFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return null;
    }

    const client = getSupabaseClient();
    if (!client) {
      return null;
    }

    const { data: session, error } = await client
      .from("sessions")
      .select("user_id, expires_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (error || !session) {
      return null;
    }

    // 手动检查 session 是否过期
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return null;
    }

    return session.user_id;
  } catch (error) {
    console.error("[Audio Upload] 获取用户ID失败:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 鉴权：获取当前用户
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    // 解析 FormData
    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    const saveToFiles = new URL(request.url).searchParams.get("save_to_files") === "true";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "请选择音频文件" },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `音频文件不能超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    // 验证文件类型
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (
      !ALLOWED_TYPES.includes(file.type) &&
      !ALLOWED_EXTENSIONS.includes(ext)
    ) {
      return NextResponse.json(
        { success: false, error: `不支持的音频格式，请上传 ${ALLOWED_EXTENSIONS.join(", ")} 文件` },
        { status: 400 }
      );
    }

    // 检查 Supabase 是否可用
    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "存储服务未配置" },
        { status: 503 }
      );
    }

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const fileExt = ext || ".mp3";
    const fileName = `audios/${userId}/${timestamp}_${randomStr}${fileExt}`;

    // 将 File 转换为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("audios")
      .upload(fileName, buffer, {
        contentType: file.type || "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[Audio Upload] 存储上传失败:", uploadError);
      return NextResponse.json(
        { success: false, error: "上传失败，请重试" },
        { status: 500 }
      );
    }

    // 获取公开访问 URL
    const { data: urlData } = supabase.storage.from("audios").getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;

    // 1) 写入 audios 表（播放记录）
    const { error: dbError } = await supabase.from("audios").insert({
      user_id: userId,
      title: file.name.replace(/\.[^/.]+$/, ""),
      file_url: audioUrl,
      file_key: fileName,
      file_name: file.name,
      file_size: file.size,
      duration: 0,
      mime_type: file.type || `audio/${fileExt.slice(1)}`,
      sort_order: 0,
      is_active: true,
    });

    if (dbError) {
      console.error("[Audio Upload] audios 表写入失败:", dbError);
    }

    // 2) 仅在用户主动点击上传按钮时写入 audio_files 表（我的音频）
    if (saveToFiles) {
      // 获取 audios bucket 的 ID
      const { data: bucketData } = await supabase.storage.getBucket("audios");
      const bucketId = bucketData?.id || "00000000-0000-0000-0000-000000000000";

      const { error: fileError } = await supabase.from("audio_files").insert({
        user_id: userId,
        bucket_id: bucketId,
        path: fileName,
        name: file.name,
        size: file.size,
        mime_type: file.type || `audio/${fileExt.slice(1)}`,
      });

      if (fileError) {
        console.error("[Audio Upload] audio_files 表写入失败:", fileError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "音频上传成功",
      audio_url: audioUrl,
      file_key: fileName,
      file_name: file.name,
      file_size: file.size,
    });
  } catch (error) {
    console.error("[Audio Upload] 异常:", error);
    return NextResponse.json(
      { success: false, error: "服务器内部错误" },
      { status: 500 }
    );
  }
}
