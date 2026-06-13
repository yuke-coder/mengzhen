import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase-client";
import { getAuthUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

let bucketEnsured = false;
// 确保 audios bucket 存在且配置正确
// 注意：数据库中 file_size_limit 已手动设置为 500MB，
// 这里只设置 MIME 类型和 public 属性，不覆盖大小限制
async function ensureAudiosBucket() {
  if (bucketEnsured) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const { data: bucket } = await supabase.storage.getBucket("audios");
    if (bucket) {
      // 仅更新 public 属性和 MIME 类型（不覆盖 fileSizeLimit，已手动设为 500MB）
      await supabase.storage.updateBucket("audios", {
        public: true,
        allowedMimeTypes: [
          "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
          "audio/x-m4a", "audio/flac", "audio/aac",
        ],
      });
    } else {
      await supabase.storage.createBucket("audios", {
        public: true,
        fileSizeLimit: 500 * 1024 * 1024,
        allowedMimeTypes: [
          "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg",
          "audio/x-m4a", "audio/flac", "audio/aac",
        ],
      });
    }
    bucketEnsured = true;
  } catch (err) {
    // updateBucket 失败通常是因为 Supabase JS SDK 对 fileSizeLimit 有校验，
    // 但我们已通过 SQL 直接改了数据库，所以这里忽略失败
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[Audio Upload] bucket 配置检查（忽略，数据库已设置）:", errMsg);
    bucketEnsured = true;
  }
}

// 从 Content-Type header 中提取 multipart boundary
function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return null;
  return match[1] || match[2] || null;
}

// 将 Supabase 的英文错误信息转换为友好的中文提示
function translateStorageError(rawMessage: string): string {
  const msg = (rawMessage || "").toLowerCase();
  if (msg.includes("exceeded the maximum allowed") || msg.includes("file size") || msg.includes("too large")) {
    return "音频文件超过存储平台的单文件大小限制，请压缩或分段上传";
  }
  if (msg.includes("invalid content type") || msg.includes("mime") || msg.includes("content-type")) {
    return "不支持的音频格式，请上传 MP3 / WAV / OGG / M4A / FLAC 等格式";
  }
  if (msg.includes("not found") || msg.includes("bucket") && msg.includes("not")) {
    return "存储空间未配置，请联系管理员";
  }
  if (msg.includes("unauthorized") || msg.includes("permission") || msg.includes("forbidden")) {
    return "上传权限不足，请重新登录后再试";
  }
  if (msg.includes("network") || msg.includes("timeout") || msg.includes("econn")) {
    return "网络连接异常，请检查网络后重试";
  }
  return rawMessage || "上传失败，请重试";
}

