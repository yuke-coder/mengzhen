"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/** 同步读取已解析的主题（仅在客户端调用） */
function getResolvedTheme(theme: Theme): ResolvedTheme {
  if (theme === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light";
    }
    return "dark";
  }
  return theme;
}

/** 同步从 localStorage 读取主题偏好 */
function getStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem("theme") as Theme | null; } catch { return null; }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 初始状态：优先从 localStorage 同步读取，默认为暗色模式
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? "dark");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getResolvedTheme(getStoredTheme() ?? "dark")
  );

  const setTheme = useCallback((newTheme: Theme) => {
    console.log("ThemeContext: setTheme called with", newTheme);
    document.body.classList.add('theme-transitioning');
    setThemeState(newTheme);
    try { localStorage.setItem("theme", newTheme); } catch {}
    setTimeout(() => {
      document.body.classList.remove('theme-transitioning');
    }, 350);
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    // 解析实际主题并更新 DOM class
    const resolved = getResolvedTheme(theme);
    setResolvedTheme(resolved);

    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    
    console.log("ThemeContext: Theme changed to", theme, "resolved:", resolved, "classes:", root.className);
  }, [theme]);

  // 监听系统主题变化（仅当 theme === "system" 时）
  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      document.documentElement.classList.remove("light", "dark");
      document.documentElement.classList.add(resolved);
    };

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
