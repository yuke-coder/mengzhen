'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { UserMenu } from '@/components/user-menu';
import { useTheme, type Theme } from '@/lib/theme-context';
import RippleButton from '@/components/RippleButton';
import { cn } from '@/lib/utils';
import {
  ChevronRight,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';

/* ── ThemeToggle ── */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: '亮色模式', icon: Sun },
    { value: 'dark',  label: '暗色模式', icon: Moon },
    { value: 'system', label: '跟随系统', icon: Monitor },
  ];

  const currentIndex = themes.findIndex(t => t.value === theme);
  const nextTheme = themes[(currentIndex + 1) % 3];

  if (!mounted) {
    return <div className="w-9 h-9 rounded-lg bg-muted/50 border border-border/50" aria-hidden="true" />;
  }

  return (
    <div className="relative" onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}>
      <button
        onClick={() => setTheme(nextTheme.value)}
        className={`relative w-9 h-9 rounded-lg flex items-center justify-center
          bg-muted/50 hover:bg-muted active:bg-muted/80
          border border-border/50 hover:border-border
          transition-all duration-200 group overflow-hidden
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
        title={`当前：${themes[currentIndex].label}（点击切换为 ${nextTheme.label}）`}
      >
        <div className="relative w-[18px] h-[18px]">
          {themes.map(({ value, icon: Icon }) => (
            <Icon
              key={value}
              className={cn(
                'absolute inset-0 h-[18px] w-[18px] transition-all duration-300 ease-out',
                theme === value
                  ? 'rotate-0 scale-100 opacity-100 text-primary'
                  : value === nextTheme.value
                    ? 'rotate-45 scale-50 opacity-0 text-primary/40'
                    : '-rotate-45 scale-0 opacity-0 text-primary/20',
              )}
            />
          ))}
        </div>
        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
        <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 flex gap-[3px]">
          {themes.map(({ value }) => (
            <span
              key={value}
              className={cn(
                'w-[3px] h-[3px] rounded-full transition-all duration-300',
                theme === value ? 'bg-primary scale-100' : 'bg-muted-foreground/30 scale-75',
              )}
            />
          ))}
        </div>
      </button>
      {showTip && (
        <div className={cn(
          'absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md text-xs font-medium',
          'bg-popover text-popover-foreground border border-border shadow-lg',
          'pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150 origin-bottom',
        )}>
          {themes[currentIndex].label}
          <span className="text-muted-foreground ml-1">→ {nextTheme.label}</span>
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-popover border-l border-t border-border" />
        </div>
      )}
    </div>
  );
}

/* ── Navbar Props ── */
export interface NavbarProps {
  /** 当前页面标识，影响导航高亮和 CTA 按钮文案 */
  activePage?: 'home' | 'settings' | string;
  /** 首页滚动到指定 section 的回调（首页专用） */
  onScrollToSection?: (id: string) => void;
}

/* ── 共享导航栏 ── */
export default function Navbar({ activePage, onScrollToSection }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  // 自动识别当前页面：未传 activePage 时根据路径判断
  const resolvedPage = activePage || (pathname === '/' || pathname === '/settings' ? (pathname === '/' ? 'home' : 'settings') : 'home');
  const isHome = resolvedPage === 'home';
  // 登录/注册页面隐藏主题切换按钮
  const isAuthPage = pathname?.startsWith('/auth/');

  const scrollToSection = (id: string) => {
    if (onScrollToSection) {
      onScrollToSection(id);
    } else if (pathname === '/') {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    } else {
      router.push(`/#${id}`);
    }
  };

  return (
    <header id="main-navbar" className="fixed top-0 left-0 right-0 z-[9999] isolation-isolate bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between relative">
        {/* 左侧：Logo + 品牌名 */}
        <div className="flex items-center gap-4 z-30">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="梦枕"
              className="w-9 h-9 rounded-lg shadow-lg shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-110 z-30"
            />
            <span className="font-bold text-xl tracking-tight">
              <span className="bg-gradient-to-r from-purple-500 via-purple-600 to-fuchsia-500 bg-clip-text text-transparent" suppressHydrationWarning>
                梦枕
              </span>
            </span>
          </Link>

          <div className="hidden md:block w-px h-6 bg-gradient-to-b from-transparent via-[var(--brand-start)]/30 to-transparent" />

          <div className="hidden md:flex items-center">
            <span className="relative text-sm font-medium tracking-wide" suppressHydrationWarning>
              <span className="bg-gradient-to-r from-[var(--brand-start)]/70 via-[var(--brand-mid)]/80 to-[var(--brand-end)]/70 bg-clip-text text-transparent drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" suppressHydrationWarning>
                星河入眠
              </span>
              <span className="mx-1.5 text-[var(--brand-glow)]/50" suppressHydrationWarning>·</span>
              <span className="bg-gradient-to-r from-[var(--brand-mid)]/80 via-[var(--brand-end)]/90 to-[var(--brand-end)] bg-clip-text text-transparent drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" suppressHydrationWarning>
                伴你梦枕
              </span>
            </span>
          </div>
        </div>

        {/* 中间：导航链接 */}
        <nav className="hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
          {/* 首页 */}
          {isHome ? (
            <span className="text-sm text-foreground/60 px-4 py-2 rounded-full bg-[var(--brand-start)]/5 cursor-default" suppressHydrationWarning>
              首页
            </span>
          ) : (
            <Link
              href="/"
              className="group relative text-sm text-muted-foreground hover:text-foreground transition-all duration-200 px-4 py-2 rounded-full hover:bg-[var(--brand-start)]/5"
            >
              <span className="relative z-10">首页</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] rounded-full transition-all duration-300 group-hover:w-full" />
            </Link>
          )}

          {/* 功能 */}
          <button
            onClick={() => scrollToSection('features')}
            className="group relative text-sm text-muted-foreground hover:text-foreground transition-all duration-200 px-4 py-2 rounded-full hover:bg-[var(--brand-start)]/5"
          >
            <span className="relative z-10" suppressHydrationWarning>功能</span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] rounded-full transition-all duration-300 group-hover:w-full" />
          </button>

          {/* 模板 */}
          <button
            onClick={() => scrollToSection('templates')}
            className="group relative text-sm text-muted-foreground hover:text-foreground transition-all duration-200 px-4 py-2 rounded-full hover:bg-[var(--brand-start)]/5"
          >
            <span className="relative z-10" suppressHydrationWarning>模板</span>
            <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-0 h-0.5 bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] rounded-full transition-all duration-300 group-hover:w-full" />
          </button>

          {/* CTA 按钮 */}
          {isHome ? (
            <Link href="/settings" className="group relative ml-3">
              <span className="absolute -inset-1.5 bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] rounded-full blur-md opacity-0 group-hover:opacity-60 transition-all duration-300" />
              <RippleButton
                onClick={() => router.push('/settings')}
                className="relative flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] text-white font-semibold text-sm shadow-lg shadow-[var(--brand-start)]/30 transition-all duration-300 group-hover:shadow-xl group-hover:shadow-[var(--brand-start)]/50 group-hover:-translate-y-0.5"
              >
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 ease-out">
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                </span>
                <img src="/logo.png" alt="梦枕" className="w-4 h-4 relative z-10 rounded shadow-md transition-transform duration-300 group-hover:scale-110" />
                <span suppressHydrationWarning className="relative z-10">免费体验</span>
                <span className="relative z-10 flex items-center">
                  <ChevronRight className="w-4 h-4 transition-all duration-300 group-hover:translate-x-1.5" />
                </span>
              </RippleButton>
            </Link>
          ) : (
            <span className="text-sm text-foreground/60 ml-3 px-4 py-2 rounded-full bg-[var(--brand-start)]/10 cursor-default" suppressHydrationWarning>
              开始创作
            </span>
          )}
        </nav>

         {/* 右侧：用户菜单 + 主题切换（登录/注册页隐藏） */}
         <div className="z-10 flex items-center gap-3">
            {!isAuthPage && <UserMenu />}
           {!isAuthPage && <ThemeToggle />}
         </div>
      </div>
    </header>
  );
}
