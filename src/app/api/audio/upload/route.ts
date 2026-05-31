import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getAuthUser } from "@/lib/auth";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp3",
  "audio/x-m4a",
  "audio/flac",
  "audio/aac",
];

const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }
    const userId = authUser.id;

    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    const saveToFiles = new URL(request.url).searchParams.get("save_to_files") === "true";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "请选择音频文件" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `音频文件不能超过 ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      );
    }

    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    const typeOk = ALLOWED_TYPES.includes(file.type) || file.type.startsWith("audio/") || file.type === "";
    const extOk = ALLOWED_EXTENSIONS.includes(ext);
    if (!typeOk && !extOk) {
      return NextResponse.json(
        { success: false, error: `不支持的音频格式，请上传 ${ALLOWED_EXTENSIONS.join(", ")} 文件` },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "存储服务未配置" },
        { status: 503 }
      );
    }

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const fileExt = ext || ".mp3";
    const fileName = `audios/${userId}/${timestamp}_${randomStr}${fileExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
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

    const { data: urlData } = supabase.storage.from("audios").getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;

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

    if (saveToFiles) {
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