// 从 multipart body 中解析出文件字段（name="audio"）
// 返回 { fileBuffer, filename, contentType } 或 null
function parseMultipartFile(
  body: Uint8Array,
  boundary: string,
  fieldName: string = "audio"
): { fileBuffer: Uint8Array; filename: string; contentType: string } | null {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8");

  const delimiter = encoder.encode("--" + boundary);
  const closingDelimiter = encoder.encode("--" + boundary + "--");

  // 查找所有 delimiter 位置
  const findSequence = (data: Uint8Array, seq: Uint8Array, start: number = 0): number => {
    for (let i = start; i <= data.length - seq.length; i++) {
      let found = true;
      for (let j = 0; j < seq.length; j++) {
        if (data[i + j] !== seq[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  };

  // 查找第一个 delimiter
  let pos = findSequence(body, delimiter, 0);
  if (pos === -1) return null;

  while (pos !== -1 && pos < body.length) {
    // 跳过 delimiter 本身
    let partStart = pos + delimiter.length;

    // 检查是否是 closing delimiter
    if (partStart + 2 <= body.length && body[partStart] === 45 && body[partStart + 1] === 45) {
      break;
    }

    // 跳过 \r\n 或 \n
    if (body[partStart] === 13 && body[partStart + 1] === 10) partStart += 2;
    else if (body[partStart] === 10) partStart += 1;

    // 查找下一个 delimiter（这部分的结束）
    const nextDelimPos = findSequence(body, delimiter, partStart);
    if (nextDelimPos === -1) break;

    // 这部分的结束位置：下一个 delimiter 之前的 \r\n--
    const partEnd = nextDelimPos - 2; // 减去前面的 \r\n

    // 解析 headers：查找空行（\r\n\r\n）
    const partBody = body.subarray(partStart, partEnd);
    let headerEnd = -1;
    for (let i = 0; i < partBody.length - 3; i++) {
      if (partBody[i] === 13 && partBody[i + 1] === 10 &&
          partBody[i + 2] === 13 && partBody[i + 3] === 10) {
        headerEnd = i;
        break;
      }
      // 兼容 \n\n
      if (partBody[i] === 10 && partBody[i + 1] === 10) {
        headerEnd = i;
        break;
      }
    }
    if (headerEnd === -1) {
      pos = nextDelimPos;
      continue;
    }

    const headersText = decoder.decode(partBody.subarray(0, headerEnd));
    const contentStart = headerEnd + (partBody[headerEnd] === 13 ? 4 : 2);

    // 检查是否是目标字段
    const nameMatch = headersText.match(/name="([^"]+)"/);
    if (nameMatch && nameMatch[1] === fieldName) {
      // 提取 filename
      const filenameMatch = headersText.match(/filename="([^"]+)"/);
      const filename = filenameMatch ? filenameMatch[1] : "audio";

      // 提取 Content-Type
      const ctMatch = headersText.match(/Content-Type:\s*([^\r\n]+)/i);
      const contentType = ctMatch ? ctMatch[1].trim() : "audio/mpeg";

      // 文件内容
      const fileBuffer = partBody.subarray(contentStart);

      return { fileBuffer, filename, contentType };
    }

    pos = nextDelimPos;
  }

  return null;
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

    const url = new URL(request.url);
    const saveToFiles = url.searchParams.get("save_to_files") === "true";

    // 从 Content-Type 中获取 boundary
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { success: false, error: "请求格式错误" },
        { status: 400 }
      );
    }

    const boundary = extractBoundary(contentType);
    if (!boundary) {
      return NextResponse.json(
        { success: false, error: "无法解析 multipart boundary" },
        { status: 400 }
      );
    }

    // 关键：直接读取原始 body 流，绕过 Next.js formData() 的大小限制
    const reader = request.body?.getReader();
    if (!reader) {
      return NextResponse.json(
        { success: false, error: "无法读取请求体" },
        { status: 400 }
      );
    }

    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    // 合并所有 chunk
    let totalLen = 0;
    for (const c of chunks) totalLen += c.length;
    const body = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.length;
    }

    if (body.length === 0) {
      return NextResponse.json(
        { success: false, error: "请选择音频文件" },
        { status: 400 }
      );
    }

    // 解析 multipart body 获取文件
    const parsed = parseMultipartFile(body, boundary, "audio");
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: "未找到音频文件字段" },
        { status: 400 }
      );
    }

    const { fileBuffer, filename, contentType: fileType } = parsed;
    const fileSize = fileBuffer.length;

    // 验证扩展名
    const ext = "." + filename.split(".").pop()?.toLowerCase();
    const typeOk = ALLOWED_TYPES.includes(fileType) || fileType.startsWith("audio/") || fileType === "";
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

    await ensureAudiosBucket();

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const fileExt = ext || ".mp3";
    const fileName = `audios/${userId}/${timestamp}_${randomStr}${fileExt}`;

    console.log(`[Audio Upload] 上传文件: ${filename}, 大小: ${fileSize} 字节, 目标路径: ${fileName}`);

    // 直接上传 Uint8Array 到 Supabase
    const { error: uploadError } = await supabase.storage
      .from("audios")
      .upload(fileName, fileBuffer, {
        contentType: fileType || "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[Audio Upload] 存储上传失败:", uploadError);
      const userMsg = translateStorageError(uploadError.message || "");
      return NextResponse.json(
        { success: false, error: userMsg },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from("audios").getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;

    // 写入 audios 表
    const { error: dbError } = await supabase.from("audios").insert({
      user_id: userId,
      title: filename.replace(/\.[^/.]+$/, ""),
      file_url: audioUrl,
      file_key: fileName,
      file_name: filename,
      file_size: fileSize,
      duration: 0,
      mime_type: fileType || `audio/${fileExt.slice(1)}`,
      sort_order: 0,
      is_active: true,
    });

    if (dbError) {
      console.error("[Audio Upload] audios 表写入失败:", dbError);
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
        name: filename,
        size: fileSize,
        mime_type: fileType || `audio/${fileExt.slice(1)}`,
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
      file_name: filename,
      file_size: fileSize,
    });
  } catch (error) {
    console.error("[Audio Upload] 异常:", error);
    const rawMsg = error instanceof Error ? error.message : "服务器内部错误";
    const userMsg = translateStorageError(rawMsg);
    return NextResponse.json(
      { success: false, error: userMsg },
      { status: 500 }
    );
  }
}
