'use client';

import { useMemo, useState, useEffect } from 'react';
import { useTheme } from '@/lib/theme-context';
import { usePathname } from 'next/navigation';

export default function DynamicBackground() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 服务端渲染时默认使用暗色背景，避免 hydration 不匹配
  const isDark = mounted ? resolvedTheme === 'dark' : true;

  // 生成星星位置的函数（暗色模式）
  const generateStars = (count: number, seed: number) => {
    const stars = [];
    for (let i = 0; i < count; i++) {
      const x = ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280 * 2000;
      const y = ((seed * (i + 1) * 49297 + 9301) % 233280) / 233280 * 2000;
      stars.push(`${x.toFixed(1)}px ${y.toFixed(1)}px #FFF`);
    }
    return stars.join(',');
  };

  const stars1 = useMemo(() => generateStars(700, 1), []);
  const stars2 = useMemo(() => generateStars(200, 2), []);
  const stars3 = useMemo(() => generateStars(100, 3), []);

  // 登录/注册页面有自己的渐变背景，不渲染全局背景（必须在所有 hooks 之后）
  if (pathname?.startsWith('/auth/')) return null;

  if (isDark) {
    return (
      <>
        <style jsx>{`
          .star-container {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(ellipse at bottom, #1B2735 0%, #090A0F 100%);
            z-index: -1;
          }
          
          .stars {
            position: absolute;
            background: transparent;
          }
          
          .stars-1 {
            width: 1px;
            height: 1px;
            box-shadow: ${stars1};
            animation: animStar 50s linear infinite;
          }
          
          .stars-1::after {
            content: " ";
            position: absolute;
            top: 2000px;
            width: 1px;
            height: 1px;
            background: transparent;
            box-shadow: ${stars1};
          }
          
          .stars-2 {
            width: 2px;
            height: 2px;
            box-shadow: ${stars2};
            animation: animStar 100s linear infinite;
          }
          
          .stars-2::after {
            content: " ";
            position: absolute;
            top: 2000px;
            width: 2px;
            height: 2px;
            background: transparent;
            box-shadow: ${stars2};
          }
          
          .stars-3 {
            width: 3px;
            height: 3px;
            box-shadow: ${stars3};
            animation: animStar 150s linear infinite;
          }
          
          .stars-3::after {
            content: " ";
            position: absolute;
            top: 2000px;
            width: 3px;
            height: 3px;
            background: transparent;
            box-shadow: ${stars3};
          }
          
          @keyframes animStar {
            from {
              transform: translateY(0px);
            }
            to {
              transform: translateY(-2000px);
            }
          }
        `}</style>
        <div className="star-container">
          <div className="stars stars-1" />
          <div className="stars stars-2" />
          <div className="stars stars-3" />
        </div>
      </>
    );
  }

  return (
    <>
      <style jsx>{`
        .grid-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: -1;
          background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAABnSURBVHja7M5RDYAwDEXRDgmvEocnlrQS2SwUFST9uEfBGWs9c97nbGtDcquqiKhOImLs/UpuzVzWEi1atGjRokWLFi1atGjRokWLFi1atGjRokWLFi1af7Ukz8xWp8z8AAAA//8DAJ4LoEAAlL1nAAAAAElFTkSuQmCC") repeat 0 0;
          background-color: #ffffff;
          animation: bg-scrolling-reverse 0.92s infinite linear;
        }
        
        .grid-container::before {
          content: "灵图";
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 8rem;
          font-weight: 100;
          font-style: normal;
          color: rgba(0, 0, 0, 0.03);
          pointer-events: none;
          white-space: nowrap;
        }
        
        @keyframes bg-scrolling-reverse {
          0% {
            background-position: 50px 50px;
          }
          100% {
            background-position: 0 0;
          }
        }
      `}</style>
      <div className="grid-container" />
    </>
  );
}
