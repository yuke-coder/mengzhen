import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getAuthUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const config = {
  api: {
    bodySizeLimit: "100mb",
  },
};

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

// 确保 audios bucket 存在且配置正确（仅首次调用时执行）
let bucketEnsured = false;
async function ensureAudiosBucket() {
  if (bucketEnsured) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const { data: bucket } = await supabase.storage.getBucket("audios");
    if (bucket) {
      // 更新已有 bucket 配置（大小限制、MIME 类型）
      await supabase.storage.updateBucket("audios", {
        public: true,
        fileSizeLimit: 100 * 1024 * 1024,
        allowedMimeTypes: [
          "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
          "audio/x-m4a", "audio/flac", "audio/aac",
        ],
      });
    } else {
      // bucket 不存在，创建
      await supabase.storage.createBucket("audios", {
        public: true,
        fileSizeLimit: 100 * 1024 * 1024,
        allowedMimeTypes: [
          "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
          "audio/x-m4a", "audio/flac", "audio/aac",
        ],
      });
    }
    bucketEnsured = true;
  } catch (err) {
    console.warn("[Audio Upload] bucket 配置检查失败（不影响上传）:", err);
    bucketEnsured = true; // 避免反复重试
  }
}

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

    // 确保 bucket 配置正确
    await ensureAudiosBucket();

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
        { success: false, error: uploadError.message || "上传失败，请重试" },
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
      // 尝试清理已上传的存储文件
      await supabase.storage.from("audios").remove([fileName]);
      return NextResponse.json(
        { success: false, error: "音频记录保存失败，请重试" },
        { status: 500 }
      );
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
    const errMsg = error instanceof Error ? error.message : "服务器内部错误";
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
