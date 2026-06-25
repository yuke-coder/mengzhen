import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider } from "@/lib/auth-context";
import Navbar from "@/components/navbar";
import { Toaster } from "@/components/ui/sonner";
import ClientProviders from "@/components/client-providers";
import { ProfileToastListener } from "@/components/profile-toast-listener";

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1a' },
  ],
};

export const metadata: Metadata = {
  title: "梦枕",
  description: "专为浅眠人群设计的睡眠音频播放器，支持自定义定时、淡入淡出、全自动运行",
  keywords: ["助眠", "睡眠", "白噪音", "定时播放", "音频", "梦枕", "免登录"],
  authors: [{ name: "梦枕" }],
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "梦枕",
  },
  openGraph: {
    title: "梦枕 - 睡眠音频播放器",
    description: "专为浅眠人群设计的睡眠音频播放器，支持自定义定时、淡入淡出、全自动运行",
    type: "website",
  },
  other: {
    "dns-prefetch": "https://br-epic-clam-5a2fd709.supabase2.aidap-global.cn-beijing.volces.com",
  },
};

// 内联脚本：React 水合前读取主题偏好并设置 class，防止 FOUC 闪烁
const THEME_INJECTION_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){d.classList.add(t)}else if(!t||t==='system'){var m=window.matchMedia('(prefers-color-scheme:dark)');if(m.matches)d.classList.add('dark')}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* beforeInteractive: 在页面水合前执行，读取 localStorage 设置主题 class */}
        <Script
          id="theme-injection"
          strategy="beforeInteractive"
        >{THEME_INJECTION_SCRIPT}</Script>

        {/* 全局导航栏 + 页面内容 */}
        <ThemeProvider>
          <AuthProvider>
            <ClientProviders>
              {/* 导航栏：position: fixed + z-index 确保在所有页面内容之上 */}
              <Navbar />

              {/* 页面内容（pt-14 为固定导航栏留出空间） */}
              <div className="pt-14">
                {children}
                <ProfileToastListener />
              </div>
            </ClientProviders>
          </AuthProvider>
          <Toaster position="top-center" richColors />
        </ThemeProvider>

        {/* Ripple effect for buttons */}
        <Script id="ripple-init" strategy="afterInteractive">{`
          document.addEventListener('DOMContentLoaded', function() {
            document.addEventListener('click', function(e) {
              const btn = e.target.closest('.ripple-btn');
              if (!btn) return;
              const rect = btn.getBoundingClientRect();
              const size = Math.max(rect.width, rect.height);
              const ripple = document.createElement('span');
              ripple.style.cssText = 'position:absolute;border-radius:50%;background:rgba(255,255,255,0.6);width:'+size+'px;height:'+size+'px;left:'+(e.clientX-rect.left-size/2)+'px;top:'+(e.clientY-rect.top-size/2)+'px;transform:scale(0);animation:ripple 0.6s linear;pointer-events:none';
              btn.appendChild(ripple);
              setTimeout(function(){ripple.remove()}, 600);
            });
          });
        `}</Script>
        {/* Service Worker Registration with Pre-cache */}
        <Script id="sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              var isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
              if (isLocal) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  registrations.forEach(function(registration) {
                    registration.unregister();
                  });
                });
                if ('caches' in window) {
                  caches.keys().then(function(keys) {
                    keys.forEach(function(key) {
                      caches.delete(key);
                    });
                  });
                }
                return;
              }

              var refreshing = false;
              navigator.serviceWorker.addEventListener('controllerchange', function() {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
              });

              navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function(registration) {
                if (registration.active) {
                  registration.active.postMessage({
                    type: 'CACHE_URLS',
                    urls: ['/', '/settings', '/templates']
                  });
                  registration.active.postMessage({ type: 'CLEAR_OLD_CACHES' });
                }

                registration.addEventListener('updatefound', function() {
                  var newWorker = registration.installing;
                  newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                      newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                    if (newWorker.state === 'activated') {
                      if (registration.active) {
                        registration.active.postMessage({ type: 'CLEAR_OLD_CACHES' });
                      }
                    }
                  });
                });

                registration.update();

                if ('requestIdleCallback' in window) {
                  requestIdleCallback(function() {
                    registration.active && registration.active.postMessage({ type: 'PREFETCH' });
                    registration.active && registration.active.postMessage({ type: 'TRIM_CACHES' });
                  });
                }

                setInterval(function() {
                  registration.update();
                }, 5 * 60 * 1000);
              }).catch(function(error) {
                console.log('SW registration failed:', error);
              });
            });
          }
        `}} />
      </body>
    </html>
  );
}
