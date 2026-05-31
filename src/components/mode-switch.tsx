"use client";

import React from "react";
import { PlayMode } from "@/lib/task-types";
import { cn } from "@/lib/utils";
import { Settings, CalendarClock } from "lucide-react";

interface ModeSwitchProps {
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
}

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <div className="flex items-center gap-1 p-1 sm:p-1 rounded-xl bg-muted/50 border border-border/40">
      <button
        onClick={() => onModeChange("default")}
        className={cn(
          "flex items-center gap-2 px-4 sm:px-4 py-2.5 sm:py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
          mode === "default"
            ? "bg-[var(--brand-start)] text-white shadow-md shadow-[var(--brand-start)]/20"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        )}
      >
        <Settings className="w-4 h-4" />
        <span>默认设置</span>
      </button>
      <button
        onClick={() => onModeChange("custom")}
        className={cn(
          "flex items-center gap-2 px-4 sm:px-4 py-2.5 sm:py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer",
          mode === "custom"
            ? "bg-[var(--brand-start)] text-white shadow-md shadow-[var(--brand-start)]/20"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        )}
      >
        <CalendarClock className="w-4 h-4" />
        <span>自定义任务</span>
      </button>
    </div>
  );
}
