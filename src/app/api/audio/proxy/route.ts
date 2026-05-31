import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getAuthUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key || key.includes("..") || !key.startsWith("audios/")) {
    return NextResponse.json({ error: "无效的文件路径" }, { status: 400 });
  }

  const pathParts = key.split("/");
  const pathUserId = pathParts.length >= 2 ? pathParts[1] : null;
  if (!pathUserId || pathUserId !== user.id) {
    return NextResponse.json({ error: "无权访问此文件" }, { status: 403 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("[Audio Proxy] Supabase 客户端未初始化");
    return NextResponse.json({ error: "服务器配置错误" }, { status: 500 });
  }

  try {
    const { data, error } = await supabase.storage
      .from("audios")
      .download(key);

    if (error || !data) {
      console.error("[Audio Proxy] 下载失败:", error?.message || "无数据", "key:", key);
      return NextResponse.json({ error: "文件下载失败" }, { status: 502 });
    }

    const contentType = data.type || "audio/mpeg";
    const buffer = await data.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[Audio Proxy] 异常:", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
