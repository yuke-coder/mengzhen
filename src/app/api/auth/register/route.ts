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

    // 密码长度验证
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: '密码长度不能少于 6 位' },
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

    // 检查用户名是否已存在
    const { data: existingUser, error: checkError } = await client
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (checkError) {
      console.error('检查用户名失败:', checkError);
      return NextResponse.json(
        { success: false, error: '服务器错误，请稍后重试' },
        { status: 500 }
      );
    }

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: '用户名已被注册' },
        { status: 400 }
      );
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 创建用户（不传递 id，让数据库自动生成 serial id）
    const { data: newUser, error: insertError } = await client
      .from('users')
      .insert({
        username: username,
        password_hash: passwordHash,
      })
      .select('id, username, created_at')
      .single();

    if (insertError) {
      console.error('创建用户失败:', insertError);
      
      // 检查唯一约束冲突
      if (insertError.code === '23505') {
        return NextResponse.json(
          { success: false, error: '用户名已被注册' },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { success: false, error: '注册失败，请稍后重试' },
        { status: 500 }
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
        user_id: newUser.id,
        token: sessionToken,
        expires_at: expiresAt.toISOString(),
      });
    } catch (sessionError) {
      console.error('存储session失败:', sessionError);
      // session 存储失败不影响注册成功
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

    console.log('[Register] Cookie 已设置:', {
      name: SESSION_COOKIE_NAME,
      token: sessionToken.substring(0, 10) + '...',
      isDev,
      secure: !isDev,
      sameSite: 'lax',
    });

    return NextResponse.json({
      success: true,
      message: '注册成功',
      user: {
        id: newUser.id,
        username: newUser.username,
        createdAt: newUser.created_at,
      },
    });
  } catch (error) {
    console.error('注册错误:', error);
    
    // 提取错误信息
    let message = '注册失败，请稍后重试';
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
        currentError = (currentError as any).cause as Error | null;
      }
    }
    
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
