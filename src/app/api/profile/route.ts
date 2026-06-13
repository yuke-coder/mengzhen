import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseClient } from "@/lib/supabase-client";

export const dynamic = 'force-dynamic';

const SESSION_COOKIE_NAME = "mindmap_session";

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

// 从 session cookie 获取当前用户 ID
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

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "数据库未配置" },
        { status: 503 }
      );
    }

    // 查询 Auth 用户信息
    const { data: authUser, error: authError } = await supabase
      .from("users")
      .select("id, username, created_at")
      .eq("id", userId)
      .single();

    if (authError) {
      console.error("获取用户失败:", authError);
      return NextResponse.json(
        { success: false, error: "获取用户信息失败" },
        { status: 500 }
      );
    }

    // 查询用户资料
    const { data: profile } = await supabase
      .from("user_profiles")
      .select(
        "nickname, avatar_url, gender, birthday, location, bio, signature, username_change_count, username_change_reset_at"
      )
      .eq("user_id", userId)
      .maybeSingle();

    // 如果没有资料，返回默认空资料
    const profileData = profile || {
      nickname: null,
      avatar_url: null,
      gender: null,
      birthday: null,
      location: null,
      bio: null,
      signature: null,
    };

    return NextResponse.json({
      success: true,
      profile: {
        id: authUser.id,
        username: authUser.username,
        ...profileData,
        nickname: profileData.nickname as string | null || authUser.username, // 统一处理：优先显示 nickname，无则用 username
        createdAt: authUser.created_at,
      },
    });
  } catch (error) {
    console.error("获取用户资料异常:", error);
    return NextResponse.json(
      { success: false, error: "服务器错误" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserIdFromSession();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "请先登录" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      username,
      nickname,
      gender,
      birthday,
      location,
      bio,
      signature,
      avatar_url,
    } = body;

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "数据库未配置" },
        { status: 503 }
      );
    }

    // ========== 用户名修改处理 ==========
    if (username !== undefined) {
      // 检查用户名是否已被占用
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("username", username)
        .neq("id", userId)
        .maybeSingle();

      if (existingUser) {
        return NextResponse.json(
          { success: false, error: "用户名已被占用" },
          { status: 400 }
        );
      }

      // 执行用户名更新
      const { error: updateUserError } = await supabase
        .from("users")
        .update({ username })
        .eq("id", userId);

      if (updateUserError) {
        console.error("更新用户名失败:", updateUserError);
        return NextResponse.json(
          { success: false, error: "更新用户名失败" },
          { status: 500 }
        );
      }
    }

    // ========== 其他资料字段验证 ==========
    if (nickname !== undefined && nickname && (nickname.length < 1 || nickname.length > 50)) {
      return NextResponse.json(
        { success: false, error: "昵称长度需在 1-50 个字符之间" },
        { status: 400 }
      );
    }

    if (signature && signature.length > 200) {
      return NextResponse.json(
        { success: false, error: "个性签名不能超过 200 个字符" },
        { status: 400 }
      );
    }

    if (bio && bio.length > 500) {
      return NextResponse.json(
        { success: false, error: "个人简介不能超过 500 个字符" },
        { status: 500 }
      );
    }

    // 检查用户资料是否存在
    const { data: existingProfile } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    // 构建更新数据（昵称字段统一使用 nickname）
    const profileData: Record<string, unknown> = {};
    if (nickname !== undefined) profileData.nickname = nickname || null;
    if (gender !== undefined) profileData.gender = gender || null;
    if (birthday !== undefined) profileData.birthday = birthday || null;
    if (location !== undefined) profileData.location = location || null;
    if (bio !== undefined) profileData.bio = bio || null;
    if (signature !== undefined) profileData.signature = signature || null;
    if (avatar_url !== undefined) profileData.avatar_url = avatar_url || null;

    // 检查是否有资料需要更新
    const hasProfileData = Object.keys(profileData).length > 0;
    let profileResult: Record<string, unknown> | null = null;

    if (existingProfile && hasProfileData) {
      // 更新现有资料
      const { data, error } = await supabase
        .from("user_profiles")
        .update(profileData)
        .eq("user_id", userId)
        .select(
          "nickname, avatar_url, gender, birthday, location, bio, signature, username_change_count"
        )
        .single();

      if (error) {
        console.error("更新用户资料失败:", error);
        return NextResponse.json(
          { success: false, error: "更新资料失败" },
          { status: 500 }
        );
      }
      profileResult = data;
    } else if (!existingProfile && hasProfileData) {
      // 创建新资料
      const { data, error } = await supabase
        .from("user_profiles")
        .insert({
          user_id: userId,
          ...profileData,
        })
        .select(
          "nickname, avatar_url, gender, birthday, location, bio, signature, username_change_count"
        )
        .single();

      if (error) {
        console.error("创建用户资料失败:", error);
        return NextResponse.json(
          { success: false, error: "更新资料失败" },
          { status: 500 }
        );
      }
      profileResult = data;
    } else if (existingProfile) {
      // 资料存在但没有新数据，只需获取现有资料
      const { data } = await supabase
        .from("user_profiles")
        .select(
          "nickname, avatar_url, gender, birthday, location, bio, signature, username_change_count"
        )
        .eq("user_id", userId)
        .maybeSingle();
      profileResult = data;
    }

    // 获取更新后的 Auth 用户信息
    const { data: authUser } = await supabase
      .from("users")
      .select("id, username, created_at")
      .eq("id", userId)
      .single();

    return NextResponse.json({
      success: true,
      message: username ? "用户名和资料更新成功" : "资料更新成功",
      profile: {
        id: authUser?.id,
        username: authUser?.username,
        ...profileResult,
        nickname: (profileResult?.nickname || authUser?.username), // 统一显示
        createdAt: authUser?.created_at,
      },
    });
  } catch (error) {
    console.error("更新用户资料异常:", error);
    return NextResponse.json(
      { success: false, error: "服务器错误" },
      { status: 500 }
    );
  }
}
