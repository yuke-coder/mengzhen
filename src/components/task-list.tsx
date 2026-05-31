"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  ScheduledTask,
  TaskStatus,
  TaskExecPhase,
  REPEAT_TYPE_LABELS,
  getTaskStatus,
  getNextExecuteDate,
  TaskAudio,
} from "@/lib/task-types";
import { deleteTask, updateTask, getAllTasks, saveAllTasks } from "@/lib/task-store";
import { getTaskScheduler, type SchedulerEvent } from "@/lib/task-scheduler";
import { FeedbackModal, type FeedbackType } from "@/components/feedback-modal";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Trash2,
  Edit3,
  XCircle,
  Clock,
  Music2,
  Repeat,
  CalendarClock,
  CheckCircle2,
  Loader2,
  PauseCircle,
  Volume2,
  HardDrive,
  GripVertical,
  Play,
  PlayCircle,
  TrendingUp,
  TrendingDown,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

interface TaskListProps {
  tasks: ScheduledTask[];
  onEdit: (task: ScheduledTask) => void;
  onRefresh: () => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 1024) return "0 B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatCountdownTime(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StatusBadge({ task, status, phase }: { task: ScheduledTask; status: TaskStatus; phase: TaskExecPhase | "idle" }) {
  const scheduler = useMemo(() => getTaskScheduler(), []);

  const getTaskStartTimestamp = useCallback((t: ScheduledTask) => {
    return new Date(
      t.startTime.year, t.startTime.month - 1, t.startTime.day,
      t.startTime.hour, t.startTime.minute, t.startTime.second
    ).getTime();
  }, []);

  const computeRemaining = useCallback((s: TaskStatus, p: TaskExecPhase | "idle") => {
    const now = Date.now();

    if (s === "cancelled" && task.skipUntil && now < task.skipUntil) {
      return Math.max(0, task.skipUntil - now);
    }

    if (s === "pending") {
      const nextExec = getNextExecuteDate(task);
      if (nextExec) {
        const fadeInMs = (task.fadeInDuration || 0) * 1000;
        const audioStartAt = nextExec.getTime() - fadeInMs;
        return Math.max(0, audioStartAt - now);
      }
      return 0;
    }

    if (s === "executing") {
      const actualStart = task.lastExecutedAt || getTaskStartTimestamp(task);
      const endTime = actualStart + task.playDurationMinutes * 60 * 1000;
      const fadeInMs = (task.fadeInDuration || 0) * 1000;
      const fadeOutMs = (task.fadeOutDuration || 0) * 1000;

      if (p === "fading-in") {
        const fadeInEnd = actualStart + fadeInMs;
        return Math.max(0, fadeInEnd - now);
      }
      if (p === "playing") {
        return Math.max(0, endTime - now);
      }
      if (p === "fading-out") {
        return Math.max(0, endTime + fadeOutMs - now);
      }
      return Math.max(0, endTime - now);
    }

    if (s === "completed" && task.repeatType !== "once") {
      const nextExec = getNextExecuteDate(task);
      if (nextExec) {
        return Math.max(0, nextExec.getTime() - now);
      }
    }

    return 0;
  }, [task, getTaskStartTimestamp]);

  const [remainingMs, setRemainingMs] = useState(() => computeRemaining(status, phase));

  const isActive = status === "executing" || status === "pending" || (status === "completed" && task.repeatType !== "once") || (status === "cancelled" && !!task.skipUntil);

  useEffect(() => {
    if (!isActive) return;

    const update = () => {
      setRemainingMs(computeRemaining(status, phase));
    };

    update();
    const interval = isActive && status === "executing" ? 1000 : 5000;
    const timer = setInterval(update, interval);
    return () => clearInterval(timer);
  }, [status, phase, isActive, computeRemaining]);

  useEffect(() => {
    const handleEvent = (event: SchedulerEvent) => {
      if (event.taskId !== task.id) return;
      if (event.type === "tick" || event.type === "phase-change") {
        setRemainingMs(computeRemaining(status, phase));
      }
    };
    const unsub = scheduler.on(handleEvent);
    return () => { unsub(); };
  }, [task.id, status, phase, scheduler, computeRemaining]);

  const relativeTime = useMemo(() => {
    if (status === "pending") {
      return `等待中 ${formatCountdownTime(remainingMs)}`;
    } else if (status === "executing") {
      if (phase === "fading-in") {
        return `渐入中 ${formatCountdownTime(remainingMs)}`;
      } else if (phase === "playing") {
        return `播放中 ${formatCountdownTime(remainingMs)}`;
      } else if (phase === "fading-out") {
        return `渐出中 ${formatCountdownTime(remainingMs)}`;
      } else {
        return `播放中 ${formatCountdownTime(remainingMs)}`;
      }
    } else if (status === "completed") {
      if (task.repeatType !== "once") {
        return `已完成 ${formatCountdownTime(remainingMs)}`;
      }
      return "已完成";
    } else {
      if (task.skipUntil && remainingMs > 0) {
        return `已取消 ${formatCountdownTime(remainingMs)}`;
      }
      return "已取消";
    }
  }, [status, phase, remainingMs, task.repeatType]);

  const config = useMemo(() => {
    if (status === "pending") {
      return { icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" };
    }
    if (status === "executing") {
      if (phase === "fading-in") {
        return { icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" };
      }
      if (phase === "fading-out") {
        return { icon: TrendingDown, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" };
      }
      return { icon: Play, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
    }
    if (status === "completed") {
      return { icon: CheckCircle2, color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" };
    }
    return { icon: PauseCircle, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" };
  }, [status, phase]);

  const Icon = config.icon;

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border", config.bg, config.border, config.color)}>
      <Icon className={cn("w-3 h-3", status === "executing" && phase === "playing" && "animate-pulse")} />
      <span>{relativeTime}</span>
    </div>
  );
}

function audioInfoDisplay(audio: TaskAudio) {
  const info = [];
  if (audio.size > 0) {
    info.push(
      <span key="size" className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
        <HardDrive className="w-2.5 h-2.5" />
        {formatFileSize(audio.size)}
      </span>
    );
  }
  if (audio.duration > 0) {
    info.push(
      <span key="duration" className="text-[10px] text-muted-foreground/60">
        {formatDuration(audio.duration)}
      </span>
    );
  }
  if (info.length > 0) {
    return (
      <span className="flex items-center gap-1 ml-2">
        {info.map((item, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="text-muted-foreground/30">·</span>}
            {item}
          </React.Fragment>
        ))}
      </span>
    );
  }
  return null;
}

function useTaskState(task: ScheduledTask) {
  const scheduler = useMemo(() => getTaskScheduler(), []);
  const [status, setStatus] = useState<TaskStatus>(() => {
    const phase = scheduler.getTaskPhase(task.id);
    if (phase === 'fading-in' || phase === 'playing' || phase === 'fading-out') return 'executing';
    return getTaskStatus(task);
  });
  const [phase, setPhase] = useState<TaskExecPhase | "idle">(() => {
    const p = scheduler.getTaskPhase(task.id);
    if (p === 'fading-in' || p === 'playing' || p === 'fading-out') return p;
    const s = getTaskStatus(task);
    if (s === "pending") return "waiting";
    return "idle";
  });

  useEffect(() => {
    const update = () => {
      const currentPhase = scheduler.getTaskPhase(task.id);
      let newStatus: TaskStatus;
      if (currentPhase === 'fading-in' || currentPhase === 'playing' || currentPhase === 'fading-out') {
        newStatus = 'executing';
      } else {
        const latestTask = getAllTasks().find(t => t.id === task.id);
        newStatus = getTaskStatus(latestTask || task);
      }
      setStatus(newStatus);
      setPhase(currentPhase);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [task, scheduler]);

  useEffect(() => {
    const handleEvent = (event: SchedulerEvent) => {
      if (event.taskId !== task.id) return;
      if (event.type === "phase-change") {
        const newPhase = event.phase as TaskExecPhase | "idle";
        let newStatus: TaskStatus;
        if (newPhase === "fading-in" || newPhase === "playing" || newPhase === "fading-out") {
          newStatus = "executing";
        } else {
          const latestTask = getAllTasks().find(t => t.id === task.id);
          newStatus = getTaskStatus(latestTask || task);
        }
        setPhase(newPhase);
        setStatus(newStatus);
      } else if (event.type === "task-started") {
        const newPhase = event.phase as TaskExecPhase;
        setStatus("executing");
        setPhase(newPhase);
      } else if (event.type === "task-completed") {
        setStatus("completed");
        setPhase("idle");
      } else if (event.type === "task-cancelled") {
        setStatus("cancelled");
        setPhase("idle");
      } else if (event.type === "task-resumed") {
        const latestTask = getAllTasks().find(t => t.id === task.id);
        const newStatus = getTaskStatus(latestTask || task);
        setStatus(newStatus);
        setPhase("waiting");
      }
    };
    const unsub = scheduler.on(handleEvent);
    return () => { unsub(); };
  }, [task.id, task, scheduler]);

  return { status, phase };
}

interface TaskItemProps {
  task: ScheduledTask;
  index: number;
  isDragging: boolean;
  isSwapAnimating: boolean;
  isMobileDragTarget: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onEdit: (task: ScheduledTask) => void;
  onDelete: (task: ScheduledTask) => void;
  onCancel: (task: ScheduledTask) => void;
  onRefresh: () => void;
  onTouchStart?: (e: React.TouchEvent, index: number) => void;
}

function TaskItem({
  task,
  index,
  isDragging,
  isSwapAnimating,
  isMobileDragTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onEdit,
  onDelete,
  onCancel,
  onRefresh,
  onTouchStart,
}: TaskItemProps) {
  const { status, phase } = useTaskState(task);
  const isMobile = useIsMobile();
  const [showActions, setShowActions] = useState(false);
  const firstAudio = task.audios[0];
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showActions) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setShowActions(false);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showActions]);

  const statusLabel = cn(
    "text-[11px] font-medium flex-shrink-0",
    status === "executing" && phase === "fading-in" && "text-cyan-400",
    status === "executing" && phase === "playing" && "text-emerald-400",
    status === "executing" && phase === "fading-out" && "text-amber-400",
    status === "completed" && "text-zinc-400",
    status === "cancelled" && "text-amber-400",
    status === "pending" && "text-[var(--brand-start)]"
  );

  const statusText =
    status === "executing" && phase === "fading-in" ? "渐入中" :
    status === "executing" && phase === "playing" ? "播放中" :
    status === "executing" && phase === "fading-out" ? "渐出中" :
    status === "completed" ? "已播放" :
    status === "cancelled" ? "已取消播放" :
    "即将播放";

  const borderClass = isDragging
    ? "border-[var(--brand-start)] shadow-lg shadow-[var(--brand-start)]/15 scale-[1.02] opacity-80 z-10"
    : status === "executing" && phase === "fading-in"
      ? "border-cyan-500/30"
      : status === "executing" && phase === "playing"
        ? "border-emerald-500/30"
        : status === "executing" && phase === "fading-out"
          ? "border-amber-500/30"
          : status === "executing"
            ? "border-emerald-500/30"
            : status === "cancelled"
              ? "opacity-60"
              : "hover:border-border";

  const diffuseClass = isDragging
    ? ""
    : status === "executing" && phase === "fading-in"
      ? "task-diffuse-fadein"
      : status === "executing" && phase === "playing"
        ? "task-diffuse-playing"
        : status === "executing" && phase === "fading-out"
          ? "task-diffuse-fadeout"
          : status === "executing"
            ? "task-diffuse-playing"
            : status === "pending"
              ? "task-diffuse-waiting"
              : "";

  const repeatBadge = (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border flex-shrink-0",
      task.repeatType === "once"
        ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
        : task.repeatType === "daily"
          ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
          : task.repeatType === "workday"
            ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
            : "bg-rose-500/10 border-rose-500/20 text-rose-400"
    )}>
      <Repeat className="w-2.5 h-2.5 mr-0.5" />
      {REPEAT_TYPE_LABELS[task.repeatType]}
    </span>
  );

  const infoRow = (
    <div className="flex items-center gap-1.5 sm:gap-2 mt-1.5 sm:mt-1 text-[12px] sm:text-[11px] text-muted-foreground flex-wrap leading-relaxed">
      <span className="flex items-center gap-0.5 sm:gap-1">
        <Clock className="w-3 h-3 sm:w-3 sm:h-3" />
        {task.startTime.month}/{task.startTime.day} {String(task.startTime.hour).padStart(2, "0")}:{String(task.startTime.minute).padStart(2, "0")}
      </span>
      <span className="text-muted-foreground/40">·</span>
      <span>{task.playDurationMinutes}分钟</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="flex items-center gap-0.5">
        <Volume2 className="w-3 h-3 sm:w-3 sm:h-3" />
        {task.volume}%
      </span>
      {task.fadeInDuration > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-0.5">
            <TrendingUp className="w-3 h-3 sm:w-3 sm:h-3" />
            渐入{task.fadeInDuration}秒
          </span>
        </>
      )}
      {task.fadeOutDuration > 0 && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-0.5">
            <TrendingDown className="w-3 h-3 sm:w-3 sm:h-3" />
            渐出{task.fadeOutDuration}秒
          </span>
        </>
      )}
    </div>
  );

  const audioRow = (
    <div className="mt-3 sm:mt-2.5 flex items-start gap-2.5 sm:gap-2 p-2.5 sm:p-0 rounded-lg sm:rounded-none bg-muted/30 sm:bg-transparent">
      <span className={cn(statusLabel, "flex-shrink-0")}>{statusText}</span>
      {firstAudio && (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Music2 className="w-3.5 h-3.5 sm:w-3 sm:h-3 text-muted-foreground/50 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[12px] sm:text-[11px] text-muted-foreground break-words leading-relaxed">{firstAudio.name}</span>
            {audioInfoDisplay(firstAudio) && (
              <div className="mt-0.5 sm:mt-0">{audioInfoDisplay(firstAudio)}</div>
            )}
          </div>
        </div>
      )}
      {task.audios.length > 1 && (
        <span className="text-[11px] sm:text-[10px] text-muted-foreground/60 flex-shrink-0 bg-muted/50 px-1.5 py-0.5 rounded sm:bg-transparent sm:px-0 sm:py-0">
          +{task.audios.length - 1}
        </span>
      )}
    </div>
  );

  const desktopActions = (
    <div className="flex items-center gap-1 flex-shrink-0">
      {status !== "cancelled" && status !== "completed" && status !== "executing" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const sched = getTaskScheduler();
            sched.executeNow(task.id);
            onRefresh();
            toast.success(`任务「${task.name}」已开始执行`);
          }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer"
          title="立即执行"
        >
          <PlayCircle className="w-3.5 h-3.5" />
        </button>
      )}
      {status !== "cancelled" && status !== "completed" && (
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(task); }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer"
          title="取消执行"
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
      {status === "cancelled" && task.skipUntil && task.repeatType !== "once" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const sched = getTaskScheduler();
            sched.resumeTask(task.id);
            toast.success(`任务「${task.name}」已恢复执行`);
          }}
          className="p-1.5 rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-all cursor-pointer"
          title="恢复执行"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(task); }}
        className="p-1.5 rounded-md text-muted-foreground hover:text-[var(--brand-start)] hover:bg-[var(--brand-start)]/10 transition-all cursor-pointer"
        title="编辑任务"
      >
        <Edit3 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(task); }}
        className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
        title="删除任务"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const mobileActions = (
    <div ref={actionsRef} className="relative flex-shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setShowActions(!showActions); }}
        className="p-2.5 sm:p-2 rounded-xl sm:rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted transition-all cursor-pointer min-w-[40px] sm:min-w-[36px] min-h-[40px] sm:min-h-[36px] flex items-center justify-center border border-border/30 hover:border-border/50"
        title="更多操作"
      >
        <MoreHorizontal className="w-4.5 h-4.5 sm:w-4 sm:h-4" />
      </button>
      {showActions && (
        <div className="absolute right-0 top-full mt-1.5 sm:mt-1 z-50 bg-card/95 backdrop-blur-xl border border-border/60 rounded-xl shadow-xl py-1.5 sm:py-1 min-w-[150px] sm:min-w-[140px]">
          {status !== "cancelled" && status !== "completed" && status !== "executing" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const sched = getTaskScheduler();
                sched.executeNow(task.id);
                onRefresh();
                toast.success(`任务「${task.name}」已开始执行`);
                setShowActions(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-emerald-500/10 active:bg-emerald-500/15 transition-colors cursor-pointer min-h-[48px] sm:min-h-[44px]"
            >
              <PlayCircle className="w-4 h-4 text-emerald-400" />
              立即执行
            </button>
          )}
          {status !== "cancelled" && status !== "completed" && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(task); setShowActions(false); }}
              className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-amber-500/10 active:bg-amber-500/15 transition-colors cursor-pointer min-h-[48px] sm:min-h-[44px]"
            >
              <XCircle className="w-4 h-4 text-amber-400" />
              取消执行
            </button>
          )}
          {status === "cancelled" && task.skipUntil && task.repeatType !== "once" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const sched = getTaskScheduler();
                sched.resumeTask(task.id);
                toast.success(`任务「${task.name}」已恢复执行`);
                setShowActions(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-emerald-500/10 active:bg-emerald-500/15 transition-colors cursor-pointer min-h-[48px] sm:min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4 text-emerald-400" />
              恢复执行
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(task); setShowActions(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-[var(--brand-start)]/10 active:bg-[var(--brand-start)]/15 transition-colors cursor-pointer min-h-[48px] sm:min-h-[44px]"
          >
            <Edit3 className="w-4 h-4 text-[var(--brand-start)]" />
            编辑任务
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(task); setShowActions(false); }}
            className="w-full flex items-center gap-3 px-4 py-3 sm:py-2.5 text-sm text-foreground hover:bg-red-500/10 active:bg-red-500/15 transition-colors cursor-pointer min-h-[48px] sm:min-h-[44px]"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
            删除任务
          </button>
        </div>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <div
        onTouchStart={onTouchStart ? (e) => onTouchStart(e, index) : undefined}
        className={cn(
          "backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden transition-all duration-200 bg-card",
          isSwapAnimating && "transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          isDragging && "opacity-60 scale-[0.97]",
          isMobileDragTarget && "border-[var(--brand-start)]/50 bg-[var(--brand-start)]/5",
          borderClass,
          diffuseClass
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-glow)]/20 to-transparent" />
        <div className="p-4 sm:p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <p className="font-semibold text-[15px] text-foreground truncate">{task.name}</p>
                {repeatBadge}
              </div>
              {infoRow}
            </div>
            <StatusBadge task={task} />
          </div>
          {audioRow}

          {/* 移动端操作按钮 - 直接显示所有控件，优化点击区域 */}
          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="flex items-center justify-end gap-1.5">
              {status !== "cancelled" && status !== "completed" && status !== "executing" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const sched = getTaskScheduler();
                    sched.executeNow(task.id);
                    onRefresh();
                    toast.success(`任务「${task.name}」已开始执行`);
                  }}
                  className="p-2.5 rounded-xl text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/15 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="立即执行"
                >
                  <PlayCircle className="w-5 h-5" />
                </button>
              )}
              {status !== "cancelled" && status !== "completed" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCancel(task); }}
                  className="p-2.5 rounded-xl text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 active:bg-amber-500/15 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="取消执行"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              )}
              {status === "cancelled" && task.skipUntil && task.repeatType !== "once" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const sched = getTaskScheduler();
                    sched.resumeTask(task.id);
                    toast.success(`任务「${task.name}」已恢复执行`);
                  }}
                  className="p-2.5 rounded-xl text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/15 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                  title="恢复执行"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                className="p-2.5 rounded-xl text-muted-foreground hover:text-[var(--brand-start)] hover:bg-[var(--brand-start)]/10 active:bg-[var(--brand-start)]/15 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="编辑任务"
              >
                <Edit3 className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(task); }}
                className="p-2.5 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 active:bg-red-500/15 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="删除任务"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={cn(
        "group/task backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 bg-card",
        isSwapAnimating
          ? "transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          : "transition-all duration-200",
        borderClass,
        diffuseClass
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-glow)]/20 to-transparent" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={onDragEnd}
              className="flex-shrink-0 w-5 cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover/task:opacity-100 transition-opacity"
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover/task:text-muted-foreground transition-colors" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium text-sm text-foreground truncate">{task.name}</p>
              {repeatBadge}
              {desktopActions}
            </div>
            {infoRow}
          </div>
          <StatusBadge task={task} />
        </div>
        {audioRow}
      </div>
    </div>
  );
}

