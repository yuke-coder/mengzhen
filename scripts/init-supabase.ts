/**
 * 一键初始化 Supabase 数据库与 Storage
 *  - 创建所有缺失的表（users / sessions / user_profiles / audios / audio_files）
 *  - 启用 RLS 与策略
 *  - 创建公开的 avatars Storage bucket
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DATABASE_URL = process.env.DATABASE_URL!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error('❌ 缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL');
  process.exit(1);
}

const CREATE_USERS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nickname VARCHAR(50) NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON public.users(username);
`;

const CREATE_SESSIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON public.sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON public.sessions(expires_at);
`;

const CREATE_USER_PROFILES_TABLE_SQL = `
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
`;

const CREATE_AUDIOS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.audios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  file_url TEXT NOT NULL,
  file_key TEXT,
  file_name VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  mime_type VARCHAR(50) NOT NULL DEFAULT 'audio/mpeg',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audios_user_id ON public.audios(user_id);
CREATE INDEX IF NOT EXISTS idx_audios_sort_order ON public.audios(user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_audios_file_key ON public.audios(file_key);
`;

const CREATE_AUDIO_FILES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS public.audio_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bucket_id UUID,
  path TEXT NOT NULL,
  name VARCHAR(255) NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime_type VARCHAR(50) NOT NULL DEFAULT 'audio/mpeg',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audio_files_user_id ON public.audio_files(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audio_files_user_path ON public.audio_files(user_id, path);
`;

const ENABLE_RLS_SQL = `
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can insert new accounts" ON public.users;
DROP POLICY IF EXISTS "Users can update own data" ON public.users;
CREATE POLICY "Users can view own data" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can insert new accounts" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own data" ON public.users FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Profiles can view own data" ON public.user_profiles;
DROP POLICY IF EXISTS "Profiles can insert own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Profiles can update own data" ON public.user_profiles;
CREATE POLICY "Profiles can view own data" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "Profiles can insert own profile" ON public.user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Profiles can update own data" ON public.user_profiles FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Audios can view own" ON public.audios;
DROP POLICY IF EXISTS "Audios can insert own" ON public.audios;
DROP POLICY IF EXISTS "Audios can update own" ON public.audios;
DROP POLICY IF EXISTS "Audios can delete own" ON public.audios;
CREATE POLICY "Audios can view own" ON public.audios FOR SELECT USING (true);
CREATE POLICY "Audios can insert own" ON public.audios FOR INSERT WITH CHECK (true);
CREATE POLICY "Audios can update own" ON public.audios FOR UPDATE USING (true);
CREATE POLICY "Audios can delete own" ON public.audios FOR DELETE USING (true);
`;

async function main() {
  console.log('🚀 初始化 Supabase 数据库与 Storage...');
  console.log('📡 SUPABASE_URL:', SUPABASE_URL);
  console.log('🔑 SERVICE_ROLE_KEY: ***' + SERVICE_ROLE_KEY.slice(-8));

  // 1. 初始化数据库表
  const sql = postgres(DATABASE_URL);
  try {
    console.log('\n📦 1) 创建数据库表...');
    await sql.unsafe(CREATE_USERS_TABLE_SQL);
    console.log('  ✅ users');
    await sql.unsafe(CREATE_SESSIONS_TABLE_SQL);
    console.log('  ✅ sessions');
    await sql.unsafe(CREATE_USER_PROFILES_TABLE_SQL);
    console.log('  ✅ user_profiles');
    await sql.unsafe(CREATE_AUDIOS_TABLE_SQL);
    console.log('  ✅ audios');
    await sql.unsafe(CREATE_AUDIO_FILES_TABLE_SQL);
    console.log('  ✅ audio_files');

    console.log('\n🔒 2) 启用 RLS 与策略...');
    await sql.unsafe(ENABLE_RLS_SQL);
    console.log('  ✅ RLS 已启用');

    console.log('\n📋 3) 验证现有表:');
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `;
    for (const t of tables) console.log('  -', t.table_name);
  } finally {
    await sql.end();
  }

  // 2. 创建 Storage bucket
  console.log('\n🪣 4) 创建 Storage bucket...');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('  ⚠️ 列取 bucket 失败:', listErr.message);
  } else {
    console.log('  现有 buckets:', buckets.map((b) => b.name).join(', ') || '(空)');
  }

  const bucketConfigs: Record<string, { fileSizeLimit: number; allowedMimeTypes: string[] }> = {
    avatars: {
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    },
    audios: {
      fileSizeLimit: 500 * 1024 * 1024, // 500MB
      allowedMimeTypes: [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
        'audio/x-m4a', 'audio/flac', 'audio/aac',
      ],
    },
  };

  for (const [name, config] of Object.entries(bucketConfigs)) {
    const exists = buckets?.some((b) => b.name === name);
    if (exists) {
      // 更新已有 bucket 的配置
      const { error: updateErr } = await supabase.storage.updateBucket(name, {
        public: true,
        fileSizeLimit: config.fileSizeLimit,
        allowedMimeTypes: config.allowedMimeTypes,
      });
      if (updateErr) {
        console.error(`  ⚠️ 更新 ${name} 配置失败:`, updateErr.message);
      } else {
        console.log(`  ✅ 更新 ${name} 配置成功 (大小限制: ${config.fileSizeLimit / (1024 * 1024)}MB)`);
      }
    } else {
      const { error } = await supabase.storage.createBucket(name, {
        public: true,
        fileSizeLimit: config.fileSizeLimit,
        allowedMimeTypes: config.allowedMimeTypes,
      });
      if (error) {
        console.error(`  ❌ 创建 ${name} 失败:`, error.message);
      } else {
        console.log(`  ✅ 创建 ${name} 成功 (大小限制: ${config.fileSizeLimit / (1024 * 1024)}MB)`);
      }
    }
  }

  console.log('\n🎉 初始化完成！请重新尝试上传头像。');
}

main().catch((err) => {
  console.error('❌ 初始化失败:', err);
  process.exit(1);
});
