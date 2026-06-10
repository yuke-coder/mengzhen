"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { Undo2, CheckCircle2, X } from "lucide-react";

interface ToastItem {
  id: string;
  message: string;
  undoAction?: () => void;
  undoLabel?: string;
}

interface NonBlockingToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

const NonBlockingToastContext = createContext<NonBlockingToastContextValue | null>(null);

export function useNonBlockingToast() {
  const ctx = useContext(NonBlockingToastContext);
  if (!ctx) throw new Error("useNonBlockingToast must be used within NonBlockingToastProvider");
  return ctx;
}

// 单个弹窗实例
function ToastInstance({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [fading, setFading] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef(0);
  const startRef = useRef<number>(0);
  const TOTAL_DURATION = 2000;
  const FADE_DURATION = 500;

  // 入场动画
  useState(() => {
    requestAnimationFrame(() => setVisible(true));
  });

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    timerRef.current = null;
    fadeTimerRef.current = null;
  }, []);

  const startCountdown = useCallback(() => {
    clearTimers();
    startRef.current = Date.now();

    // 在 TOTAL_DURATION - FADE_DURATION 时开始渐隐
    const remaining = TOTAL_DURATION - elapsedRef.current;
    const fadeAt = Math.max(0, remaining - FADE_DURATION);

    if (fadeAt > 0) {
      fadeTimerRef.current = setTimeout(() => {
        setFading(true);
      }, fadeAt);
    } else {
      setFading(true);
    }

    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, remaining);
  }, [clearTimers, onDismiss, toast.id]);

  // 启动倒计时
  useState(() => {
    startCountdown();
  });

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
    clearTimers();
    elapsedRef.current += Date.now() - startRef.current;
    setFading(false);
  }, [clearTimers]);

  const handleMouseLeave = useCallback(() => {
    setHovered(false);
    if (elapsedRef.current < TOTAL_DURATION) {
      startCountdown();
    } else {
      onDismiss(toast.id);
    }
  }, [startCountdown, onDismiss, toast.id]);

  const handleUndo = useCallback(() => {
    toast.undoAction?.();
    clearTimers();
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [toast, clearTimers, onDismiss]);

  const handleClose = useCallback(() => {
    clearTimers();
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [clearTimers, onDismiss, toast.id]);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg border transition-all duration-300 select-none"
      style={{
        position: "relative",
        background: "var(--popover)",
        borderColor: "var(--border)",
        opacity: visible ? (fading ? 0.4 : 1) : 0,
        transform: visible ? "translateY(0)" : "translateY(-12px)",
        transition: "opacity 0.5s ease, transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        pointerEvents: "auto",
        boxShadow: hovered
          ? "0 8px 32px -4px rgba(0,0,0,0.15), 0 0 0 1px var(--border)"
          : "0 4px 16px -2px rgba(0,0,0,0.1), 0 0 0 1px var(--border)",
      }}
    >
      <CheckCircle2
        className="w-4 h-4 shrink-0"
        style={{ color: "var(--brand-end)" }}
      />
      <span
        className="text-sm font-medium whitespace-nowrap"
        style={{ color: "var(--popover-foreground)" }}
      >
        {toast.message}
      </span>
      {toast.undoAction && (
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200 hover:opacity-80 active:scale-95 shrink-0"
          style={{
            background: "linear-gradient(135deg, var(--brand-start), var(--brand-end))",
            color: "white",
          }}
        >
          <Undo2 className="w-3 h-3" />
          {toast.undoLabel || "撤销"}
        </button>
      )}
      <button
        onClick={handleClose}
        className="shrink-0 p-0.5 rounded transition-colors hover:bg-[var(--muted)]"
        style={{ color: "var(--muted-foreground)" }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function NonBlockingToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NonBlockingToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      {/* 弹窗容器 - 固定在顶部居中，非阻塞 */}
      <div
        className="fixed top-16 left-0 right-0 z-[9999] flex flex-col items-center gap-2 pointer-events-none"
        style={{ paddingTop: "8px" }}
      >
        {toasts.map((toast) => (
          <ToastInstance key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </NonBlockingToastContext.Provider>
  );
}
