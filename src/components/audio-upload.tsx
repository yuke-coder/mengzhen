"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { saveAudioBlob, deleteAudioBlob } from "@/lib/audio-db";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WheelDateTimePicker, type DateTimeValue } from "@/components/wheel-date-time-picker";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DurationSetter } from "@/components/duration-setter";
import { ModeSwitch } from "@/components/mode-switch";
import { STEP_DURATION, PlayMode } from "@/lib/task-types";
import {
  Upload,
  Music2,
  X,
  Play,
  Pause,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Volume2,
  Clock,
  GripVertical,
  Volume1,
  VolumeX,
  Sparkles,
  ChevronDown,
  Timer,
} from "lucide-react";

// 拖拽功能的样式
const dragStyles = `
  .audio-list-container [data-audio-item] {
    touch-action: pan-y;
    -webkit-user-select: none;
    user-select: none;
  }

  .audio-list-container [data-audio-item].dragging-item {
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    cursor: grabbing !important;
  }

  .audio-list-container [data-audio-item].dragging-item:active {
    cursor: grabbing !important;
  }

  @keyframes dragFeedback {
    0% {
      transform: scale(1);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    50% {
      transform: scale(1.02);
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.15);
    }
    100% {
      transform: scale(1.02);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    }
  }

  .audio-list-container [data-audio-item]:active:not(.dragging-item) {
    animation: dragFeedback 0.15s ease-out;
  }
`;

const MAX_FILES = 20;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (Supabase bucket限制)
const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp3",
  "audio/x-m4a",
  "audio/flac",
  "audio/aac",
];
const ALLOWED_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac"];
const ACCEPTED_TYPES = [...ALLOWED_TYPES, ...ALLOWED_EXTENSIONS];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface AudioItem {
  id: string;
  name: string;
  file: File;
  url: string;
  duration: number;
  fileKey?: string;
  serverUrl?: string;
  dbKey?: string; // IndexedDB key，游客也能跨页面播放
  uploading?: boolean;
  uploadProgress?: number;
  uploadError?: string | null;
}

interface AudioUploadProps {
  onAudioUploaded?: (audios: AudioItem[]) => void;
  onAudioRemoved?: (id: string) => void;
  onOrderChange?: (orderedIds: string[]) => void;
  onAudioCountChange?: (count: number) => void;
  disabled?: boolean;
  importFileKey?: string;
  mode?: PlayMode;
  onModeChange?: (mode: PlayMode) => void;
  children?: React.ReactNode;
}

let globalIdCounter = 0;