export function TaskList({ tasks, onEdit, onRefresh }: TaskListProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [isSwapAnimating, setIsSwapAnimating] = useState(false);
  const dragTaskOrderRef = useRef<string[]>([]);

  // 移动端触摸拖拽状态
  const [mobileDragIndex, setMobileDragIndex] = useState<number | null>(null);
  const [mobileOverIndex, setMobileOverIndex] = useState<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef = useRef<number>(0);
  const isMobileDraggingRef = useRef<boolean>(false);
  const mobileDragIndexRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scheduler = getTaskScheduler();
    const unsub = scheduler.on((event) => {
      if (event.type === "task-started" || event.type === "task-cancelled" || event.type === "task-resumed") {
        onRefresh();
      }
    });
    return () => { unsub(); };
  }, [onRefresh]);

  const handleDelete = useCallback((task: ScheduledTask) => {
    setDeleteConfirmId(task.id);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirmId) return;
    const task = tasks.find((t) => t.id === deleteConfirmId);
    // 先强制停止调度器中正在执行的播放，再删除数据
    const scheduler = getTaskScheduler();
    scheduler.forceStopPlayback(deleteConfirmId);
    const success = deleteTask(deleteConfirmId);
    if (success) {
      toast.success(`任务「${task?.name || "任务"}」已被删除`);
      onRefresh();
    } else {
      toast.error("删除失败，未找到该任务");
    }
    setDeleteConfirmId(null);
  }, [deleteConfirmId, tasks, onRefresh]);

  const handleCancel = useCallback((task: ScheduledTask) => {
    const scheduler = getTaskScheduler();
    scheduler.cancelTask(task.id);
    toast.info(`任务「${task.name}」已终止执行`);
    onRefresh();
  }, [onRefresh]);

  const deleteTaskData = useMemo(() => {
    if (!deleteConfirmId) return null;
    return tasks.find((t) => t.id === deleteConfirmId);
  }, [deleteConfirmId, tasks]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const statusOrder: Record<TaskStatus, number> = {
        executing: 0,
        pending: 1,
        completed: 2,
        cancelled: 3,
      };
      const sa = statusOrder[getTaskStatus(a)] ?? 4;
      const sb = statusOrder[getTaskStatus(b)] ?? 4;
      if (sa !== sb) return sa - sb;
      return b.createdAt - a.createdAt;
    });
  }, [tasks]);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
    dragTaskOrderRef.current = sortedTasks.map(t => t.id);
  }, [sortedTasks]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    setOverIndex(index);
  }, [dragIndex]);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      setIsSwapAnimating(true);

      const allTasks = getAllTasks();
      const taskMap = new Map(allTasks.map(t => [t.id, t]));

      const reorderedIds = [...dragTaskOrderRef.current];
      const [draggedId] = reorderedIds.splice(dragIndex, 1);
      reorderedIds.splice(overIndex, 0, draggedId);

      const reorderedTasks = reorderedIds
        .map(id => taskMap.get(id))
        .filter((t): t is ScheduledTask => !!t);

      const otherTasks = allTasks.filter(t => !reorderedIds.includes(t.id));
      saveAllTasks([...otherTasks, ...reorderedTasks]);

      setTimeout(() => {
        setIsSwapAnimating(false);
        onRefresh();
      }, 700);
    }
    setDragIndex(null);
    setOverIndex(null);
  }, [dragIndex, overIndex, onRefresh]);

  // 移动端触摸拖拽：长按触发
  const handleMobileTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    if (isMobileDraggingRef.current) return;

    const touch = e.touches[0];
    touchStartYRef.current = touch.clientY;

    // 清除之前的长按计时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // 启动长按计时器（500ms）
    longPressTimerRef.current = setTimeout(() => {
      isMobileDraggingRef.current = true;
      mobileDragIndexRef.current = index;
      setMobileDragIndex(index);
      setMobileOverIndex(null);
      dragTaskOrderRef.current = sortedTasks.map(t => t.id);

      // 触感反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }

      // 添加全局触摸移动和结束监听
      const handleTouchMove = (moveEvent: TouchEvent) => {
        if (!isMobileDraggingRef.current) return;
        moveEvent.preventDefault(); // 阻止页面滚动

        const moveTouch = moveEvent.touches[0];
        const moveY = moveTouch.clientY;

        // 计算手指位于哪个任务项上
        if (listRef.current) {
          const items = listRef.current.querySelectorAll('[data-task-index]');
          let targetIndex: number | null = null;

          items.forEach((item) => {
            const rect = item.getBoundingClientRect();
            const idx = parseInt(item.getAttribute('data-task-index') || '0', 10);
            if (moveY >= rect.top && moveY <= rect.bottom) {
              targetIndex = idx;
            }
          });

          if (targetIndex !== null && targetIndex !== mobileDragIndexRef.current) {
            setMobileOverIndex(targetIndex);
          }
        }
      };

      const handleTouchEnd = () => {
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);

        const currentDragIndex = mobileDragIndexRef.current;

        // 完成排序
        setMobileOverIndex((currentOverIndex) => {
          if (currentDragIndex !== null && currentOverIndex !== null && currentDragIndex !== currentOverIndex) {
            setIsSwapAnimating(true);

            const allTasks = getAllTasks();
            const taskMap = new Map(allTasks.map(t => [t.id, t]));

            const reorderedIds = [...dragTaskOrderRef.current];
            const [draggedId] = reorderedIds.splice(currentDragIndex, 1);
            reorderedIds.splice(currentOverIndex, 0, draggedId);

            const reorderedTasks = reorderedIds
              .map(id => taskMap.get(id))
              .filter((t): t is ScheduledTask => !!t);

            const otherTasks = allTasks.filter(t => !reorderedIds.includes(t.id));
            saveAllTasks([...otherTasks, ...reorderedTasks]);

            setTimeout(() => {
              setIsSwapAnimating(false);
              onRefresh();
            }, 700);
          }
          return null;
        });

        setMobileDragIndex(null);
        mobileDragIndexRef.current = null;
        isMobileDraggingRef.current = false;
      };

      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: true });
    }, 500);

    // 监听移动，如果手指移动超过10px则取消长按（视为滚动）
    const handleEarlyTouchMove = (moveEvent: TouchEvent) => {
      const moveTouch = moveEvent.touches[0];
      const deltaY = Math.abs(moveTouch.clientY - touchStartYRef.current);
      if (deltaY > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        document.removeEventListener('touchmove', handleEarlyTouchMove);
        document.removeEventListener('touchend', handleEarlyTouchEnd);
      }
    };

    const handleEarlyTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      document.removeEventListener('touchmove', handleEarlyTouchMove);
      document.removeEventListener('touchend', handleEarlyTouchEnd);
    };

    document.addEventListener('touchmove', handleEarlyTouchMove, { passive: true });
    document.addEventListener('touchend', handleEarlyTouchEnd, { passive: true });
  }, [sortedTasks, onRefresh]);

  // 清理长按计时器
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  if (tasks.length === 0) {
    return (
      <div className="py-10 sm:py-12 text-center px-4">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-10 sm:h-10 rounded-2xl bg-muted/50 mb-4 sm:mb-3">
          <CalendarClock className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground/30" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">暂无自定义任务</p>
        <p className="text-xs text-muted-foreground/60 mt-1.5 sm:mt-1 leading-relaxed">点击上方"新建任务"按钮创建</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-[var(--brand-start)]" />
          任务列表（{tasks.length}）
          <span className="text-xs font-normal text-muted-foreground">
            · 拖拽调整顺序
          </span>
        </h3>
      </div>

      <div className="space-y-2" ref={listRef}>
        {sortedTasks.map((task, index) => {
          const isDragging = dragIndex === index || mobileDragIndex === index;
          const isMobileDragTarget = mobileOverIndex === index;

          return (
            <div key={task.id} data-task-index={index}>
              {/* 移动端拖拽占位符：在目标位置上方显示 */}
              {isMobileDragTarget && mobileDragIndex !== null && mobileDragIndex !== index && (
                <div className="h-1 rounded-full bg-[var(--brand-start)]/30 mb-2 transition-all duration-200" />
              )}
              <TaskItem
                task={task}
                index={index}
                isDragging={isDragging}
                isSwapAnimating={isSwapAnimating}
                isMobileDragTarget={isMobileDragTarget && mobileDragIndex !== null && mobileDragIndex !== index}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onEdit={onEdit}
                onDelete={handleDelete}
                onCancel={handleCancel}
                onRefresh={onRefresh}
                onTouchStart={handleMobileTouchStart}
              />
            </div>
          );
        })}
      </div>

      <FeedbackModal
        visible={!!deleteConfirmId}
        type="warning"
        title="确认删除任务"
        message={`即将删除任务「${deleteTaskData?.name || ""}」及其所有关联数据，此操作不可撤销`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmId(null)}
        showCancel
      />
    </div>
  );
}