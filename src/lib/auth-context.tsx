'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface User {
  id: string | number;
  username: string;
  createdAt: string;
  // 用户资料字段
  avatar_url?: string | null;
  nickname?: string | null;
  gender?: 'male' | 'female' | 'secret' | null;
  birthday?: string | null;
  location?: string | null;
  signature?: string | null;
  bio?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  register: (username: string, password: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (userData: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const isLoggingInRef = useRef(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 组件挂载后检查认证状态
  useEffect(() => {
    setMounted(true);
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string) => {
    isLoggingInRef.current = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        // 立即更新状态
        setUser(data.user);
        // 强制完成 hydration
        setMounted(true);
        setLoading(false);
        return { success: true, message: '登录成功' };
      }
      return { success: false, message: data.error || '登录失败' };
    } catch {
      return { success: false, message: '网络错误，请重试' };
    } finally {
      isLoggingInRef.current = false;
    }
  };

  const register = async (username: string, password: string) => {
    isLoggingInRef.current = true;
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        // 立即更新状态
        setUser(data.user);
        // 强制完成 hydration
        setMounted(true);
        setLoading(false);
        return { success: true, message: '注册成功' };
      }
      return { success: false, message: data.error || '注册失败' };
    } catch {
      return { success: false, message: '网络错误，请重试' };
    } finally {
      isLoggingInRef.current = false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setLoading(false);
    }
  };

  const updateUser = (userData: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...userData } : null);
  };

  // 在 hydration 完成前，显示加载状态
  const isLoading = !mounted || loading;

  return (
    <AuthContext.Provider value={{ user, loading: isLoading, login, register, logout, checkAuth, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// 导出刷新认证状态的函数（用于登录后更新全局状态）
export function refreshAuth(): void {
  if (typeof window !== 'undefined') {
    // 触发 checkAuth 来刷新认证状态
    window.dispatchEvent(new CustomEvent('auth:refresh'));
  }
}

// 导出更新用户资料的函数（需要传入 userId 和更新数据）
export async function updateUserProfile(userId: string, profileData: {
  nickname?: string;
  gender?: string;
  birthday?: string;
  location?: string;
  bio?: string;
  signature?: string;
}): Promise<{ success: boolean; message: string; profile?: User }> {
  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData),
    });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: data.message, profile: data.profile };
    }
    return { success: false, message: data.error || '更新失败' };
  } catch {
    return { success: false, message: '网络错误，请重试' };
  }
}

// 导出获取用户资料的函数
export async function fetchUserProfile(): Promise<{ success: boolean; profile?: User }> {
  try {
    const res = await fetch('/api/profile');
    const data = await res.json();
    if (data.success) {
      return { success: true, profile: data.profile };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
}

// 导出上传头像的函数
export async function uploadAvatar(file: File): Promise<{ success: boolean; message: string; avatar_url?: string }> {
  try {
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await fetch('/api/avatar', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: data.message, avatar_url: data.avatar_url };
    }
    return { success: false, message: data.error || '上传失败' };
  } catch {
    return { success: false, message: '网络错误，请重试' };
  }
}

// 导出删除头像的函数
export async function deleteAvatar(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/avatar', { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: data.message };
    }
    return { success: false, message: data.error || '删除失败' };
  } catch {
    return { success: false, message: '网络错误，请重试' };
  }
}
