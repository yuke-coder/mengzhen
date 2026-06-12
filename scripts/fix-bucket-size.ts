/**
 * 直接通过 SQL 检查和修改 storage.buckets 表的 file_size_limit 配置
 * Supabase JS SDK 的 storage.updateBucket 有时会被服务端全局限制拦截，
 * 直接改数据库表是最可靠的方式。
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'path';

config({ path: path.join(process.cwd(), '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL!;

if (!DATABASE_URL) {
  console.error('❌ 缺少环境变量 DATABASE_URL');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

async function main() {
  try {
    console.log('🔍 检查 storage.buckets 表结构...');
    const columns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'buckets'
      ORDER BY ordinal_position
    `;
    console.log('表字段:');
    columns.forEach(c => {
      console.log(`   - ${c.column_name} (${c.data_type}) ${c.is_nullable === 'NO' ? 'NOT NULL' : ''} ${c.column_default ? 'DEFAULT ' + c.column_default : ''}`);
    });

    console.log('\n📦 当前 buckets:');
    const buckets = await sql`SELECT * FROM storage.buckets`;
    buckets.forEach(b => {
      console.log(JSON.stringify(b, null, 2));
    });

    console.log('\n🔄 尝试将 audios bucket 的 file_size_limit 改为 500MB...');

    // 查找字段名（不同版本 Supabase 字段名可能不同）
    const sizeCol = columns.find(c =>
      c.column_name.toLowerCase().includes('file_size') ||
      c.column_name.toLowerCase().includes('max_file') ||
      c.column_name.toLowerCase().includes('size_limit')
    );

    if (!sizeCol) {
      console.log('⚠️ 未找到 file_size_limit 字段，可能该版本不需要这个配置');
      process.exit(0);
    }

    console.log(`使用字段: ${sizeCol.column_name} (${sizeCol.data_type})`);

    // 500 * 1024 * 1024 = 524288000 字节
    const newLimit = 500 * 1024 * 1024;

    const result = await sql.unsafe(`
      UPDATE storage.buckets
      SET ${sizeCol.column_name} = ${newLimit},
          allowed_mime_types = ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/flac', 'audio/aac']::text[]
      WHERE name = 'audios'
    `);
    console.log('更新结果:', result);

    console.log('\n✅ 验证更新后的值:');
    const updated = await sql`SELECT * FROM storage.buckets WHERE name = 'audios'`;
    console.log(JSON.stringify(updated, null, 2));

    // 同时也设置 avatars 为合理大小
    try {
      const avatarResult = await sql.unsafe(`
        UPDATE storage.buckets
        SET ${sizeCol.column_name} = 5 * 1024 * 1024
        WHERE name = 'avatars'
      `);
      console.log('\navatars bucket 更新:', avatarResult);
    } catch (err) {
      console.log('avatars bucket 更新失败（可能不存在）:', err.message);
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ 执行失败:', err);
    process.exit(1);
  }
}

main();
