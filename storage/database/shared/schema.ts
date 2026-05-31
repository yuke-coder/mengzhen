/**
 * 「梦枕」数据库 Schema 定义
 *
 * 表结构：
 * - users: 用户账号表
 * - sessions: 登录会话表
 * - user_profiles: 用户资料扩展表
 * - audios: 音频资源表
 * - audio_files: 音频文件表（我的音频）
 */

// ============================================================
// 1. users — 用户账号表
// ============================================================
export interface User {
  id: string; // UUID 主键
  username: string; // 用户名（唯一，3-20字符，字母数字下划线）
  password_hash: string; // bcrypt 哈希密码
  nickname: string; // 显示昵称
  avatar_url: string | null; // 头像 URL（Supabase Storage 路径）
  created_at: string; // 注册时间
  updated_at: string; // 更新时间
}

// ============================================================
// 2. sessions — 登录会话表
// ============================================================
export interface Session {
  id: string; // UUID 主键
  user_id: string; // 关联 users.id
  token: string; // 随机 session token（写入 httpOnly cookie）
  created_at: string; // 创建时间
  expires_at: string; // 过期时间（默认 1 年）
}

// ============================================================
// 3. user_profiles — 用户资料扩展表
// ============================================================
export interface UserProfile {
  id: string; // UUID 主键
  user_id: string; // 关联 users.id（一对一）
  nickname: string; // 显示昵称
  avatar_url: string | null; // 头像 URL（Supabase Storage 路径）
  gender: "male" | "female" | "other" | null; // 性别
  birthday: string | null; // 生日 (YYYY-MM-DD)
  location: string | null; // 所在地（JSON 字符串：{planet,country,province,city,district}）
  bio: string | null; // 个人简介
  signature: string | null; // 个性签名
  username_change_count: number; // 自然月内用户名修改次数（重置逻辑在应用层）
  username_change_reset_at: string | null; // 上次计数重置时间
  created_at: string;
  updated_at: string;
}

// ============================================================
// 4. audios — 音频资源表
// ============================================================
export interface Audio {
  id: string; // UUID 主键
  user_id: string; // 关联 users.id（谁上传的）
  title: string; // 音频标题
  file_url: string; // 文件存储路径（Supabase Storage 公开 URL）
  file_key: string; // 文件存储键（Supabase Storage 路径，如 audios/userId/xxx.mp3）
  file_name: string; // 原始文件名
  file_size: number; // 文件大小（字节）
  duration: number; // 时长（秒，0 表示未知）
  mime_type: string; // MIME 类型（audio/mp3, audio/wav 等）
  sort_order: number; // 播放排序（越小越靠前）
  is_active: boolean; // 是否启用（软删除用）
  created_at: string;
  updated_at: string;
}

// ============================================================
// SQL 建表语句（用于 Supabase SQL Editor 或 Migration）
// ============================================================

// ============================================================
// 5. audio_files — 音频文件表（我的音频）
// ============================================================
export interface AudioFile {
  id: string; // UUID 主键
  user_id: string; // 关联 users.id
  bucket_id: string; // Supabase Storage bucket ID
  path: string; // 存储路径（如 audios/userId/xxx.mp3）
  name: string; // 文件名
  size: number; // 文件大小（字节）
  mime_type: string; // MIME 类型
  metadata: Record<string, unknown> | null; // 元数据（如 duration 等）
  created_at: string;
}

export const CREATE_USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(50) NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：按用户名查询
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
`;

export const CREATE_SESSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 索引：按 token 快速查找
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(token);
-- 索引：清理过期会话
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);
`;

export const CREATE_USER_PROFILES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  nickname VARCHAR(50) NOT NULL DEFAULT '',
  avatar_url TEXT,
  gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other')),
  birthday DATE,
  location JSONB,
  bio TEXT,
  signature TEXT,
  username_change_count INTEGER NOT NULL DEFAULT 0,
  username_change_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
`;

export const CREATE_AUDIOS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.audios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  mime_type VARCHAR(50) NOT NULL DEFAULT 'audio/mpeg',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引：按用户查询自己的音频
CREATE INDEX IF NOT EXISTS idx_audios_user_id ON public.audios(user_id);
-- 索引：按排序查询
CREATE INDEX IF NOT EXISTS idx_audios_sort_order ON public.audios(user_id, sort_order);
`;

/**
 * 启用 RLS（行级安全策略）
 * 所有表仅允许用户操作自己的数据
 */
export const ENABLE_RLS_SQL = `
-- 启用 RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audios ENABLE ROW LEVEL SECURITY;

-- users 表：所有人可注册（INSERT），仅自己可读写
CREATE POLICY "Users can view own data" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert new accounts" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own data" ON public.users FOR UPDATE USING (auth.uid() = id);

-- sessions 表：通过 API key 操作，不限制（service role 绕过 RLS）
-- 但启用 RLS 防止未认证访问

-- user_profiles 表：登录后可读写自己的资料
CREATE POLICY "Profiles can view own data" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Profiles can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Profiles can update own data" ON public.user_profiles FOR UPDATE USING (true);

-- audios 表：用户只能操作自己的音频
CREATE POLICY "Audios can view own" ON public.audios FOR SELECT USING (true);
CREATE POLICY "Audios can insert own" ON public.audios FOR INSERT WITH CHECK (true);
CREATE POLICY "Audios can update own" ON public.audios FOR UPDATE USING (true);
CREATE POLICY "Audios can delete own" ON public.audios FOR DELETE USING (true);
`;