export function AudioUpload({
  onAudioUploaded,
  onAudioRemoved,
  onOrderChange,
  onAudioCountChange,
  disabled = false,
  importFileKey,
  mode = "default",
  onModeChange,
  children,
}: AudioUploadProps) {
  const { user } = useAuth();
  const router = useRouter();

  // 处理从历史记录导入音频
  useEffect(() => {
    if (!importFileKey || !user) return;

    async function importAudio() {
      try {
        const res = await fetch(`/api/audio/get-by-key?fileKey=${importFileKey}`);
        const data = await res.json();
        if (!data.success || !data.audio) {
          console.error("导入音频失败:", data.error);
          return;
        }

        const audioInfo = data.audio;
        const id = `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const newAudio: AudioItem = {
          id,
          name: audioInfo.name,
          file: new File([], audioInfo.name, { type: audioInfo.mime_type }),
          url: audioInfo.serverUrl || (importFileKey ? `/api/audio/proxy?key=${encodeURIComponent(importFileKey)}` : undefined),
          duration: audioInfo.metadata?.duration || 0,
          fileKey: importFileKey,
          serverUrl: audioInfo.serverUrl,
        };

        setAudios(prev => {
          // 避免重复导入
          if (prev.some(a => a.fileKey === newAudio.fileKey)) return prev;
          const updated = [...prev, newAudio];
          onAudioUploaded?.(updated);
          onAudioCountChange?.(updated.length);
          return updated;
        });
      } catch (err) {
        console.error("导入音频异常:", err);
      }
    }

    importAudio();
  }, [importFileKey, user, onAudioUploaded, onAudioCountChange]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showGuestTip, setShowGuestTip] = useState(false);
  const [audios, setAudios] = useState<AudioItem[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentTimes, setCurrentTimes] = useState<Record<string, number>>({});
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isSwapAnimating, setIsSwapAnimating] = useState(false);
  const [volume, setVolume] = useState<number>(50);

  // 拖拽排序功能 - 移动端友好
  const [isDragging, setIsDragging] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingY, setDraggingY] = useState<number>(0);
  const [dragOffsetY, setDragOffsetY] = useState<number>(0);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragGhostRef = useRef<HTMLDivElement | null>(null);
  const lastMoveYRef = useRef<number>(0);
  const lastMoveTimeRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true); // 组件挂载状态追踪;
  const isClearingRef = useRef<boolean>(false); // 清空操作状态追踪;

  const [startTime, setStartTime] = useState<DateTimeValue>(() => {
    const now = new Date();
    return { 
      year: now.getFullYear(), 
      month: now.getMonth() + 1, 
      day: now.getDate(),
      hour: now.getHours(), 
      minute: now.getMinutes(),
      second: now.getSeconds()
    };
  });
  const [endTime, setEndTime] = useState<DateTimeValue>(() => {
    const now = new Date();
    return { 
      year: now.getFullYear(), 
      month: now.getMonth() + 1, 
      day: now.getDate(),
      hour: now.getHours(), 
      minute: now.getMinutes(),
      second: now.getSeconds()
    };
  });
  const [playDurationMinutes, setPlayDurationMinutes] = useState(30);

  // 音量渐入/渐出时长（秒）
  const [fadeInDuration, setFadeInDuration] = useState(60);
  const [fadeOutDuration, setFadeOutDuration] = useState(60);
  // 倒计时播放模式
  const [countdownPlayingId, setCountdownPlayingId] = useState<string | null>(null);
  // 倒计时状态
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState<number>(0);
  const [countdownStatus, setCountdownStatus] = useState<string>("等待开始");
  // 音频播放阶段：idle | fading-in | playing | fading-out
  const [audioPhase, setAudioPhase] = useState<"idle" | "fading-in" | "playing" | "fading-out">("idle");
  // 渐变定时器 refs
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeVolumeRef = useRef<number>(0);
  const fadeTargetRef = useRef<number>(0);
  // 倒计时定时器 ref
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 结束时间检测定时器 ref
  const endTimeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 开始时间是否有效（不能早于当前时间）
  const [isStartTimeValid, setIsStartTimeValid] = useState(true);
  const [startTimeError, setStartTimeError] = useState<string | null>(null);
  const [isEndTimeValid, setIsEndTimeValid] = useState(true);
  const [endTimeError, setEndTimeError] = useState<string | null>(null);

  // 纯验证函数（返回布尔值，不设状态）- 用于 handleDreamPillow
  const isStartTimeValidFn = (time: DateTimeValue, fadeInSec?: number): boolean => {
    if (!time || !time.year) return false;
    // 给 2 秒容差，避免用户点击瞬间时间刚好跳过导致误判
    const now = new Date(Date.now() - 2000);
    const targetDate = new Date(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
    // 音频实际在 开始时间 - 渐入时长 时开始播放，所以当前时间必须 ≤ 开始时间 - 渐入时长
    const fadeInMs = (fadeInSec || 0) * 1000;
    const actualStartDate = new Date(targetDate.getTime() - fadeInMs);
    return actualStartDate >= now;
  };

  const isEndTimeValidFn = (time: DateTimeValue, startTimeVal?: DateTimeValue): boolean => {
    if (!time || !time.year) return false;
    const now = new Date(Date.now() - 2000);
    const targetDate = new Date(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
    if (targetDate < now) return false;
    if (startTimeVal && startTimeVal.year) {
      const startDate = new Date(startTimeVal.year, startTimeVal.month - 1, startTimeVal.day, startTimeVal.hour, startTimeVal.minute, startTimeVal.second);
      if (targetDate.getTime() === startDate.getTime()) return false;
      return targetDate >= startDate;
    }
    return true;
  };

  // 验证开始时间（不能早于当前时间+渐入时长）- 用于滚轮 onChange 及主动校验
  const validateStartTime = useCallback((time: DateTimeValue, fadeInSec?: number) => {
    if (!time || !time.year) {
      setIsStartTimeValid(false);
      setStartTimeError("请设置开始时间");
      return;
    }
    // 给 2 秒容差，与 isStartTimeValidFn 保持一致
    const now = new Date(Date.now() - 2000);
    const targetDate = new Date(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
    const fadeInMs = (fadeInSec || 0) * 1000;
    const actualStartDate = new Date(targetDate.getTime() - fadeInMs);

    if (actualStartDate < now) {
      setIsStartTimeValid(false);
      if (fadeInMs > 0) {
        setStartTimeError("距离开始时间不足以完成渐入，请调整开始时间或缩短渐入时长");
      } else {
        setStartTimeError("开始时间不能早于当前时间");
      }
    } else {
      setIsStartTimeValid(true);
      setStartTimeError(null);
    }
  }, []);

  // 验证结束时间（不能早于当前时间，且不能早于开始时间）- 用于滚轮 onChange 及主动校验
  const validateEndTime = useCallback((time: DateTimeValue, startTimeVal?: DateTimeValue) => {
    if (!time || !time.year) {
      setIsEndTimeValid(false);
      setEndTimeError("请设置结束时间");
      return;
    }
    const now = new Date(Date.now() - 2000);
    const targetDate = new Date(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);

    if (targetDate < now) {
      setIsEndTimeValid(false);
      setEndTimeError("结束时间不能早于当前时间");
    } else if (startTimeVal && startTimeVal.year) {
      const startDate = new Date(startTimeVal.year, startTimeVal.month - 1, startTimeVal.day, startTimeVal.hour, startTimeVal.minute, startTimeVal.second);
      if (targetDate.getTime() === startDate.getTime()) {
        setIsEndTimeValid(false);
        setEndTimeError("结束时间不能与开始时间相同，请设置不同的时间");
      } else if (targetDate < startDate) {
        setIsEndTimeValid(false);
        setEndTimeError("结束时间不能早于开始时间");
      } else {
        setIsEndTimeValid(true);
        setEndTimeError(null);
      }
    } else {
      setIsEndTimeValid(true);
      setEndTimeError(null);
    }
  }, []);

  // 注意：验证逻辑只在 handleStartTimeChange/handleEndTimeChange 中调用
  // 不再监听 startTime/endTime 变化自动验证，避免被覆盖后误触发

  // 页面加载时恢复缓存的配置
  useEffect(() => {
    const savedConfig = localStorage.getItem('dream_config');
    if (savedConfig) {
      try {
        const parsedConfig = JSON.parse(savedConfig);
        // 强制清除旧的时间戳数据，确保始终使用当前实时时间
        delete parsedConfig.startTime;
        delete parsedConfig.endTime;
        // 恢复音量设置
        if (typeof parsedConfig.volume === 'number') {
          setVolume(parsedConfig.volume);
        }
        // 恢复渐入渐出设置
        if (typeof parsedConfig.fadeInDuration === 'number') {
          setFadeInDuration(parsedConfig.fadeInDuration);
        }
        if (typeof parsedConfig.fadeOutDuration === 'number') {
          setFadeOutDuration(parsedConfig.fadeOutDuration);
        }
        // 开始时间和结束时间始终使用当前实时时间，不从配置恢复
        const now = new Date();
        delete parsedConfig.startTime;
        delete parsedConfig.endTime;
        setStartTime({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          hour: now.getHours(),
          minute: now.getMinutes(),
          second: now.getSeconds()
        });
        setEndTime({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          hour: now.getHours(),
          minute: now.getMinutes(),
          second: now.getSeconds()
        });
        // 恢复音频列表（如果有有效的音频）
        if (parsedConfig.audios && Array.isArray(parsedConfig.audios)) {
          // 严格验证：必须有有效的持久化标识或URL，blob: URL在页面刷新后失效
          const validAudios = parsedConfig.audios.filter((a: Record<string, unknown>) => {
            if (!a.name || String(a.name).trim() === '' || a.name === '音频文件') {
              return false;
            }
            const hasPersistentAccess = !!(a.fileKey || a.serverUrl || a.dbKey);
            if (!hasPersistentAccess) {
              return false;
            }
            if (!a.duration || Number(a.duration) <= 0) {
              return false;
            }
            return true;
          });
          if (validAudios.length > 0) {
            // 创建一个带有 name 属性的哑文件对象用于显示
            const dummyFile = {
              name: validAudios[0]?.name || '',
              size: 0
            } as unknown as File;
            setAudios(validAudios.map((a: Record<string, unknown>) => ({
              id: a.id as string,
              name: a.name as string,
              file: dummyFile,
              url: (a.serverUrl as string) || null,
              duration: (a.duration as number) || 0,
              fileKey: a.fileKey as string | undefined,
              serverUrl: a.serverUrl as string | undefined,
              dbKey: a.dbKey as string | undefined,
            })));
            // 更新缓存，清除已失效的音频（只有blob: URL且无持久化标识的）
            try {
              const updatedConfig = { ...parsedConfig, audios: validAudios };
              localStorage.setItem('dream_config', JSON.stringify(updatedConfig));
            } catch {}
          } else {
            // 所有音频都失效了，清除缓存
            localStorage.removeItem('dream_config');
          }
        }
      } catch (e) {
        console.error('[梦枕] 恢复缓存配置失败:', e);
      }
    }
  }, []);

  // 初始加载后 + startTime/endTime 变化时自动触发验证
  const currentFadeInSec = fadeInDuration || 0;
  useEffect(() => {
    validateStartTime(startTime, currentFadeInSec);
  }, [startTime, currentFadeInSec, validateStartTime]);

  useEffect(() => {
    validateEndTime(endTime, startTime);
  }, [endTime, startTime, validateEndTime]);

  // 每秒实时检查时间有效性（防止用户设置后等待过久导致时间过期）
  useEffect(() => {
    const timer = setInterval(() => {
      validateStartTime(startTime, currentFadeInSec);
      validateEndTime(endTime, startTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime, endTime, currentFadeInSec, validateStartTime, validateEndTime]);

  const durationSeconds = startTime.hour * 3600 + startTime.minute * 60;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const volumeSliderRef = useRef<HTMLInputElement>(null);

  // 保存梦枕配置到 localStorage
  const saveDreamConfig = useCallback(() => {
    if (audios.length === 0) return;
    
    // 保存音频配置
    const config = {
      audios: audios.map(a => ({
        id: a.id,
        name: a.name,
        url: a.url,
        fileKey: a.fileKey || null,
        serverUrl: a.serverUrl || null,
        dbKey: a.dbKey || null,
        duration: a.duration
      })),
      order: audios.map(a => a.id),
      volume,
      fadeInDuration,
      fadeOutDuration,
      startTime: { hour: startTime.hour, minute: startTime.minute, second: startTime.second },
      endTime: { hour: endTime.hour, minute: endTime.minute, second: endTime.second },
      createdAt: Date.now()
    };
    
    localStorage.setItem('dream_config', JSON.stringify(config));
  }, [audios, volume, fadeInDuration, fadeOutDuration, startTime, endTime]);

  const handleDreamPillow = async () => {
    const fadeInSec = (fadeInDuration || 0);
    const startValid = isStartTimeValidFn(startTime, fadeInSec);
    const endValid = isEndTimeValidFn(endTime, startTime);

    if (!startValid) {
      if (fadeInSec > 0) {
        toast.error("距离开始时间不足以完成渐入，请调整开始时间或缩短渐入时长");
      } else {
        toast.error("开始时间不能早于当前时间，请重新设置");
      }
      return;
    }
    if (!endValid) {
      toast.error("结束时间不能早于当前时间或开始时间，请重新设置");
      return;
    }
    if (audios.length === 0) {
      toast.error("请先添加音频文件");
      return;
    }

    let currentAudios = audios;
    const uploading = currentAudios.filter(a => a.uploading);
    if (uploading.length > 0) {
      toast.loading(`等待 ${uploading.length} 个音频上传完成...`, { id: 'dream-upload' });
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 500));
        let stillUploading = false;
        setAudios(prev => {
          stillUploading = prev.some(a => a.uploading);
          currentAudios = prev;
          return prev;
        });
        if (!stillUploading) break;
      }
      toast.dismiss('dream-upload');
    }

    let latestAudios = currentAudios;
    setAudios(prev => {
      latestAudios = prev;
      return prev;
    });

    if (user) {
      const failedAudios = latestAudios.filter(a => a.uploadError);
      if (failedAudios.length > 0) {
        toast.error(`有 ${failedAudios.length} 个音频上传失败，请移除后重试`);
        return;
      }
    }

    const config = {
      audios: latestAudios.map(a => ({
        id: a.id,
        name: a.name,
        url: a.url,
        fileKey: a.fileKey || null,
        serverUrl: a.serverUrl || null,
        dbKey: a.dbKey || null,
        duration: a.duration
      })),
      order: latestAudios.map(a => a.id),
      volume,
      fadeInDuration,
      fadeOutDuration,
      startTime: { year: startTime.year, month: startTime.month, day: startTime.day, hour: startTime.hour, minute: startTime.minute, second: startTime.second },
      endTime: { year: endTime.year, month: endTime.month, day: endTime.day, hour: endTime.hour, minute: endTime.minute, second: endTime.second },
      createdAt: Date.now()
    };
    localStorage.setItem('dream_config', JSON.stringify(config));

    router.push("/templates");
  };

  // 播放进度更新（列表内播放）
  useEffect(() => {
    const cleanupFunctions: (() => void)[] = [];

    Object.entries(audioRefs.current).forEach(([id, el]) => {
      if (!el || !isMountedRef.current) return;

      const handleTimeUpdate = () => {
        if (!isMountedRef.current) return;
        setCurrentTimes((prev) => ({ ...prev, [id]: el.currentTime }));
      };
      const handleEnded = () => {
        if (!isMountedRef.current) return;
        setPlayingId(null);
      };
      const handleLoadedMetadata = () => {
        if (!isMountedRef.current) return;
        setAudios((prev) =>
          prev.map((a) => (a.id === id ? { ...a, duration: el.duration || 0 } : a))
        );
      };

      el.addEventListener("timeupdate", handleTimeUpdate);
      el.addEventListener("ended", handleEnded);
      el.addEventListener("loadedmetadata", handleLoadedMetadata);

      // 收集清理函数
      cleanupFunctions.push(() => {
        el.removeEventListener("timeupdate", handleTimeUpdate);
        el.removeEventListener("ended", handleEnded);
        el.removeEventListener("loadedmetadata", handleLoadedMetadata);
      });
    });

    // 返回统一的清理函数
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, [audios]);

  // 播放时段检测：播放到结束时间时暂停（含渐出效果）
  useEffect(() => {
    if (!playingId || !isMountedRef.current) return;
    const el = audioRefs.current[playingId];
    if (!el) return;

    const endTime = durationSeconds;
    let fadeOutStarted = false;

    const handleTimeUpdate = () => {
      if (!isMountedRef.current) return;

      // 仅对倒计时播放模式应用渐出
      if (countdownPlayingId === playingId && !fadeOutStarted && fadeOutDuration > 0) {
        const timeRemaining = endTime - el.currentTime;
        if (timeRemaining <= fadeOutDuration && timeRemaining > 0) {
          fadeOutStarted = true;
          const startVol = el.volume;
          const step = startVol / (fadeOutDuration * 20);
          const fadeTimer = setInterval(() => {
            if (!isMountedRef.current || isClearingRef.current) {
              clearInterval(fadeTimer);
              return;
            }
            fadeVolumeRef.current = Math.max(fadeVolumeRef.current - step, 0);
            el.volume = fadeVolumeRef.current;
            if (fadeVolumeRef.current <= 0) {
              clearInterval(fadeTimer);
            }
          }, 50);
        }
      }

      if (el.currentTime >= endTime) {
        if (fadeTimerRef.current) {
          clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        el.pause();
        el.volume = volume / 100;
        if (!isClearingRef.current) {
          setPlayingId(null);
          setCountdownPlayingId(null);
        }
      }
    };
    el.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      el.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [playingId, durationSeconds, countdownPlayingId, fadeOutDuration, volume]);




  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `文件 "${file.name}" 超过 ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB 限制`;
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    // PWA standalone 模式下，部分浏览器可能不报告 MIME 类型（file.type 为空）
    // 此时仅通过扩展名验证
    const typeOk = ALLOWED_TYPES.includes(file.type) || file.type.startsWith('audio/') || file.type === '';
    const extOk = ALLOWED_EXTENSIONS.includes(ext);
    if (!typeOk && !extOk) {
      return `不支持的音频格式，请上传 ${ALLOWED_EXTENSIONS.join(", ")} 文件`;
    }
    if (audios.some((a) => a.file.name === file.name)) {
      return `文件 "${file.name}" 已存在`;
    }
    return null;
  };

  // 自动上传单个音频到服务器（写入 audios 表）
  // 未登录时跳过上传，保留 blob URL（仅当前页面可播放）
  const autoUploadToServer = useCallback(async (id: string, file: File) => {
    // 未登录时跳过上传，保留本地 blob URL
    if (!user) {
      console.log(`[自动上传] ${file.name} 用户未登录，跳过服务器上传（仅本地播放）`);
      return;
    }

    try {
      setAudios((prev) =>
        prev.map((a) => (a.id === id ? { ...a, uploading: true, uploadProgress: 0, uploadError: null } : a))
      );

      const formData = new FormData();
      formData.append("audio", file);

      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setAudios((prev) =>
              prev.map((a) => (a.id === id ? { ...a, uploadProgress: pct } : a))
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || `上传失败 (${xhr.status})`));
            } catch {
              reject(new Error(`上传失败 (${xhr.status})`));
            }
          }
        });

        xhr.addEventListener("error", () => reject(new Error("网络错误")));
        xhr.open("POST", "/api/audio/upload?save_to_files=false");
        xhr.send(formData);
      });

      await uploadPromise;

      const response = JSON.parse(xhr.responseText);
      if (response.success) {
        setAudios((prev) => {
          const updated = prev.map((a) =>
            a.id === id
              ? { ...a, serverUrl: response.audio_url, fileKey: response.file_key, uploading: false, uploadProgress: 100 }
              : a
          );
          onAudioUploaded?.(updated);
          onAudioCountChange?.(updated.length);
          return updated;
        });
        console.log(`[自动上传] ${file.name} 上传成功, fileKey: ${response.file_key}`);
      } else {
        setAudios((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploading: false, uploadError: response.error || "上传失败" } : a))
        );
        console.warn(`[自动上传] ${file.name} 上传失败:`, response.error);
      }
    } catch (err) {
      setAudios((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, uploading: false, uploadError: err instanceof Error ? err.message : "上传失败" }
            : a
        )
      );
      console.warn(`[自动上传] ${file.name} 异常:`, err);
    }
  }, [onAudioUploaded, onAudioCountChange]);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      const fileArray = Array.from(files).slice(0, MAX_FILES - audios.length);
      const newAudios: AudioItem[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          setUploadError(error);
          continue;
        }
        const url = URL.createObjectURL(file);
        const id = `audio_${++globalIdCounter}_${Date.now()}`;
        
        // 存入 IndexedDB（游客和登录用户都可用，跨页面播放）
        let dbKey: string | undefined;
        try {
          await saveAudioBlob(id, file);
          dbKey = id;
          console.log('[processFiles] 音频已存入IndexedDB, dbKey:', dbKey);
        } catch (err) {
          console.warn('[processFiles] IndexedDB存储失败，将依赖blob URL:', err);
        }
        
        newAudios.push({
          id,
          file,
          name: file.name,
          url,
          duration: 0,
          dbKey,
        });
        
        // 登录用户额外上传到服务器（写入历史记录表）
        if (user) {
          autoUploadToServer(id, file);
        }
      }

      if (newAudios.length > 0) {
        setAudios((prev) => [...prev, ...newAudios]);
      }
    },
    [audios, autoUploadToServer, user]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
      requestAnimationFrame(() => {
        if (fileInputRef.current) {
          try {
            fileInputRef.current.value = "";
          } catch {}
        }
      });
    },
    [processFiles]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      processFiles(e.dataTransfer.files);
    },
    [processFiles, disabled]
  );

  const handleRemove = useCallback(
    (id: string) => {
      const audio = audios.find((a) => a.id === id);
      if (audio) {
        if (audioRefs.current[id]) {
          audioRefs.current[id].pause();
          audioRefs.current[id].removeAttribute('src');
          audioRefs.current[id].load();
          delete audioRefs.current[id];
        }
        if (audio.url && audio.url.startsWith("blob:")) {
          URL.revokeObjectURL(audio.url);
        }
        if (audio.dbKey) {
          deleteAudioBlob(audio.dbKey).catch((err) =>
            console.warn("[handleRemove] IndexedDB 清理失败:", err)
          );
        }
      }
      setAudios((prev) => prev.filter((a) => a.id !== id));
      setCurrentTimes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (playingId === id) { setPlayingId(null); setAudioPhase("idle"); }
      onAudioRemoved?.(id);
    },
    [audios, playingId, onAudioRemoved]
  );

  const togglePlay = useCallback((id: string) => {
    const el = audioRefs.current[id];
    if (!el) return;

    Object.entries(audioRefs.current).forEach(([key, ael]) => {
      if (key !== id && ael && !ael.paused) {
        ael.pause();
      }
    });

    if (playingId === id) {
      el.pause();
      setPlayingId(null);
      setAudioPhase("idle");
    } else {
      // 试听模式：直接播放，无渐变效果
      el.currentTime = 0;
      el.volume = volume / 100;
      el.play().catch((err) => console.error("[梦枕] 播放失败:", err));
      setPlayingId(id);
      setAudioPhase("playing");
    }
  }, [playingId, volume]);

  // 将 DateTimeValue 转换为 Date 对象
  const dateTimeToDate = useCallback((time: DateTimeValue): Date => {
    return new Date(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  }, []);

  // 格式化剩余时间显示
  const formatCountdownTime = useCallback((seconds: number): string => {
    if (seconds <= 0) return "00:00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, []);

  // 清理所有定时器
  const clearAllTimers = useCallback(() => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (endTimeTimerRef.current) {
      clearInterval(endTimeTimerRef.current);
      endTimeTimerRef.current = null;
    }
  }, []);

  // 开始倒计时（等待到开始时间）
  const startCountdown = useCallback(() => {
    if (audios.length === 0) return;

    // 清理之前的定时器
    clearAllTimers();

    const startDate = dateTimeToDate(startTime);
    const endDate = dateTimeToDate(endTime);
    const now = new Date();

    // 验证时间
    if (startDate <= now) {
      setCountdownStatus("开始时间已过，立即播放");
      // 立即开始播放
      startCountdownPlayback(audios[0].id);
      return;
    }

    if (endDate <= startDate) {
      setCountdownStatus("结束时间必须晚于开始时间");
      return;
    }

    setIsCountingDown(true);
    setCountdownStatus("倒计时中");

    // 计算初始剩余时间
    const updateRemaining = () => {
      const now = new Date();
      const remaining = Math.max(0, Math.ceil((startDate.getTime() - now.getTime()) / 1000));
      setCountdownRemaining(remaining);
      return remaining;
    };

    updateRemaining();

    // 倒计时定时器
    countdownTimerRef.current = setInterval(() => {
      if (!isMountedRef.current || isClearingRef.current) {
        if (countdownTimerRef.current !== null) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        return;
      }

      const remaining = updateRemaining();

      if (remaining <= 0) {
        // 倒计时结束，开始播放
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        if (!isClearingRef.current) {
          setCountdownStatus("倒计时结束，开始播放");
          setIsCountingDown(false);
          startCountdownPlayback(audios[0].id);
        }
      }
    }, 1000);
  }, [audios, startTime, endTime, dateTimeToDate, clearAllTimers]);

  // 停止倒计时
  const stopCountdown = useCallback(() => {
    clearAllTimers();
    setIsCountingDown(false);
    setCountdownStatus("已停止");
    setCountdownRemaining(0);
    stopCountdownPlayback();
  }, [clearAllTimers]);

  // 倒计时播放：应用渐入效果
  const startCountdownPlayback = useCallback((id: string) => {
    const el = audioRefs.current[id];
    if (!el) return;

    // 停止其他所有音频
    Object.entries(audioRefs.current).forEach(([key, ael]) => {
      if (key !== id && ael && !ael.paused) {
        ael.pause();
      }
    });

    // 停止之前的渐变
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    // 停止之前的结束时间检测
    if (endTimeTimerRef.current) {
      clearInterval(endTimeTimerRef.current);
      endTimeTimerRef.current = null;
    }

    // 重置到开头
    el.currentTime = 0;
    fadeVolumeRef.current = 0;
    fadeTargetRef.current = volume / 100;
    el.volume = 0;
    el.play().catch((err) => console.error("[梦枕] 倒计时播放失败:", err));

    setCountdownPlayingId(id);
    setPlayingId(id);
    setCountdownStatus("播放中");

    // 清除之前的试听模式停止监听
    const handleEnded = () => {
      if (!isMountedRef.current) return;
      if (fadeTimerRef.current) {
        clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
      if (endTimeTimerRef.current) {
        clearInterval(endTimeTimerRef.current);
        endTimeTimerRef.current = null;
      }
      setPlayingId(null);
      setCountdownPlayingId(null);
      setCountdownStatus("播放完成");
      setIsCountingDown(false);
      setAudioPhase("idle");
    };
    el.removeEventListener("ended", handleEnded);
    el.addEventListener("ended", handleEnded);

    // 渐入效果
    if (fadeInDuration > 0 && volume > 0) {
      setAudioPhase("fading-in");
      const step = (fadeTargetRef.current / (fadeInDuration * 20)); // 每秒20步
      fadeTimerRef.current = setInterval(() => {
        if (!isMountedRef.current || isClearingRef.current) {
          if (fadeTimerRef.current !== null) clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
          return;
        }
        fadeVolumeRef.current = Math.min(fadeVolumeRef.current + step, fadeTargetRef.current);
        el.volume = fadeVolumeRef.current;
        if (fadeVolumeRef.current >= fadeTargetRef.current) {
          if (fadeTimerRef.current) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }
          if (!isClearingRef.current) {
            setAudioPhase("playing");
          }
        }
      }, 50);
    } else {
      el.volume = fadeTargetRef.current;
      if (!isClearingRef.current) {
        setAudioPhase("playing");
      }
    }

    // 结束时间检测定时器
    const endDate = dateTimeToDate(endTime);
    endTimeTimerRef.current = setInterval(() => {
      if (!isMountedRef.current || isClearingRef.current) {
        if (endTimeTimerRef.current !== null) clearInterval(endTimeTimerRef.current);
        endTimeTimerRef.current = null;
        return;
      }

      const now = new Date();

      // 检查是否到达结束时间
      if (now >= endDate) {
        if (endTimeTimerRef.current) {
          clearInterval(endTimeTimerRef.current);
          endTimeTimerRef.current = null;
        }

        if (!isClearingRef.current) {
          setCountdownStatus("到达结束时间，正在停止");
        }

        // 应用渐出效果并停止
        const stopWithFadeOut = () => {
          if (fadeOutDuration > 0 && el.volume > 0) {
            setAudioPhase("fading-out");
            const startVol = el.volume;
            const step = startVol / (fadeOutDuration * 20);

            if (fadeTimerRef.current) {
              clearInterval(fadeTimerRef.current);
            }

            fadeTimerRef.current = setInterval(() => {
              if (!isMountedRef.current || isClearingRef.current) {
                if (fadeTimerRef.current !== null) clearInterval(fadeTimerRef.current);
                fadeTimerRef.current = null;
                return;
              }
              fadeVolumeRef.current = Math.max(fadeVolumeRef.current - step, 0);
              el.volume = fadeVolumeRef.current;

              if (fadeVolumeRef.current <= 0) {
                if (fadeTimerRef.current) {
                  clearInterval(fadeTimerRef.current);
                  fadeTimerRef.current = null;
                }
                el.pause();
                el.volume = volume / 100; // 恢复音量设置
                if (!isClearingRef.current) {
                  setPlayingId(null);
                  setCountdownPlayingId(null);
                  setCountdownStatus("已停止");
                  setIsCountingDown(false);
                  setAudioPhase("idle");
                }
              }
            }, 50);
          } else {
            el.pause();
            el.volume = volume / 100;
            if (!isClearingRef.current) {
              setPlayingId(null);
              setCountdownPlayingId(null);
              setCountdownStatus("已停止");
              setIsCountingDown(false);
              setAudioPhase("idle");
            }
          }
        };

        stopWithFadeOut();
      }
    }, 100);
  }, [volume, fadeInDuration, fadeOutDuration, endTime, dateTimeToDate]);

  // 停止倒计时播放（应用渐出效果）
  const stopCountdownPlayback = useCallback(() => {
    if (!countdownPlayingId) return;
    const el = audioRefs.current[countdownPlayingId];
    if (!el) return;

    // 清理所有定时器
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (endTimeTimerRef.current) {
      clearInterval(endTimeTimerRef.current);
      endTimeTimerRef.current = null;
    }

    const startVol = el.volume;
    const targetVol = 0;

    if (fadeOutDuration > 0 && startVol > 0) {
      setAudioPhase("fading-out");
      const step = (startVol / (fadeOutDuration * 20));
      fadeTimerRef.current = setInterval(() => {
        if (!isMountedRef.current || isClearingRef.current) {
          if (fadeTimerRef.current) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }
          return;
        }
        fadeVolumeRef.current = Math.max(fadeVolumeRef.current - step, targetVol);
        el.volume = fadeVolumeRef.current;
        if (fadeVolumeRef.current <= targetVol) {
          if (fadeTimerRef.current) {
            clearInterval(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }
          el.pause();
          el.volume = volume / 100; // 恢复音量设置
          if (!isClearingRef.current) {
            setPlayingId(null);
            setCountdownPlayingId(null);
            setCountdownStatus("已停止");
            setIsCountingDown(false);
            setAudioPhase("idle");
          }
        }
      }, 50);
    } else {
      el.pause();
      el.volume = volume / 100;
      if (!isClearingRef.current) {
        setPlayingId(null);
        setCountdownPlayingId(null);
        setCountdownStatus("已停止");
        setIsCountingDown(false);
        setAudioPhase("idle");
      }
    }
  }, [countdownPlayingId, fadeOutDuration, volume]);

  const handleSeek = useCallback(
    (id: string, time: number) => {
      const el = audioRefs.current[id];
      if (!el) return;
      el.currentTime = time;
      setCurrentTimes((prev) => ({ ...prev, [id]: time }));
      // 如果该音频正在播放，保持继续播放
      if (playingId === id && !el.paused) {
        el.play().catch(() => {});
      }
    },
    [playingId]
  );

  // 上传单个音频
  const handleUploadSingle = useCallback(async (id: string) => {
    let audio: AudioItem | undefined;
    setAudios((prev) => {
      audio = prev.find((a) => a.id === id);
      return prev;
    });
    if (!audio || audio.uploading) return;

    // 如果已经自动上传过（有 serverUrl 和 fileKey），只需额外保存到 audio_files 表
    if (audio.serverUrl && audio.fileKey) {
      try {
        setAudios((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploading: true, uploadProgress: 0 } : a))
        );
        const res = await fetch("/api/audio/save-to-files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileKey: audio.fileKey, name: audio.name, size: audio.file?.size || 0, mime_type: audio.file?.type || "audio/mpeg" }),
        });
        const data = await res.json();
        if (data.success) {
          setAudios((prev) =>
            prev.map((a) => (a.id === id ? { ...a, uploading: false, uploadProgress: 100, savedToFiles: true } : a))
          );
          console.log(`[上传到我的音频] ${audio.name} 保存成功`);
        } else {
          setAudios((prev) =>
            prev.map((a) => (a.id === id ? { ...a, uploading: false, uploadError: data.error || "保存失败" } : a))
          );
        }
      } catch (err) {
        setAudios((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploading: false, uploadError: err instanceof Error ? err.message : "保存失败" } : a))
        );
      }
      return;
    }

    // 未上传过的情况：完整上传（写入 audios + audio_files 两个表）
    setAudios((prev) =>
      prev.map((a) => (a.id === id ? { ...a, uploading: true, uploadProgress: 0, uploadError: null } : a))
    );

    try {
      const formData = new FormData();
      formData.append("audio", audio.file);

      const xhr = new XMLHttpRequest();

      const uploadPromise = new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setAudios((prev) =>
              prev.map((a) => (a.id === id ? { ...a, uploadProgress: pct } : a))
            );
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              reject(new Error(data.error || `上传失败 (${xhr.status})`));
            } catch {
              reject(new Error(`上传失败 (${xhr.status})`));
            }
          }
        });

        xhr.addEventListener("error", () =>
          reject(new Error("网络错误，请检查连接"))
        );
        xhr.open("POST", "/api/audio/upload?save_to_files=true");
        xhr.send(formData);
      });

      await uploadPromise;

      const response = JSON.parse(xhr.responseText);
      if (response.success) {
        setAudios((prev) => {
          const updated = prev.map((a) =>
            a.id === id ? { ...a, serverUrl: response.audio_url, fileKey: response.file_key, uploading: false, uploadProgress: 100, savedToFiles: true } : a
          );
          onAudioUploaded?.(updated);
          return updated;
        });
      } else {
        setAudios((prev) =>
          prev.map((a) => (a.id === id ? { ...a, uploading: false, uploadError: response.error || "上传失败" } : a))
        );
      }
    } catch (err) {
      setAudios((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, uploading: false, uploadError: err instanceof Error ? err.message : "上传失败" }
            : a
        )
      );
    }
  }, [onAudioUploaded]);

  // 拖拽排序
  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;

      setAudios((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(index, 0, moved);
        return next;
      });
      setDragIndex(index);
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    // 触发交换动画
    setIsSwapAnimating(true);
    setDragIndex(null);
    onOrderChange?.(audios.map((a) => a.id));
    // 动画持续时间后清除状态（700ms，慢速）
    setTimeout(() => setIsSwapAnimating(false), 700);
  }, [onOrderChange, audios]);

  // ============ 移动端触摸拖拽排序功能 ============
  // 可调整 LONG_PRESS_DURATION 来改变长按触发时间（默认500ms）
  const LONG_PRESS_DURATION = 500;

  // 长按触发拖拽（默认500ms）
  const handleTouchStart = useCallback((e: React.TouchEvent, audioId: string, index: number) => {
    if (disabled) return;

    // 清除之前的长按计时器
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    const touch = e.touches[0];
    const startY = touch.clientY;

    // 记录触摸起始位置和索引
    setDragOffsetY(startY);
    setDragStartIndex(index);

    // 启动长按计时器
    longPressTimerRef.current = setTimeout(() => {
      // 长按触发，进入拖拽模式
      const item = itemRefs.current[audioId];
      if (item) {
        const rect = item.getBoundingClientRect();
        // 记录初始位置用于后续计算
        setDraggingY(rect.top);
        setDragOffsetY(touch.clientY - rect.top); // 保存触摸点相对于元素顶部的偏移
        setIsDragging(true);
        setDraggingId(audioId);
        setDragStartIndex(index);

        // 添加视觉反馈类名
        item.classList.add('dragging-item');

        // 触感反馈（如果设备支持）
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, LONG_PRESS_DURATION);

    // 添加移动监听，检测是否为滚动操作
    const handleTouchMove = (moveEvent: TouchEvent) => {
      const moveTouch = moveEvent.touches[0];
      const deltaY = Math.abs(moveTouch.clientY - startY);

      // 如果移动距离超过10px，可能是滚动，取消长按计时器
      if (deltaY > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    };

    const handleTouchEnd = () => {
      // 清除所有监听
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);

      // 如果长按计时器还在，取消它
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
  }, [disabled]);

  // 拖拽过程中的移动
  const handleTouchMoveDrag = useCallback((e: TouchEvent) => {
    if (!isDragging || !draggingId || dragStartIndex === null) return;

    e.preventDefault();
    e.stopPropagation();

    const touch = e.touches[0];
    const currentY = touch.clientY;
    const currentTime = Date.now();

    // 限制更新频率为每16ms一次（约60fps）
    if (currentTime - lastMoveTimeRef.current < 16) return;
    lastMoveTimeRef.current = currentTime;

    // 使用触摸位置减去偏移量来计算新的top值
    const newY = currentY - dragOffsetY;
    setDraggingY(newY);

    // 计算当前应该插入的位置
    const container = document.querySelector('.audio-list-container');
    if (!container) return;

    const items = container.querySelectorAll('[data-audio-item]');
    let targetIndex = dragStartIndex;

    items.forEach((item, index) => {
      const rect = item.getBoundingClientRect();
      const itemCenterY = rect.top + rect.height / 2;

      // 根据拖拽位置判断目标索引
      if (currentY > itemCenterY && index > dragStartIndex) {
        targetIndex = index;
      } else if (currentY < itemCenterY && index < dragStartIndex) {
        targetIndex = index;
      }
    });

    // 如果位置发生变化，更新列表
    const audioIndex = audios.findIndex(a => a.id === draggingId);
    if (audioIndex !== -1 && audioIndex !== targetIndex) {
      setAudios(prev => {
        const next = [...prev];
        const [moved] = next.splice(audioIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
      });
      setDragStartIndex(targetIndex);
    }
  }, [isDragging, draggingId, dragStartIndex, dragOffsetY, audios]);

  // 拖拽结束
  const handleTouchEndDrag = useCallback(() => {
    if (!isDragging || !draggingId) return;

    // 清除视觉反馈
    const item = itemRefs.current[draggingId];
    if (item) {
      item.classList.remove('dragging-item');
    }

    // 重置所有拖拽状态
    setIsDragging(false);
    setDraggingId(null);
    setDraggingY(0);
    setDragOffsetY(0);
    setDragStartIndex(null);
    lastMoveYRef.current = 0;
    lastMoveTimeRef.current = 0;

    // 通知父组件顺序变化
    onOrderChange?.(audios.map(a => a.id));
  }, [isDragging, draggingId, onOrderChange, audios]);

  // 鼠标拖拽支持（桌面端）
  const handleMouseDown = useCallback((e: React.MouseEvent, audioId: string, index: number) => {
    if (disabled) return;
    if (e.button !== 0) return; // 只响应左键

    const item = itemRefs.current[audioId];
    if (!item) return;

    const startY = e.clientY;
    const rect = item.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    setDragOffsetY(offsetY);
    setDragStartIndex(index);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentY = moveEvent.clientY;
      const currentTime = Date.now();

      // 首次移动时进入拖拽模式
      if (!isDragging) {
        setIsDragging(true);
        setDraggingId(audioId);
        setDraggingY(rect.top);
      }

      // 限制更新频率为每16ms一次（约60fps）
      if (currentTime - lastMoveTimeRef.current < 16) return;
      lastMoveTimeRef.current = currentTime;

      setDraggingY(currentY - offsetY);

      // 计算目标位置
      const container = document.querySelector('.audio-list-container');
      if (!container) return;

      const items = container.querySelectorAll('[data-audio-item]');
      let targetIndex = dragStartIndex || index;

      items.forEach((item, idx) => {
        const itemRect = item.getBoundingClientRect();
        const itemCenterY = itemRect.top + itemRect.height / 2;

        if (currentY > itemCenterY && idx > (dragStartIndex || index)) {
          targetIndex = idx;
        } else if (currentY < itemCenterY && idx < (dragStartIndex || index)) {
          targetIndex = idx;
        }
      });

      // 更新列表
      const audioIndex = audios.findIndex(a => a.id === audioId);
      if (audioIndex !== -1 && audioIndex !== targetIndex) {
        setAudios(prev => {
          const next = [...prev];
          const [moved] = next.splice(audioIndex, 1);
          next.splice(targetIndex, 0, moved);
          return next;
        });
        setDragStartIndex(targetIndex);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // 清除视觉反馈
      const item = itemRefs.current[audioId];
      if (item) {
        item.classList.remove('dragging-item');
      }

      // 重置状态
      setIsDragging(false);
      setDraggingId(null);
      setDraggingY(0);
      setDragOffsetY(0);
      setDragStartIndex(null);
      lastMoveYRef.current = 0;
      lastMoveTimeRef.current = 0;

      // 通知父组件
      onOrderChange?.(audios.map(a => a.id));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [disabled, isDragging, dragStartIndex, audios, onOrderChange]);

  // 批量上传所有未上传的音频
  const handleUploadAll = useCallback(async () => {
    const pending = audios.filter((a) => !a.serverUrl && !a.uploading);
    for (const audio of pending) {
      await handleUploadSingle(audio.id);
    }
  }, [audios, handleUploadSingle]);

  // 音频数量变化时通知父组件
  useEffect(() => {
    onAudioCountChange?.(audios.length);
  }, [audios.length, onAudioCountChange]);

  // 音量变化时同步到所有音频播放器
  useEffect(() => {
    Object.values(audioRefs.current).forEach((el) => {
      if (el) el.volume = volume / 100;
    });
  }, [volume]);

  // 组件卸载时清理所有定时器
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false; // 标记组件已卸载
      clearAllTimers();
      // 清理所有音频播放器：先释放资源再撤销 blob URL
      Object.entries(audioRefs.current).forEach(([, el]) => {
        if (el) {
          // 记录当前 src 以便后续撤销
          const currentSrc = el.src;
          el.pause();
          el.removeAttribute('src');
          el.load();
          // 撤销 blob URL
          if (currentSrc && currentSrc.startsWith('blob:')) {
            URL.revokeObjectURL(currentSrc);
          }
        }
      });
      audioRefs.current = {};
    };
  }, [clearAllTimers]);

  // 全局触摸移动事件监听（用于拖拽过程中的移动）
  useEffect(() => {
    if (!isDragging) return;

    const handleTouchMove = (e: TouchEvent) => {
      handleTouchMoveDrag(e);
    };

    const handleTouchEnd = () => {
      handleTouchEndDrag();
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, handleTouchMoveDrag, handleTouchEndDrag]);

  const allUploaded = audios.length > 0 && audios.every((a) => a.serverUrl);
  const anyUploading = audios.some((a) => a.uploading);

  // 音量图标选择
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <>
      {/* 注入拖拽样式 */}
      <style dangerouslySetInnerHTML={{ __html: dragStyles }} />

      <div className="space-y-3 sm:space-y-6">

        {/* 模式切换 - 固定显示 */}
        <div className="flex flex-col items-center gap-2.5 pb-4 sm:pb-0 border-b border-border/40 sm:border-0">
          <ModeSwitch mode={mode} onModeChange={onModeChange || (() => {})} />
          <p className="text-xs text-muted-foreground/60 text-center leading-relaxed px-4">
            {mode === "default"
              ? "设置开始和结束时间，快速启动播放"
              : "创建定时任务，支持重复执行和任务管理"}
          </p>
        </div>

      {mode === "default" && (
      <>
      {/* 上传区域 - 设置页最上层独立展示 */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          processFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative p-4 sm:p-8 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer",
          "hover:border-[var(--brand-glow)]/60 hover:bg-[var(--brand-glow)]/5",
          dragOver && !disabled && "border-[var(--brand-glow)] bg-[var(--brand-glow)]/10 scale-[1.02]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
          multiple
          onChange={handleFileSelect}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div className="flex flex-col items-center gap-3 sm:gap-3 py-2 sm:py-0">
          <div className={cn(
            "p-3 sm:p-3 rounded-full bg-[var(--brand-glow)]/10 transition-transform duration-300",
            dragOver && !disabled && "scale-110"
          )}>
            <Upload className="w-6 h-6 sm:w-6 sm:h-6 text-[var(--brand-glow)]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground leading-relaxed px-2">
              {disabled ? "请先登录" : dragOver ? "松开以上传" : "点击或拖拽音频文件到此处"}
            </p>
            {audios.length > 0 && (
              <p className="text-xs text-[var(--brand-start)] font-medium">
                已添加 {audios.length}/{MAX_FILES} 个音频
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 游客提示 */}
      {showGuestTip && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-950/20 border border-amber-900/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <p className="text-sm text-amber-400">请先登录后再上传音频文件</p>
          <button
            onClick={() => setShowGuestTip(false)}
            className="text-amber-400/60 hover:text-amber-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 全局错误提示 */}
      {uploadError && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-950/20 border border-red-900/30">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400">{uploadError}</span>
          <button
            onClick={() => setUploadError(null)}
            className="ml-auto text-red-400/60 hover:text-red-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 音频列表区域 */}
      {audios.length > 0 && (
        <div className="space-y-3">
          {/* 列表头部 */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Music2 className="w-4 h-4 text-[var(--brand-start)]" />
              音频列表（{audios.length}）
              <span className="text-xs font-normal text-muted-foreground">
                · 拖拽调整播放顺序
              </span>
            </h3>
            {!allUploaded && user && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleUploadAll}
                disabled={anyUploading}
                className="rounded-lg text-xs h-8"
              >
                {anyUploading ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload className="w-3 h-3 mr-1" />
                    全部上传
                  </>
                )}
              </Button>
            )}
          </div>

          {/* 音频项列表 */}
          <div className="space-y-2 audio-list-container">
            {audios.map((audio, index) => {
              const isPlaying = playingId === audio.id;
              const currentTime = currentTimes[audio.id] || 0;
              const isDragging = dragIndex === index;
              const isCurrentlyDragging = isDragging && draggingId === audio.id;

              return (
                <div
                  key={audio.id}
                  data-audio-item={audio.id}
                  ref={(el) => { itemRefs.current[audio.id] = el; }}
                  draggable={!disabled}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  // 触摸事件 - 长按拖拽
                  onTouchStart={(e) => handleTouchStart(e, audio.id, index)}
                  // 鼠标事件 - 拖拽排序
                  onMouseDown={(e) => handleMouseDown(e, audio.id, index)}
                  onClick={() => togglePlay(audio.id)}
                  className={cn(
                    "group/audio relative backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden cursor-pointer select-none",
                    // 交换动画：慢速（700ms）+ 缓动曲线 + 轻微弹性
                    isSwapAnimating
                      ? "transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                      : "transition-all duration-200",
                    isDragging
                      ? "border-[var(--brand-start)] shadow-lg shadow-[var(--brand-start)]/15 scale-[1.02] opacity-80 z-10"
                      : isPlaying && audioPhase === "fading-in"
                        ? "border-cyan-500/40 ring-1 ring-cyan-500/20"
                        : isPlaying && audioPhase === "playing"
                          ? "border-[var(--brand-start)] ring-1 ring-[var(--brand-start)]/30"
                          : isPlaying && audioPhase === "fading-out"
                            ? "border-amber-500/40 ring-1 ring-amber-500/20"
                            : "hover:border-border",
                    disabled && "opacity-50 pointer-events-none"
                  )}
                  style={{
                    // 弥散渐变背景 - 根据播放阶段变化
                    ...(isPlaying && audioPhase === "fading-in"
                      ? { background: 'radial-gradient(ellipse at 20% 50%, color-mix(in srgb, #22d3ee 14%, transparent), color-mix(in srgb, #06b6d4 7%, transparent) 40%, color-mix(in srgb, #0891b2 2%, transparent) 70%, transparent 100%), var(--card)' }
                      : isPlaying && audioPhase === "playing"
                        ? { background: 'radial-gradient(ellipse at 20% 50%, color-mix(in srgb, var(--brand-start) 12%, transparent), color-mix(in srgb, var(--brand-mid) 6%, transparent) 40%, color-mix(in srgb, var(--brand-end) 2%, transparent) 70%, transparent 100%), var(--card)' }
                        : isPlaying && audioPhase === "fading-out"
                          ? { background: 'radial-gradient(ellipse at 20% 50%, color-mix(in srgb, #f59e0b 14%, transparent), color-mix(in srgb, #d97706 7%, transparent) 40%, color-mix(in srgb, #b45309 2%, transparent) 70%, transparent 100%), var(--card)' }
                          : { background: 'radial-gradient(ellipse at 30% 40%, color-mix(in srgb, var(--brand-start) 4%, transparent), transparent 60%), color-mix(in srgb, var(--card) 80%, transparent)' }),
                    ...(isCurrentlyDragging ? {
                      position: 'fixed',
                      top: draggingY,
                      left: 0,
                      right: 0,
                      zIndex: 9999,
                      transform: 'scale(1.02)',
                      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
                      opacity: 0.95,
                    } : {}),
                  }}
                >
                  {/* 顶部渐变条 */}
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-glow)]/20 to-transparent" />

                  <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                    {/* 主行：拖拽手柄 + 播放按钮 + 文件信息 + 操作 */}
                    <div className="flex items-center gap-3">
                      {/* 拖拽手柄 */}
                      <div
                        draggable={!disabled}
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className="flex-shrink-0 w-5 cursor-grab active:cursor-grabbing touch-none"
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover/audio:text-muted-foreground transition-colors" />
                      </div>

                      {/* 列表内播放按钮 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); togglePlay(audio.id); }}
                        className={cn(
                          "flex-shrink-0 w-9 h-9 rounded-lg bg-muted/80 border border-border/40 flex items-center justify-center active:scale-95 transition-all",
                          isPlaying && audioPhase === "fading-in"
                            ? "text-cyan-400 border-cyan-500/30"
                            : isPlaying && audioPhase === "playing"
                              ? "text-[var(--brand-start)] border-[var(--brand-start)]/30"
                              : isPlaying && audioPhase === "fading-out"
                                ? "text-amber-400 border-amber-500/30"
                                : "text-foreground hover:text-[var(--brand-start)] hover:border-[var(--brand-start)]/30"
                        )}
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5" fill="currentColor" />
                        ) : (
                          <Play className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />
                        )}
                      </button>

                      {/* 文件详情 */}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "font-medium text-sm truncate transition-colors",
                          isPlaying && audioPhase === "fading-in"
                            ? "text-cyan-400"
                            : isPlaying && audioPhase === "playing"
                              ? "text-[var(--brand-start)]"
                              : isPlaying && audioPhase === "fading-out"
                                ? "text-amber-400"
                                : "text-foreground group-hover/audio:text-[var(--brand-start)]"
                        )}>
                          {audio.file.name}
                        </p>
                        <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Volume2 className="w-3 h-3" />
                            {formatFileSize(audio.file.size)}
                          </span>
                          {audio.duration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(audio.duration)}
                            </span>
                          )}
                          {audio.serverUrl && (
                            <span className="flex items-center gap-1 text-green-500">
                              <CheckCircle2 className="w-3 h-3" />
                              已上传
                            </span>
                          )}
                          {audio.uploading && (
                            <span className="flex items-center gap-1 text-[var(--brand-start)]">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {audio.uploadProgress || 0}%
                            </span>
                          )}

                        </div>
                      </div>

                      {/* 操作按钮组 */}
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/audio:opacity-100 focus-within:opacity-100 transition-opacity">
                        {!audio.serverUrl && !audio.uploading && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!user) { setShowGuestTip(true); return; }
                              handleUploadSingle(audio.id);
                            }}
                            className="w-8 h-8 text-muted-foreground hover:text-[var(--brand-start)]"
                            title="上传此文件"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleRemove(audio.id); }}
                          className="w-8 h-8 text-muted-foreground hover:text-destructive"
                          title="移除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      {/* 始终显示删除按钮（移动端友好） */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleRemove(audio.id); }}
                        className="lg:hidden flex-shrink-0 w-8 h-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {/* 进度条 */}
                    {audio.duration > 0 && (
                      <div className=" space-y-1">
                        <input
                          type="range"
                          min={0}
                          max={audio.duration}
                          value={currentTime}
                          step={0.1}
                          onChange={(e) => { e.stopPropagation(); handleSeek(audio.id, parseFloat(e.target.value)); }}
                          className={cn(
                            "w-full h-1.5 rounded-full appearance-none bg-border/40 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125",
                            isPlaying && audioPhase === "fading-in"
                              ? "[&::-webkit-slider-thumb]:bg-cyan-400"
                              : isPlaying && audioPhase === "fading-out"
                                ? "[&::-webkit-slider-thumb]:bg-amber-400"
                                : "[&::-webkit-slider-thumb]:bg-[var(--brand-start)]"
                          )}
                          style={{
                            background: `linear-gradient(to right, ${
                              isPlaying && audioPhase === "fading-in" ? "#22d3ee"
                              : isPlaying && audioPhase === "fading-out" ? "#f59e0b"
                              : "var(--brand-start)"
                            } ${(currentTime / audio.duration) * 100}%, rgba(128,128,128,0.25) ${(currentTime / audio.duration) * 100}%)`,
                          }}
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                          <span>{formatDuration(currentTime)}</span>
                          <span>{formatDuration(audio.duration)}</span>
                        </div>
                      </div>
                    )}

                    {/* 上传进度条 */}
                    {audio.uploading && (
                      <div className=" space-y-1">
                        <div className="w-full h-1.5 rounded-full bg-border/40 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] transition-all duration-200"
                            style={{ width: `${audio.uploadProgress || 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* 单条错误提示 */}
                    {audio.uploadError && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-red-950/15 border border-red-900/20 ">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-xs text-red-400">{audio.uploadError}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between pt-2 px-1">
            <p className="text-xs text-muted-foreground">
              共 {audios.length} 个音频
              {audios.length > 1 && " · 拖拽调整播放顺序"}
              {allUploaded && user && " · 全部已上传"}
            </p>
            {audios.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("确定清空所有音频吗？")) {
                    try {
                      // 0. 标记正在清空，阻止后续状态更新
                      isClearingRef.current = true;

                      // 1. 先清理所有定时器（倒计时、渐变等）
                      clearAllTimers();

                      // 2. 停止所有正在播放的音频
                      Object.entries(audioRefs.current).forEach(([id, el]) => {
                        if (el) {
                          try {
                            el.pause();
                            el.src = '';
                          } catch {}
                          delete audioRefs.current[id];
                        }
                      });

                      // 3. 撤销 blob URL + 清理 IndexedDB
                      audios.forEach((a) => {
                        if (a.url && a.url.startsWith("blob:")) {
                          URL.revokeObjectURL(a.url);
                        }
                        if (a.dbKey) {
                          deleteAudioBlob(a.dbKey).catch(() => {});
                        }
                      });

                      // 4. 使用 setTimeout 确保在下一个事件循环中重置状态，避免渲染冲突
                      setTimeout(() => {
                        if (!isMountedRef.current) return;
                        setAudios([]);
                        setCurrentTimes({});
                        setPlayingId(null);
                        setIsCountingDown(false);
                        setCountdownPlayingId(null);
                        setCountdownStatus("等待开始");
                        setCountdownRemaining(0);
                        setAudioPhase("idle");
                        // 清空完成，重置标志
                        isClearingRef.current = false;
                      }, 0);
                    } catch (err) {
                      console.error("[AudioUpload] Clear all error:", err);
                      isClearingRef.current = false;
                    }
                  }
                }}
                className="text-xs text-muted-foreground hover:text-destructive h-7"
              >
                清空全部
              </Button>
            )}
          </div>
          {/* 倒计时状态显示 */}
          {(isCountingDown || countdownPlayingId) && (
            <div className="pt-4 border-t border-border/30">
              <div className="bg-[var(--brand-start)]/10 border border-[var(--brand-start)]/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--brand-start)] flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {countdownStatus}
                  </span>
                  {isCountingDown && (
                    <span className="text-lg font-mono font-bold text-[var(--brand-start)]">
                      {formatCountdownTime(countdownRemaining)}
                    </span>
                  )}
                </div>
                {isCountingDown && (
                  <div className="text-xs text-muted-foreground">
                    等待到 {startTime.month}/{startTime.day} {String(startTime.hour).padStart(2, "0")}:{String(startTime.minute).padStart(2, "0")} 开始播放
                  </div>
                )}
                {countdownPlayingId && (
                  <div className="text-xs text-muted-foreground">
                    将在 {endTime.month}/{endTime.day} {String(endTime.hour).padStart(2, "0")}:{String(endTime.minute).padStart(2, "0")} 自动停止
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 倒计时播放按钮 */}
          {/* 倒计时由播放页自动触发，无需前端按钮 */}
        </div>
      )}

            {/* 音量控制卡片 - 固定模块 */}

        <div className="bg-card dark:bg-card/80 backdrop-blur-sm border border-border/60 rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-[var(--brand-glow)]/20 to-transparent" />
          <div className="p-3 sm:p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <VolumeIcon className="w-3.5 h-3.5" />
                音量控制
              </label>
              <span className="text-sm font-mono font-semibold tabular-nums text-foreground">
                {volume}%
              </span>
            </div>

            <div className="relative pt-1 pb-1">
              <input
                ref={volumeSliderRef}
                type="range"
                min={0}
                max={100}
                value={volume}
                step={1}
                onInput={(e) => setVolume(parseInt((e.target as HTMLInputElement).value, 10))}
                className="w-full h-2.5 rounded-full appearance-none bg-border/30 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[var(--brand-start)]"
                style={{
                  background: `linear-gradient(to right, var(--brand-start) ${volume}%, rgba(128,128,128,0.2) ${volume}%)`,
                }}
              />
            </div>
          </div>
        </div>
      </>
      )}

        {/* 播放时段设置 - 仅默认模式显示 */}
        {mode === "default" && (
        <div className="bg-card dark:bg-card/80 backdrop-blur-sm border border-border/60 rounded-2xl overflow-hidden">
          <div className="h-px bg-gradient-to-r from-transparent via-[var(--brand-glow)]/20 to-transparent" />
          <div className="p-3 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Timer className="w-3.5 h-3.5" />
                播放时段
              </label>
              {startTime.year && endTime.year && (() => {
                const startMs = new Date(startTime.year, startTime.month - 1, startTime.day, startTime.hour, startTime.minute, startTime.second).getTime();
                const endMs = new Date(endTime.year, endTime.month - 1, endTime.day, endTime.hour, endTime.minute, endTime.second).getTime();
                const diffMin = Math.round((endMs - startMs) / 60000);
                if (diffMin > 0) {
                  const h = Math.floor(diffMin / 60);
                  const m = diffMin % 60;
                  return (
                    <span className="text-xs font-mono text-[var(--brand-start)] tabular-nums">
                      共 {h > 0 ? `${h}小时` : ''}{m > 0 ? `${m}分钟` : (h > 0 ? '' : '0分钟')}
                    </span>
                  );
                }
                return null;
              })()}
            </div>

              <WheelDateTimePicker
                label="开始时间"
                value={startTime}
                onChange={(v) => {
                  console.log('[onChange startTime]', JSON.stringify(v));
                  setStartTime(v);
                  validateStartTime(v);
                }}
              />

              <WheelDateTimePicker
                label="结束时间"
                value={endTime}
                onChange={(v) => {
                  console.log('[onChange endTime]', JSON.stringify(v));
                  setEndTime(v);
                  validateEndTime(v, startTime);
                }}
              />

              {!isStartTimeValid && (
                <div className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs text-red-400">{startTimeError}</span>
                </div>
              )}

              {!isEndTimeValid && (
                <div className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-xs text-red-400">{endTimeError}</span>
                </div>
              )}

              <div className="pt-2 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground/60 font-medium uppercase tracking-wider">音量渐入</span>
                  <span className="text-sm font-mono text-foreground tabular-nums">{fadeInDuration}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={fadeInDuration}
                  onChange={(e) => setFadeInDuration(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-border/30 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
                  style={{
                    background: `linear-gradient(to right, var(--brand-start) ${(fadeInDuration / 120) * 100}%, rgba(128,128,128,0.2) ${(fadeInDuration / 120) * 100}%)`,
                  }}
                />

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground/60 font-medium uppercase tracking-wider">音量渐出</span>
                  <span className="text-sm font-mono text-foreground tabular-nums">{fadeOutDuration}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={fadeOutDuration}
                  onChange={(e) => setFadeOutDuration(parseInt(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none bg-border/30 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125"
                  style={{
                    background: `linear-gradient(to right, var(--brand-start) ${(fadeOutDuration / 120) * 100}%, rgba(128,128,128,0.2) ${(fadeOutDuration / 120) * 100}%)`,
                  }}
                />

                <div className="mt-2 p-2.5 rounded-lg bg-muted/50 border border-border/30">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    💡 渐入将在开始时间前开始播放，渐出将在结束时间后完成。实际播放时段 = 目标音量时段。
                  </p>
                </div>
              </div>
          </div>
        </div>
        )}

        {/* 自定义任务内容 - 仅自定义模式显示 */}
        {mode === "custom" && children}

      {/* 一键梦枕按钮 - 仅默认模式显示 */}
      {mode === "default" && (
        <button
          onClick={handleDreamPillow}
          disabled={audios.length === 0 || !isStartTimeValid || !isEndTimeValid}
          className={cn(
            "w-full mt-4 relative overflow-hidden px-6 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform",
            (audios.length === 0 || !isStartTimeValid || !isEndTimeValid)
              ? "text-white/50 cursor-not-allowed opacity-60"
              : "text-[#050510] hover:-translate-y-1 fill-btn"
          )}
          style={{
            background: (audios.length === 0 || !isStartTimeValid || !isEndTimeValid)
              ? "linear-gradient(135deg, #666666 0%, #555555 50%, #666666 100%)"
              : "linear-gradient(135deg, #00d4aa 0%, #00b894 50%, #00d4aa 100%)",
            boxShadow: (audios.length === 0 || !isStartTimeValid || !isEndTimeValid)
              ? "0 2px 8px rgba(0, 0, 0, 0.2)"
              : "0 4px 15px rgba(0, 212, 170, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (audios.length > 0 && isStartTimeValid && isEndTimeValid) {
              e.currentTarget.style.background = "linear-gradient(135deg, #00e6b8 0%, #00cca3 50%, #00e6b8 100%)";
              e.currentTarget.style.boxShadow = "inset 0 3px 10px rgba(0, 0, 0, 0.5), 0 4px 20px rgba(0, 212, 170, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            if (audios.length > 0 && isStartTimeValid && isEndTimeValid) {
              e.currentTarget.style.background = "linear-gradient(135deg, #00d4aa 0%, #00b894 50%, #00d4aa 100%)";
              e.currentTarget.style.boxShadow = "0 4px 15px rgba(0, 212, 170, 0.3)";
            }
          }}
        >
          <span className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
            <span className="absolute inset-0 bg-white opacity-0 transition-opacity duration-300 group-active:opacity-20" />
          </span>
          <span className="relative flex items-center justify-center gap-2">
            <Image
              src="/logo.png"
              alt="梦枕"
              width={24}
              height={24}
              className={cn(
                "rounded shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]",
                (audios.length === 0 || !isStartTimeValid) && "opacity-50"
              )}
            />
            <span>
              {!isStartTimeValid ? "开始时间无效" : !isEndTimeValid ? "结束时间无效" : audios.length === 0 ? "请先上传音频" : "一键梦枕"}
            </span>
          </span>
        </button>
      )}

      {audios.map((audio) => (
        <audio
          key={audio.id}
          ref={(el) => {
            if (el) audioRefs.current[audio.id] = el;
          }}
          src={audio.url}
          preload="metadata"
          className="hidden"
        />
      ))}

      </div>
    </>
  );
}
