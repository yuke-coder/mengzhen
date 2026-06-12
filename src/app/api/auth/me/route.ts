import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE_NAME = 'mindmap_session';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        user: null,
      });
    }

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        user: null,
      });
    }

    // 查询 session 对应的用户
    const { data: session, error: sessionError } = await client
      .from('sessions')
      .select('user_id, expires_at')
      .eq('token', sessionToken)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        user: null,
      });
    }

    // 手动检查 session 是否过期（避免时区问题）
    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        user: null,
      });
    }

    // 查询 Auth 用户信息
    const { data: authUser, error: authError } = await client
      .from('users')
      .select('id, username, created_at')
      .eq('id', session.user_id)
      .maybeSingle();

    if (authError || !authUser) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        user: null,
      });
    }

    // 查询用户资料
    const { data: profile } = await client
      .from('user_profiles')
      .select('nickname, avatar_url, gender, birthday, location, bio, signature')
      .eq('user_id', session.user_id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: String(authUser.id),
        username: authUser.username,
        avatar_url: profile?.avatar_url || null,
        nickname: profile?.nickname || null,
        gender: profile?.gender || null,
        birthday: profile?.birthday || null,
        location: profile?.location || null,
        bio: profile?.bio || null,
        signature: profile?.signature || null,
        createdAt: authUser.created_at,
      },
    });
  } catch (error) {
    console.error('[Me Error]', error);
    return NextResponse.json(
      { success: false, message: '服务器内部错误' },
      { status: 500 }
    );
  }
}
