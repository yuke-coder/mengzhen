"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
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
  onAutoClose?: () => void;
}

interface NonBlockingToastContextValue {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const NonBlockingToastContext = createContext<NonBlockingToastContextValue | null>(null);

export function useNonBlockingToast() {
  const ctx = useContext(NonBlockingToastContext);
  if (!ctx) throw new Error("useNonBlockingToast must be used within NonBlockingToastProvider");
  return ctx;
}

const TOTAL_DURATION = 2000;
const FADE_DURATION = 500;

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
  const dismissedRef = useRef(false);
  const cancelledRef = useRef(false); // 撤销或手动关闭时标记为 true
  const onAutoCloseRef = useRef(toast.onAutoClose);

  // 保持 ref 同步
  onAutoCloseRef.current = toast.onAutoClose;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    timerRef.current = null;
    fadeTimerRef.current = null;
  }, []);

  const doDismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    setVisible(false);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [onDismiss, toast.id]);

  const scheduleAutoClose = useCallback(() => {
    const remaining = TOTAL_DURATION - elapsedRef.current;
    if (remaining <= 0) {
      if (!cancelledRef.current) onAutoCloseRef.current?.();
      doDismiss();
      return;
    }

    const fadeAt = Math.max(0, remaining - FADE_DURATION);
    if (fadeAt > 0) {
      fadeTimerRef.current = setTimeout(() => setFading(true), fadeAt);
    } else {
      setFading(true);
    }

    timerRef.current = setTimeout(() => {
      console.log("[Toast] Timer expired, cancelledRef=", cancelledRef.current);
      if (!cancelledRef.current) onAutoCloseRef.current?.();
      doDismiss();
    }, remaining);
  }, [doDismiss]);

  const startCountdown = useCallback(() => {
    clearTimers();
    startRef.current = Date.now();
    scheduleAutoClose();
  }, [clearTimers, scheduleAutoClose]);

  useEffect(() => {
    startCountdown();
    return clearTimers;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (!cancelledRef.current) onAutoCloseRef.current?.();
      doDismiss();
    }
  }, [startCountdown, doDismiss]);

  const handleUndo = useCallback(() => {
    cancelledRef.current = true; // 撤销：阻止 onAutoClose
    toast.undoAction?.();
    clearTimers();
    doDismiss();
  }, [toast, clearTimers, doDismiss]);

  const handleClose = useCallback(() => {
    cancelledRef.current = true; // 手动关闭：阻止 onAutoClose
    clearTimers();
    doDismiss();
  }, [clearTimers, doDismiss]);

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg border select-none"
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
      <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--brand-end)" }} />
      <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--popover-foreground)" }}>
        {toast.message}
      </span>
      {toast.undoAction && (
        <button
          onClick={handleUndo}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all duration-200 hover:opacity-80 active:scale-95 shrink-0"
          style={{ background: "linear-gradient(135deg, var(--brand-start), var(--brand-end))", color: "white" }}
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

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <NonBlockingToastContext.Provider value={{ showToast, dismissToast, dismissAll }}>
      {children}
      <div className="fixed top-16 left-0 right-0 z-[9999] flex flex-col items-center gap-2 pointer-events-none" style={{ paddingTop: "8px" }}>
        {toasts.map((toast) => (
          <ToastInstance key={toast.id} toast={toast} onDismiss={dismissToast} />
        ))}
      </div>
    </NonBlockingToastContext.Provider>
  );
}
