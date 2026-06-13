import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase-client';

const SESSION_COOKIE_NAME = 'mindmap_session';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    // 从数据库删除 session token，使其彻底失效
    if (sessionToken) {
      try {
        const client = getSupabaseClient();
        if (client) {
          await client
            .from('sessions')
            .delete()
            .eq('token', sessionToken);
        }
      } catch (dbError) {
        console.error('[Logout] 删除 session 失败:', dbError);
        // 即使数据库删除失败，也继续清除 cookie
      }
    }
  } catch (err) {
    console.error('[Logout] 获取 session token 失败:', err);
  }

  const response = NextResponse.json({
    success: true,
    message: '退出登录成功',
  });

  // 清除会话 Cookie
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return response;
}
