import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const SESSION_COOKIE_NAME = "mindmap_session";

// 头像文件大小限制 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 允许的图片类型
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// 从 session cookie 获取当前用户 ID
async function getUserIdFromSession(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    console.log('[Avatar] Cookie received:', sessionToken ? 'yes' : 'NO');

    if (!sessionToken) {
      return null;
    }

    const client = getSupabaseClient();
    if (!client) {
      return null;
    }

    // 查询 session 对应的用户
    const { data: session, error } = await client
      .from("sessions")
      .select("user_id, expires_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (error || !session) {
      return null;
    }

    // 手动检查 session 是否过期（避免时区问题）
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return null;
    }

    return session.user_id;
  } catch (error) {
    console.error("获取用户ID失败:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "请选择头像图片" },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "头像图片不能超过 5MB" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "仅支持 JPG、PNG、GIF、WebP 格式" },
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

    // 生成唯一文件名
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `avatars/${userId}/${timestamp}_${randomStr}.${ext}`;

    // 将 File 转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("上传头像失败:", uploadError);
      return NextResponse.json(
        { success: false, error: "上传失败，请重试" },
        { status: 500 }
      );
    }

    // 获取公开 URL
    const { data: urlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(fileName);

    const avatarUrl = urlData.publicUrl;

    // 更新用户资料中的头像（使用 upsert）
    const { error: upsertError } = await supabase
      .from("user_profiles")
      .upsert({
        user_id: userId,
        avatar_url: avatarUrl,
      }, {
        onConflict: 'user_id',
      });

    if (upsertError) {
      console.error("更新头像失败:", upsertError);
      return NextResponse.json(
        { success: false, error: "保存头像失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "头像上传成功",
      avatar_url: avatarUrl,
    });
  } catch (error) {
    console.error("上传头像异常:", error);
    return NextResponse.json(
      { success: false, error: "服务器错误" },
      { status: 500 }
    );
  }
}

// 默认头像 URL（根据性别）
const DEFAULT_AVATARS = {
  male: "/avatars/default-male.png",
  female: "/avatars/default-female.png",
  secret: "/avatars/default.png",
};

export async function DELETE(request: NextRequest) {
  try {
    // 获取当前用户
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    // 从请求中获取性别参数
    const { searchParams } = new URL(request.url);
    const gender = searchParams.get("gender") || "secret";
    const defaultAvatar = DEFAULT_AVATARS[gender as keyof typeof DEFAULT_AVATARS] || DEFAULT_AVATARS.secret;

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "存储服务未配置" },
        { status: 503 }
      );
    }

    // 查询当前头像
    const { data: profile, error: fetchError } = await supabase
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchError) {
      console.error("查询头像失败:", fetchError);
      return NextResponse.json(
        { success: false, error: "查询头像失败" },
        { status: 500 }
      );
    }

    if (profile?.avatar_url) {
      // 从 URL 中提取存储路径
      const urlParts = profile.avatar_url.split("/");
      const fileName = urlParts.slice(-3).join("/"); // avatars/{userId}/{filename}
      
      // 删除存储中的文件
      try {
        await supabase.storage
          .from("avatars")
          .remove([fileName]);
      } catch (deleteError) {
        console.error("删除头像文件失败:", deleteError);
        // 不影响后续操作
      }
    }

    // 设置性别对应的默认头像
    const { error: updateError } = await supabase
      .from("user_profiles")
      .update({ avatar_url: defaultAvatar })
      .eq("user_id", userId);

    if (updateError) {
      console.error("清除头像失败:", updateError);
      return NextResponse.json(
        { success: false, error: "清除头像失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "头像已重置为默认",
    });
  } catch (error) {
    console.error("删除头像异常:", error);
    return NextResponse.json(
      { success: false, error: "服务器错误" },
      { status: 500 }
    );
  }
}
