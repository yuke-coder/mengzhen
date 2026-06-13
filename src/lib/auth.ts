import { cookies } from "next/headers";
import { getSupabaseClient } from "@/lib/supabase-client";

const SESSION_COOKIE_NAME = "mindmap_session";

export interface AuthUser {
  id: string;
  username: string;
}

export async function getAuthUser(): Promise<AuthUser | null> {
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

    const { data: session, error: sessionError } = await client
      .from('sessions')
      .select('user_id, expires_at')
      .eq('token', sessionToken)
      .maybeSingle();

    if (sessionError || !session) {
      return null;
    }

    const expiresAt = new Date(session.expires_at);
    if (expiresAt < new Date()) {
      return null;
    }

    const { data: authUser, error: authError } = await client
      .from('users')
      .select('id, username')
      .eq('id', session.user_id)
      .maybeSingle();

    if (authError || !authUser) {
      return null;
    }

    return {
      id: String(authUser.id),
      username: authUser.username,
    };
  } catch {
    return null;
  }
}
