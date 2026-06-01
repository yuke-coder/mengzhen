"use client";

// Pure React infinite loop wheel picker - true seamless circular scrolling
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";

export interface DateTimeValue {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// 检测是否为移动端
const isMobileDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export interface WheelDateTimePickerProps {
  value: DateTimeValue;
  onChange: (value: DateTimeValue) => void;
  label: string;
}

const ITEM_HEIGHT = 40;
const VISIBLE_COUNT = 5;

interface WheelPickerColumnProps {
  items: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
  onPreviewChange?: (value: number) => void;
  label: string;
  isDark?: boolean;
}

function WheelPickerColumn({ items, value, onChange, onPreviewChange, label, isDark = false }: WheelPickerColumnProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // offset 可以是任意值（正负无穷），通过取模映射到实际渲染位置
  const [offset, setOffset] = useState(0);
  
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const isTouchDraggingRef = useRef(false); // 移动端触摸拖拽专用
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const velocityRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const wheelThrottleRef = useRef<number>(0);  // 滚轮节流：防止快速连续事件导致动画抖动

  const totalHeight = items.length * ITEM_HEIGHT;

  const currentIndex = useMemo(() => {
    const index = items.findIndex(item => item.value === value);
    return index >= 0 ? index : Math.floor(items.length / 2);
  }, [items, value]);

  // 初始定位：选中项居中（修正：必须减去 containerCenter 偏移，让选中项落在选中指示器中心）
  const centerOffset = (VISIBLE_COUNT * ITEM_HEIGHT) / 2 - ITEM_HEIGHT / 2;
  useEffect(() => {
    setOffset(-(currentIndex * ITEM_HEIGHT) + centerOffset);
  }, [currentIndex]);

  // 将任意 offset 归一化到 [-totalHeight, 0] 区间（用于内部计算）
  const normalizeOffset = useCallback((off: number): number => {
    let n = off % totalHeight;
    if (n > 0) n -= totalHeight;
    return n;
  }, [totalHeight]);

  // 从 offset 推算当前选中的逻辑索引（与渲染 displayPos 算法完全一致）
  // 从 offset 推算当前选中的逻辑索引（与渲染 displayPos 算法完全一致）
  // 渲染时 item 中心位置 = displayPos + ITEM_HEIGHT/2，选中条件：中心 ≈ containerCenter
  // 即 displayPos ≈ containerCenter - ITEM_HEIGHT/2 = centerOffset
  const getSelectedIndex = useCallback((off: number): number => {
    const rawIndex = Math.round((centerOffset - off) / ITEM_HEIGHT);
    return ((rawIndex % items.length) + items.length) % items.length;
  }, [centerOffset, items.length]);

  // 实时预览：offset 变化时更新显示值（rAF 节流，拖动和滚轮统一处理）
  useEffect(() => {
    if (onPreviewChange) {
      const selIdx = getSelectedIndex(offset);
      onPreviewChange(items[selIdx]?.value ?? value);
    }
  }, [offset, onPreviewChange, getSelectedIndex, items, value]);

  // 吸附到最近的选项并触发 onChange
  // 选中项的中心位置 = -(selIdx * ITEM_HEIGHT) + centerOffset
  const snapToNearest = useCallback((currentOffset: number): number => {
    const selIdx = getSelectedIndex(currentOffset);
    if (items[selIdx]?.value !== value) {
      onChange(items[selIdx].value);
    }
    // 吸附位置：使选中项居中
    return -(selIdx * ITEM_HEIGHT) + centerOffset;
  }, [getSelectedIndex, items, value, onChange, centerOffset]);

  // 平滑动画
  const animateTo = useCallback((targetOffset: number, withMomentum = false, onComplete?: () => void, durationMs?: number) => {
    const startOff = offset;
    const duration = durationMs ?? (withMomentum ? 350 : 100);
    const startTime = performance.now();
    const initVel = velocityRef.current;
    isAnimatingRef.current = true;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // 使用 easeOutQuart 缓动，更丝滑
      const ease = 1 - Math.pow(1 - progress, 4);

      let currentOff: number;
      if (withMomentum && progress < 0.5) {
        // 惯性阶段：在前 50% 时间内叠加惯性效果
        const momentumFactor = 1 - progress / 0.5;
        const inertia = initVel * momentumFactor * ITEM_HEIGHT * 8;
        currentOff = startOff + (targetOffset - startOff) * ease + inertia;
      } else {
        currentOff = startOff + (targetOffset - startOff) * ease;
      }

      setOffset(currentOff);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        isAnimatingRef.current = false;
        velocityRef.current = 0;
        setOffset(targetOffset);
        onComplete?.();
      }
    };

    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animate);
  }, [offset]);

  // 释放处理：鼠标拖拽 + 滚轮释放
  const handleRelease = useCallback(() => {
    // 忽略移动端（已在 handleTouchEnd 中处理）
    if (isTouchDraggingRef.current) return;
    
    // 忽略未拖拽的情况
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const hasMomentum = Math.abs(velocityRef.current) > 0.12;
    const snapped = snapToNearest(offset);

    if (hasMomentum && !isAnimatingRef.current) {
      const momentumTarget = snapped + velocityRef.current * ITEM_HEIGHT * 10;
      const finalSnap = snapToNearest(momentumTarget);
      animateTo(finalSnap, true);
    } else {
      animateTo(snapped);
    }
  }, [offset, snapToNearest, animateTo]);

  // --- 鼠标事件 ---
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 移动端触摸设备不响应鼠标事件
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    startYRef.current = e.clientY;
    startOffsetRef.current = offset;
    lastYRef.current = e.clientY;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); isAnimatingRef.current = false; }
  }, [offset]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const now = performance.now();
    const dy = e.clientY - lastYRef.current;
    const dt = now - lastTimeRef.current;
    if (dt > 0) {
      velocityRef.current = velocityRef.current * 0.7 + (dy / dt) * 16 * 0.3;
    }
    lastYRef.current = e.clientY;
    lastTimeRef.current = now;
    setOffset(startOffsetRef.current + (e.clientY - startYRef.current));
  }, []);

  const handleMouseUp = useCallback(() => { handleRelease(); }, [handleRelease]);

  // --- 滚轮事件 ---
  // 鼠标滚轮：直接索引计算+35ms节流防抖，丝滑一格一跳
  const handleWheel = useCallback((e: WheelEvent) => {
    // 移动端触摸设备不响应滚轮事件
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

    e.preventDefault();

    // 节流：快速连续滚轮事件合并(35ms)，防止动画反复取消重启导致卡顿
    const now = performance.now();
    if (now - wheelThrottleRef.current < 35) return;
    wheelThrottleRef.current = now;

    if (animationRef.current) { cancelAnimationFrame(animationRef.current); isAnimatingRef.current = false; }

    // 每次滚轮事件只移动一格（严格一对一）
    const direction = e.deltaY > 0 ? 1 : -1;
    const currentIdx = getSelectedIndex(offset);
    const targetIdx = ((currentIdx + direction) % items.length + items.length) % items.length;
    const targetOffset = -(targetIdx * ITEM_HEIGHT) + centerOffset;

    animateTo(targetOffset, false, () => onChange(items[targetIdx].value), 180);
  }, [offset, getSelectedIndex, animateTo, onChange, items.length]);

  // --- 触摸事件 ---
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // 停止任何正在进行的动画
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    isAnimatingRef.current = false;
    
    isTouchDraggingRef.current = true;
    isDraggingRef.current = true;
    setIsDragging(true);
    const touch = e.touches[0];
    startYRef.current = touch.clientY;
    startOffsetRef.current = offset;
    lastYRef.current = touch.clientY;
    lastTimeRef.current = performance.now();
    velocityRef.current = 0;
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isTouchDraggingRef.current) return;
    
    const touch = e.touches[0];
    const currentY = touch.clientY;
    const currentTime = performance.now();
    
    // 计算与上次的距离
    const dy = currentY - lastYRef.current;
    const dt = currentTime - lastTimeRef.current;
    
    // 使用指数移动平均平滑速度
    if (dt > 0) {
      const instantVelocity = dy / dt;
      velocityRef.current = velocityRef.current * 0.7 + instantVelocity * 0.3;
    }
    
    // 计算总偏移
    const totalDy = currentY - startYRef.current;
    let newOffset = startOffsetRef.current + totalDy;
    
    // 限制偏移范围，防止快速滑动时无限循环计算不稳定
    // 将偏移限制在 ±totalHeight * 2 范围内
    const maxOffset = totalHeight * 2;
    if (newOffset > maxOffset) {
      // 如果超出范围，调整基准位置
      startOffsetRef.current = newOffset - maxOffset;
      newOffset = maxOffset;
    } else if (newOffset < -maxOffset) {
      startOffsetRef.current = newOffset + maxOffset;
      newOffset = -maxOffset;
    }
    
    setOffset(newOffset);
    
    lastYRef.current = currentY;
    lastTimeRef.current = currentTime;
  }, [totalHeight]);

  const handleTouchEnd = useCallback(() => {
    if (!isTouchDraggingRef.current) return;
    isTouchDraggingRef.current = false;
    isDraggingRef.current = false;
    setIsDragging(false);
    
    // 捕获当前状态
    const currentOffset = offset;
    const currentVelocity = velocityRef.current;
    
    // 吸附到最近的选项
    const snapped = snapToNearest(currentOffset);
    
    // 判断是否有足够的惯性速度（pixels per ms）
    const absVelocity = Math.abs(currentVelocity);
    
    // 速度阈值
    if (absVelocity > 0.08 && !isAnimatingRef.current) {
      // 有惯性：计算惯性目标
      const direction = currentVelocity > 0 ? 1 : -1;
      const currentSelIdx = getSelectedIndex(currentOffset);
      const skipItems = Math.min(items.length - 1, Math.max(1, Math.floor(absVelocity * 8)));
      const targetIdx = (currentSelIdx + direction * skipItems + items.length * 10) % items.length;
      
      const targetOffset = -(targetIdx * ITEM_HEIGHT) + centerOffset;
      animateTo(targetOffset, true, undefined, 500);
    } else {
      // 无惯性：直接吸附
      animateTo(snapped, false, undefined, 150);
    }
  }, [offset, snapToNearest, animateTo, items.length, centerOffset, getSelectedIndex]);

  // 点击选择
  const handleClick = useCallback((index: number) => {
    if (isDraggingRef.current || isAnimatingRef.current) return;
    if (items[index]?.value !== value) onChange(items[index].value);
    animateTo(offset - (normalizeOffset(offset) + index * ITEM_HEIGHT) + offset);
  }, [items, value, onChange, animateTo, offset, normalizeOffset]);

  // 全局鼠标事件绑定/解绑
  useEffect(() => {
    if (isDraggingRef.current) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // 原生 wheel 事件（passive: false）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // 清理动画帧
  useEffect(() => {
    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, []);

  // === 核心渲染：真正的无限循环 ===
  // 只渲染 items.length 个元素，通过取模计算每个元素的 translateY 实现循环
  const containerCenter = (VISIBLE_COUNT * ITEM_HEIGHT) / 2;

  return (
    <div className="flex flex-col items-center min-w-0 sm:w-20 sm:min-w-20 flex-1 sm:flex-initial" suppressHydrationWarning>
      <div className={cn("text-xs mb-1", isDark ? "text-zinc-500" : "text-zinc-400")}>{label}</div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg select-none cursor-grab active:cursor-grabbing w-full"
        style={{
          height: ITEM_HEIGHT * VISIBLE_COUNT,
          background: isDark
            ? 'linear-gradient(to bottom, #18181b, #27272a, #18181b)'
            : 'linear-gradient(to bottom, #f4f4f5, #e4e4e7, #f4f4f5)',
          touchAction: 'none',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 选中指示器 */}
        <div
          className="absolute top-1/2 left-0 right-0 -translate-y-1/2 z-10 pointer-events-none"
          style={{
            height: ITEM_HEIGHT,
            background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            borderTop: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
            borderBottom: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
            borderRadius: 4,
          }}
        />

        {/* 循环渲染区域 */}
        <div className="absolute left-0 right-0" suppressHydrationWarning>
          {items.map((item, index) => {
            // 计算元素位置：index * ITEM_HEIGHT + offset
            // 取模后归一化到 [0, totalHeight) 范围
            let displayPos = ((index * ITEM_HEIGHT + offset) % totalHeight + totalHeight) % totalHeight;
            
            // 边界处理：将元素映射到可视区域附近
            // 距离中心超过半屏的元素循环到另一侧
            const halfVisible = VISIBLE_COUNT * ITEM_HEIGHT / 2;
            if (displayPos > containerCenter + halfVisible) {
              displayPos -= totalHeight;
            } else if (displayPos < containerCenter - halfVisible) {
              displayPos += totalHeight;
            }

            // 计算距离中心的距离用于透明度和缩放
            const distFromCenter = Math.abs(displayPos + ITEM_HEIGHT / 2 - containerCenter);
            const maxDist = ITEM_HEIGHT * 2;
            const opacity = Math.max(0.25, 1 - (distFromCenter / maxDist) * 0.75);
            const scale = Math.max(0.85, 1 - (distFromCenter / maxDist) * 0.15);
            const isSelected = distFromCenter < ITEM_HEIGHT / 2;

            // 只渲染在可视范围内的元素（性能优化）
            if (displayPos < -ITEM_HEIGHT || displayPos > VISIBLE_COUNT * ITEM_HEIGHT) return null;

            return (
              <div
                key={`${item.value}-${index}`}
                className={cn(
                  "flex items-center justify-center hover:opacity-80",
                  isSelected
                    ? (isDark ? "text-white font-semibold text-lg" : "text-black font-semibold text-lg")
                    : (isDark ? "text-zinc-500 text-base" : "text-zinc-400 text-base")
                )}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: ITEM_HEIGHT,
                  transform: `translateY(${displayPos}px) scale(${scale})`,
                  opacity,
                  transition: isDragging ? 'none' : 'opacity 150ms ease, transform 150ms ease',
                }}
                onClick={() => handleClick(index)}
                suppressHydrationWarning
              >
                {item.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const WheelDateTimePicker = React.memo(function WheelDateTimePicker({ value, onChange, label }: WheelDateTimePickerProps) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkTheme = () => setIsDark(document.documentElement.classList.contains('dark'));
    checkTheme();
    const obs = new MutationObserver(checkTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // 移动端检测
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const daysInMonth = useCallback((y: number, m: number) => new Date(y, m, 0).getDate(), []);

  // 正式值（松手后确认的）
  const safeValue = useMemo(() => ({
    year: value?.year ?? currentYear,
    month: value?.month ?? currentMonth,
    day: value?.day ?? currentDay,
    hour: value?.hour ?? 0,
    minute: value?.minute ?? 0,
    second: value?.second ?? 0
  }), [value]);

  // === 显示值：ref + 直接DOM写入（零React重渲染） ===
  const displayRef = useRef<DateTimeValue>(safeValue);
  const displayDomRef = useRef<HTMLSpanElement>(null);
  // 同步 ref 到正式值
  useEffect(() => { displayRef.current = safeValue; }, [safeValue]);

  // 格式化并直接写入DOM
  const refreshDisplay = useCallback(() => {
    const el = displayDomRef.current;
    if (!el) return;
    const v = displayRef.current;
    el.textContent = `${v.year}-${String(v.month).padStart(2,'0')}-${String(v.day).padStart(2,'0')} ${String(v.hour).padStart(2,'0')}:${String(v.minute).padStart(2,'0')}:${String(v.second).padStart(2,'0')}`;
  }, []);

  // 统一的预览回调：只更新ref + rAF刷新DOM（拖动/滚轮共用，零setState）
  const handlePreviewChange = useCallback((key: keyof DateTimeValue) => (val: number) => {
    if (displayRef.current[key] === val) return;
    displayRef.current = { ...displayRef.current, [key]: val };
    requestAnimationFrame(refreshDisplay);
  }, [refreshDisplay]);

  // 正式 onChange：同步ref + 刷新DOM + 通知父组件
  const handleChange = (key: keyof DateTimeValue) => (val: number) => {
    const base = displayRef.current;
    const next = { ...base, [key]: val };
    if (key === 'year' || key === 'month') next.day = Math.min(next.day, daysInMonth(next.year, next.month));
    displayRef.current = next;
    refreshDisplay();
    onChange(next);
  };

  const makeOptions = (count: number, start = 0, pad = 2) =>
    Array.from({ length: count }, (_, i) => ({ value: start + i, label: String(start + i).padStart(pad, '0') }));

  const yearOptions = useMemo(() => makeOptions(21, currentYear - 10, 0), [currentYear]);
  const monthOptions = useMemo(() => makeOptions(12, 1), []);
  const dayOptions = useMemo(() => makeOptions(daysInMonth(safeValue.year, safeValue.month), 1), [safeValue.year, safeValue.month, daysInMonth]);
  const hourOptions = useMemo(() => makeOptions(24), []);
  const minuteOptions = useMemo(() => makeOptions(60), []);
  const secondOptions = useMemo(() => makeOptions(60), []);

  // 桌面端：年、月、日、时、分、秒
  const desktopColumns = [
    { options: yearOptions, key: 'year' as const, label: '年' },
    { options: monthOptions, key: 'month' as const, label: '月' },
    { options: dayOptions, key: 'day' as const, label: '日' },
    { options: hourOptions, key: 'hour' as const, label: '时' },
    { options: minuteOptions, key: 'minute' as const, label: '分' },
    { options: secondOptions, key: 'second' as const, label: '秒' },
  ];

  // 移动端：日、时、分
  const mobileColumns = [
    { options: dayOptions, key: 'day' as const, label: '日' },
    { options: hourOptions, key: 'hour' as const, label: '时' },
    { options: minuteOptions, key: 'minute' as const, label: '分' },
  ];

  const columns = isMobile ? mobileColumns : desktopColumns;

  return (
    <div className="w-full">
      <div className={cn("text-sm mb-2 flex justify-between items-center", isDark ? "text-zinc-400" : "text-zinc-500")}>
        <span>{label}</span>
        <span ref={displayDomRef} className="font-mono text-xs tabular-nums opacity-70" suppressHydrationWarning>
          {safeValue.year}-{String(safeValue.month).padStart(2,'0')}-{String(safeValue.day).padStart(2,'0')} {String(safeValue.hour).padStart(2,'0')}:{String(safeValue.minute).padStart(2,'0')}:{String(safeValue.second).padStart(2,'0')}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {columns.map(col => (
          <WheelPickerColumn
            key={col.key}
            items={col.options}
            value={safeValue[col.key]}
            onChange={handleChange(col.key)}
            onPreviewChange={handlePreviewChange(col.key)}
            label={col.label}
            isDark={isDark}
          />
        ))}
      </div>
    </div>
  );
})