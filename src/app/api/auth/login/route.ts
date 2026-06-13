import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { getSupabaseClient } from '@/lib/supabase-client';

export const dynamic = 'force-dynamic';

const SESSION_COOKIE_NAME = 'mindmap_session';
// 持久化登录：1年有效期（秒）
const SESSION_MAX_AGE = 365 * 24 * 60 * 60;

// 生成随机 token
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // 验证必填字段
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: '请填写用户名和密码' },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();
    if (!client) {
      return NextResponse.json(
        { success: false, error: '数据库服务未配置，请联系管理员' },
        { status: 500 }
      );
    }

    // 查找用户
    const { data: user, error: findError } = await client
      .from('users')
      .select('id, username, password_hash, created_at')
      .eq('username', username)
      .maybeSingle();

    if (findError) {
      console.error('查找用户失败:', findError);
      return NextResponse.json(
        { success: false, error: '服务器错误，请稍后重试' },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // 生成 session token
    const sessionToken = generateToken();

    // 计算过期时间（1年后）
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    // 存储 session 到数据库
    try {
      await client.from('sessions').insert({
        user_id: user.id,
        token: sessionToken,
        expires_at: expiresAt.toISOString(),
      });
    } catch (sessionError) {
      console.error('存储session失败:', sessionError);
      // session 存储失败不影响登录成功
    }

    const isDev = process.env.NODE_ENV === 'development';
    const cookieStore = await cookies();
    
    // 生产环境：secure=true，确保移动端 HTTPS 环境能正常接收 cookie
    // sameSite='lax' 在移动端兼容性最好，支持同源请求
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: !isDev,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE,
      path: '/',
    });

    console.log('[Login] Cookie 已设置:', {
      name: SESSION_COOKIE_NAME,
      token: sessionToken.substring(0, 10) + '...',
      isDev,
      secure: !isDev,
      sameSite: 'lax',
    });

    return NextResponse.json({
      success: true,
      message: '登录成功',
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('登录错误:', error);
    
    // 提取错误信息
    let message = '登录失败，请稍后重试';
    if (error instanceof Error) {
      // 递归获取原始错误信息
      let currentError: Error | null = error;
      while (currentError) {
        const errMsg = currentError.message || '';
        if (errMsg.includes('CONNECT_TIMEOUT') || errMsg.includes('ETIMEDOUT')) {
          message = '数据库连接超时，请检查网络后重试';
          break;
        }
        if (errMsg.includes('ECONNREFUSED')) {
          message = '数据库连接被拒绝，请稍后重试';
          break;
        }
        if (errMsg.includes('ENOTFOUND')) {
          message = '数据库服务器未找到，请检查配置';
          break;
        }
        if (errMsg.includes('Connection terminated')) {
          message = '数据库连接中断，请稍后重试';
          break;
        }
        currentError = (currentError as any).cause as Error || null;
      }
    }
    
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
