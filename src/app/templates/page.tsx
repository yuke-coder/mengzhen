'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, VolumeX, Clock, Music, Music2, Timer, Play, Pause, CheckCircle2, HardDrive } from 'lucide-react';
import DynamicBackground from '@/components/dynamic-background';
import { getAudioBlob } from '@/lib/audio-db';

// 类型定义
interface AudioItem {
  id: string;
  name: string;
  url: string;
  duration: number;
  fileKey?: string;
  serverUrl?: string;
  dbKey?: string;
  size?: number;
}

interface DreamConfig {
  audios: AudioItem[];
  order: string[];
  volume: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  playDuration: { hour: number; minute: number };
  startTime?: { hour: number; minute: number; second?: number; year?: number; month?: number; day?: number };
  endTime?: { hour: number; minute: number; second?: number; year?: number; month?: number; day?: number };
  createdAt: number;
}

// 辅助函数
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

export default function TemplatesPage() {
  const router = useRouter();

  // 状态
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isPlaying, setIsPlaying] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0); // 播放剩余时长
  const [countdownSeconds, setCountdownSeconds] = useState(0); // 倒计时秒数
  const [config, setConfig] = useState<DreamConfig | null>(null);
  const [currentAudioIndex, setCurrentAudioIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false); // 播放完毕状态
  const [volume, setVolume] = useState(70);
  const [hasConfig, setHasConfig] = useState(false);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false); // 配置是否已读取完成
  // 当前音频播放进度
  const [currentAudioElapsed, setCurrentAudioElapsed] = useState(0);
  const [currentAudioRemaining, setCurrentAudioRemaining] = useState(0);
  const [currentAudioName, setCurrentAudioName] = useState('');

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStartedRef = useRef(false); // 标记是否已开始播放
  const currentBlobUrlRef = useRef<string | null>(null); // 跟踪当前的 blob URL，用于清理
  const [endTime, setEndTime] = useState<{ hour: number; minute: number; second?: number; year?: number; month?: number; day?: number } | null>(null);

  // PWA: Web Worker 后台定时器（不受浏览器后台节流影响）
  const timerWorkerRef = useRef<Worker | null>(null);
  const playStartTimestampRef = useRef<number>(0); // 播放开始时的 Date.now()
  const isPlayingRef = useRef(false); // 标记是否正在播放（用于 handleEnd 防重复调用）
  const isFadingOutRef = useRef(false); // 标记是否正在渐出
  const isEndedRef = useRef(false); // 标记播放是否已结束

  // 渐入/渐出状态
  const [isFadingIn, setIsFadingIn] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [fadeInRemaining, setFadeInRemaining] = useState(0); // 渐入剩余秒数
  const [fadeOutRemaining, setFadeOutRemaining] = useState(0); // 渐出剩余秒数
  const [initialFadeOutSeconds, setInitialFadeOutSeconds] = useState(0); // 渐出开始时的初始剩余秒数（用于计算稳定的进度条）

  // PWA: Wake Lock（防止屏幕熄灭）
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // PWA: AudioContext（保持音频上下文活跃，解决自动播放限制）
  const audioContextRef = useRef<AudioContext | null>(null);

  // 获取或创建 Timer Worker
  const getTimerWorker = useCallback(() => {
    if (!timerWorkerRef.current) {
      timerWorkerRef.current = new Worker(
        new URL('@/lib/timer-worker.ts', import.meta.url)
      );
    }
    return timerWorkerRef.current;
  }, []);

  // 加载配置并计算倒计时
  useEffect(() => {
    const savedConfig = localStorage.getItem('dream_config');
    if (savedConfig) {
      try {
        const parsedConfig = JSON.parse(savedConfig) as DreamConfig;
        // 检查配置是否过期（24小时内）且包含必要字段
        if (parsedConfig && parsedConfig.startTime && Date.now() - parsedConfig.createdAt < 24 * 60 * 60 * 1000) {
          // 宽松校验：只要有音频列表就允许进入（fileKey 缺失时降级使用 serverUrl/url）
          if (!parsedConfig.audios || parsedConfig.audios.length === 0) {
            console.warn('[梦枕] 配置无音频列表，跳回设置页');
            localStorage.removeItem('dream_config');
            setHasConfig(false);
            setIsConfigLoaded(true);
            return;
          }

          // 标记缺少 fileKey 的音频（旧数据兼容）
          const missingKeys = parsedConfig.audios.filter((a: AudioItem) => !a.fileKey);
          if (missingKeys.length > 0) {
            console.warn(`[梦枕] ${missingKeys.length} 个音频缺少 fileKey，将尝试降级播放`);
          }

          // 清理已失效的 blob URL（页面刷新后失效）
          const cleanedConfig = {
            ...parsedConfig,
            audios: parsedConfig.audios.map((a: AudioItem) => ({
              ...a,
              url: a.serverUrl ? a.url : ''
            }))
          };
          setConfig(cleanedConfig);
          console.log('[梦枕] 配置加载成功, 音频列表:', cleanedConfig.audios?.map((a: AudioItem) => ({ name: a.name, fileKey: a.fileKey?.substring(0, 40) })));
          setVolume(parsedConfig.volume);
          setHasConfig(true);
          setIsConfigLoaded(true);
          setEndTime(parsedConfig.endTime || null);
          
          // 计算到实际播放开始时间的倒计时（开始时间 - 渐入时长，渐入在开始时间前完成）
          const now = new Date();
          const targetYear = parsedConfig.startTime.year ?? now.getFullYear();
          const targetMonth = parsedConfig.startTime.month ?? (now.getMonth() + 1);
          const targetDay = parsedConfig.startTime.day ?? now.getDate();
          const targetHour = parsedConfig.startTime.hour;
          const targetMinute = parsedConfig.startTime.minute;
          const targetSecond = parsedConfig.startTime.second ?? 0;
          
          // 渐入时长（秒）：渐入在开始时间之前完成，音频提前开始播放
          const fadeInDuration = parsedConfig.fadeInDuration ?? 0;
          
          // 使用完整日期创建目标时间（包含年、月、日）
          let targetTime = new Date(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute, targetSecond, 0);
          // 实际音频开始播放时间 = 开始时间 - 渐入时长
          targetTime = new Date(targetTime.getTime() - fadeInDuration * 1000);
          
          const countdownMs = targetTime.getTime() - now.getTime();
          const countdownSec = Math.ceil(countdownMs / 1000);
          
          console.log('[梦枕] 目标开始时间:', `${targetYear}-${targetMonth}-${targetDay} ${targetHour}:${targetMinute}:${targetSecond}`, '渐入:', fadeInDuration + '秒', '实际播放时间:', targetTime.toLocaleString(), '倒计时:', countdownSec, '秒');
          
          // ★ 倒计时为负时的处理（页面刷新时可能发生）
          if (countdownSec < 0) {
            // 计算到真正开始时间的秒数（不含渐入偏移）
            const startDateTime = new Date(targetYear, targetMonth - 1, targetDay, targetHour, targetMinute, targetSecond, 0);
            const toStartSec = Math.ceil((startDateTime.getTime() - now.getTime()) / 1000);
            
            // 检查结束时间
            if (parsedConfig.endTime) {
              const endYear = parsedConfig.endTime.year ?? targetYear;
              const endMonth = parsedConfig.endTime.month ?? (now.getMonth() + 1);
              const endDay = parsedConfig.endTime.day ?? targetDay;
              const endHour = parsedConfig.endTime.hour;
              const endMinute = parsedConfig.endTime.minute;
              const endSecond = parsedConfig.endTime.second ?? 0;
              // 使用完整日期创建结束时间
              const endDateTime = new Date(endYear, endMonth - 1, endDay, endHour, endMinute, endSecond, 0);
              const toEndSec = Math.ceil((endDateTime.getTime() - now.getTime()) / 1000);
              
              // 如果结束时间已过 → 返回设置页重新设置
              if (toEndSec <= 0) {
                console.log('[梦枕] 结束时间已过，刷新页面返回设置页');
                setHasConfig(false);
                setIsConfigLoaded(true);
                return;
              }
              
              // 如果还没到开始时间（仍在倒计时范围内刷新）→ 返回设置页
              if (toStartSec > 0) {
                console.log('[梦枕] 还未到开始时间，刷新页面返回设置页');
                setHasConfig(false);
                setIsConfigLoaded(true);
                return;
              }
              
              // ★ 已过开始时间但未到结束时间 → 继续播放（刷新后继续）
              console.log('[梦枕] 已过开始时间，继续播放. 距结束时间:', toEndSec, '秒');
              isStartedRef.current = true;
              isPlayingRef.current = true;
              setPlayStarted(true);
              setIsPlaying(true);
              setIsFadingIn(false); // 渐入阶段已过
              setCountdownSeconds(0);
              setRemainingSeconds(toEndSec);
              setIsConfigLoaded(true);
              return;
            } else {
              // 没有结束时间设置 → 返回设置页
              console.log('[梦枕] 结束时间未设置，刷新页面返回设置页');
              setHasConfig(false);
              setIsConfigLoaded(true);
              return;
            }
          }
          
          setCountdownSeconds(countdownSec);
          setRemainingSeconds(countdownSec); // 用于显示
        } else {
          localStorage.removeItem('dream_config');
          setHasConfig(false);
        }
      } catch {
        setHasConfig(false);
      }
      // 标记配置读取完成
      setIsConfigLoaded(true);
    } else {
      // 无任何配置，标记加载完成并跳转
      setIsConfigLoaded(true);
    }
  }, []);

  // 北京时间
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 停止播放
  const stopPlayback = useCallback(() => {
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }
    if (timerWorkerRef.current) {
      timerWorkerRef.current.postMessage({ type: 'stop' });
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsFadingOut(false);
    isFadingOutRef.current = false;
    setInitialFadeOutSeconds(0);
  }, []);

  // 取消播放并跳转
  const handleCancel = useCallback(() => {
    isStartedRef.current = false;
    stopPlayback();
    setRemainingSeconds(0);
    setCountdownSeconds(0);
    // 跳转到创作页面
    router.push('/settings');
  }, [router, stopPlayback]);

  const getPlayDurationSeconds = () => {
    if (!config?.playDuration) return 30 * 60;
    return (config.playDuration.hour * 60 + config.playDuration.minute) * 60;
  };

  // PWA: 请求屏幕唤醒锁
  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        const wakeLock = await navigator.wakeLock.request('screen');
        wakeLockRef.current = wakeLock;
        console.log('[梦枕] Wake Lock 已获取');

        // Wake Lock 可能在页面可见性变化时释放，重新获取
        const handleVisibilityChange = async () => {
          if (document.visibilityState === 'visible' && isStartedRef.current) {
            try {
              const newLock = await navigator.wakeLock.request('screen');
              wakeLockRef.current = newLock;
              console.log('[梦枕] Wake Lock 重新获取');
            } catch {
              // 忽略获取失败
            }
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        // 清理在组件卸载时处理
      }
    } catch (err) {
      console.warn('[梦枕] Wake Lock 获取失败:', err);
    }
  }, []);

  // PWA: 释放屏幕唤醒锁
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('[梦枕] Wake Lock 已释放');
      } catch {
        // 忽略释放失败
      }
    }
  }, []);

  // PWA: 初始化 AudioContext（在用户交互上下文中调用，保持音频播放权限）
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        audioContextRef.current = ctx;
        console.log('[梦枕] AudioContext 已创建, state:', ctx.state);
      } catch (err) {
        console.warn('[梦枕] AudioContext 创建失败:', err);
      }
    }
    // 确保 AudioContext 处于运行状态
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  // 获取总音频时长
  const getTotalDuration = () => {
    if (!config) return 0;
    return config.audios.reduce((acc, audio) => acc + (audio.duration || 0), 0);
  };

  // 暂停/恢复播放
  const togglePause = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  // 播放时长结束处理
  const handleEnd = useCallback(() => {
    if (isEndedRef.current) return;
    isEndedRef.current = true;

    if (timerWorkerRef.current) {
      timerWorkerRef.current.postMessage({ type: 'stop' });
    }

    releaseWakeLock();

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearInterval(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    setIsPlaying(false);
    isPlayingRef.current = false;
    isStartedRef.current = false;
    setIsCompleted(true);

    localStorage.removeItem('dream_config');
  }, [releaseWakeLock]);

  const playAudioHelperRef = useRef<((index: number, audio: HTMLAudioElement) => Promise<void>) | null>(null);

  // 播放音频辅助函数
  const playAudioHelper = useCallback(async (index: number, audio: HTMLAudioElement) => {
    if (!config) return;

    const orderedAudios = config.order.map(id => config.audios.find(a => a.id === id)).filter(Boolean) as AudioItem[];
    const currentAudio = orderedAudios[index % orderedAudios.length];

    if (!currentAudio) return;

    // URL 优先级：fileKey(代理) > serverUrl(直连) > dbKey(IndexedDB) > url(blob降级)
    let audioUrl: string | undefined;

    if (currentAudio.fileKey) {
      audioUrl = `/api/audio/proxy?key=${encodeURIComponent(currentAudio.fileKey)}`;
    } else if (currentAudio.serverUrl) {
      audioUrl = currentAudio.serverUrl;
    } else if (currentAudio.dbKey) {
      // 游客模式：从 IndexedDB 读取音频文件
      try {
        const blob = await getAudioBlob(currentAudio.dbKey);
        if (blob) {
          audioUrl = URL.createObjectURL(blob);
          currentBlobUrlRef.current = audioUrl; // 保存引用以便后续清理
          console.log('[梦枕] 从 IndexedDB 读取音频成功:', currentAudio.name);
        } else {
          console.error('[梦枕] IndexedDB 中未找到音频:', currentAudio.dbKey);
        }
      } catch (err) {
        console.error('[梦枕] 从 IndexedDB 读取音频失败:', err);
      }
    }

    // blob URL 在页面刷新后会失效，不再作为降级方案
    // 如果没有有效的持久化访问方式，音频无法播放
    if (!audioUrl) {
      console.error('[梦枕] 音频', currentAudio.name, '没有有效的持久化访问方式（fileKey/serverUrl/dbKey），无法播放');
    }

    // 先设置错误和结束事件处理器，确保即使 URL 无效也能被捕获
    // orderedAudios 已在第 337 行声明
    
    // 音频加载/播放错误
    audio.onerror = () => {
      console.error('[梦枕] 音频加载/播放错误:', audio.error?.code, audio.error?.message, 'URL:', audioUrl);
      // 尝试播放下一个音频
      const nextIndex = index + 1;
      if (nextIndex < orderedAudios.length && isStartedRef.current) {
        const nextAudio = new Audio();
        audioRef.current = nextAudio;
        playAudioHelperRef.current?.(nextIndex, nextAudio);
      } else {
        // 所有音频都无法播放，停止播放（不跳转，用户刷新后返回）
        console.error('[梦枕] 所有音频都无法播放');
        stopPlayback();
        setIsCompleted(true);
        // 不跳转，用户刷新页面时再返回设置页
      }
    };

    // 音频结束
    audio.onended = () => {
      const nextIndex = index + 1;
      if (nextIndex < orderedAudios.length && isStartedRef.current) {
        const nextAudio = new Audio();
        audioRef.current = nextAudio;
        playAudioHelperRef.current?.(nextIndex, nextAudio);
      } else {
        stopPlayback();
        setIsCompleted(true);
      }
    };

    if (!audioUrl) {
      console.error('[梦枕] 无法获取音频 URL:', currentAudio.name);
      // 触发 onerror，让它来处理切换到下一个音频
      audio.onerror(new Event('error'));
      return;
    }

    console.log('[梦枕] 准备播放音频:', currentAudio.name, '来源:', currentAudio.fileKey ? '代理' : currentAudio.serverUrl ? '直连' : currentAudio.dbKey ? 'IndexedDB' : 'blob');
    audio.src = audioUrl;
    audio.load();
    audio.volume = 0;
    setCurrentAudioIndex(index);
    setCurrentAudioName(currentAudio.name);

    // 渐入
    setIsFadingIn(true);
    const targetVolume = volume / 100;
    const fadeInStep = targetVolume / (config.fadeInDuration * 10);
    let vol = 0;
    let fadeInTicks = 0;
    const totalFadeInTicks = config.fadeInDuration * 10; // 总tick数
    setFadeInRemaining(config.fadeInDuration);

    fadeTimerRef.current = setInterval(() => {
      fadeInTicks++;
      vol = Math.min(vol + fadeInStep, targetVolume);
      audio.volume = vol;
      const remainingSecs = Math.max(0, Math.ceil((totalFadeInTicks - fadeInTicks) / 10));
      setFadeInRemaining(remainingSecs);
      if (vol >= targetVolume) {
        if (fadeTimerRef.current) {
          clearInterval(fadeTimerRef.current);
          fadeTimerRef.current = null;
        }
        setIsFadingIn(false);
        setFadeInRemaining(0);
        // 渐入完成，标记正在播放
        isPlayingRef.current = true;
      }
    }, 100);

    audio.play().catch(console.error);

    // PWA: 注册 Media Session API（锁屏/通知栏播放控制）
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentAudio.name || '梦枕音频',
        artist: '梦枕',
        album: '定时播放'
      });
      navigator.mediaSession.setActionHandler('play', () => {
        audio.play().catch(() => {});
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audio.pause();
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        handleEnd();
      });
    }

    // 音频时间更新
    const handleTimeUpdate = () => {
      setCurrentAudioElapsed(audio.currentTime);
      setCurrentAudioRemaining(audio.duration - audio.currentTime);

      // 更新剩余时间显示（结束时间检查由独立定时器负责）
      const endHour = endTime?.hour ?? -1;
      const endMinute = endTime?.minute ?? -1;

      if (endHour >= 0 && endMinute >= 0) {
        const now = new Date();
        let endDateTime: Date;
        if (endTime?.year && endTime?.month && endTime?.day) {
          endDateTime = new Date(endTime.year, endTime.month - 1, endTime.day, endTime.hour, endTime.minute, endTime.second ?? 0, 0);
        } else {
          endDateTime = new Date(now);
          endDateTime.setHours(endHour, endMinute, endTime?.second ?? 0, 0);
        }
        const remainingMs = endDateTime.getTime() - now.getTime();
        const remainingSec = Math.ceil(remainingMs / 1000);
        // 注意：播放中的剩余时间由独立的 useEffect 更新，这里不再设置
      } else {
        // 按播放时长倒计时
        // 注意：播放中的剩余时间由独立的 useEffect 更新，这里不再设置
      }
    };

    audio.ontimeupdate = handleTimeUpdate;

    audio.dataset.startTime = Date.now().toString();
  }, [config, volume, endTime, stopPlayback, router]);

  useEffect(() => {
    playAudioHelperRef.current = playAudioHelper;
  }, [playAudioHelper]);

  // 自动倒计时：配置加载后自动开始，倒计时结束触发播放
  // PWA: 使用 Web Worker 保持后台精确计时，使用 Date.now() 差值避免累计误差
  useEffect(() => {
    if (!config || countdownSeconds <= 0) return;

    console.log(`[梦枕] 自动开始倒计时: ${countdownSeconds} 秒`);

    // PWA: 获取屏幕唤醒锁，防止倒计时期间屏幕熄灭
    requestWakeLock();
    // PWA: 初始化 AudioContext（利用用户跳转页面的交互上下文）
    ensureAudioContext();

    const targetTime = Date.now() + countdownSeconds * 1000;
    setRemainingSeconds(countdownSeconds);

    // PWA: 使用 Web Worker 运行倒计时（不受后台节流影响）
    const worker = getTimerWorker();

    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'countdown') {
        setRemainingSeconds(e.data.remainingSec);
        if (e.data.remainingSec % 10 === 0 || e.data.remainingSec <= 5) {
          console.log(`[梦枕] 倒计时剩余: ${e.data.remainingSec} 秒`);
        }
      } else if (e.data.type === 'countdownEnded') {
        console.log('[梦枕] 倒计时结束，开始播放');
        isStartedRef.current = true;
        isPlayingRef.current = true;
        setIsPlaying(true);
        setRemainingSeconds(0);
        // 倒计时结束，Worker 的 countdown 任务自动清理
      }
    };

    worker.addEventListener('message', handleMessage);
    worker.postMessage({ type: 'startCountdown', targetTime });

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.postMessage({ type: 'stopCountdown' });
    };
  }, [config, countdownSeconds, getTimerWorker, requestWakeLock, ensureAudioContext]);

  // 无配置时自动返回设置页（等配置读取完成后再判断）
  // 播放完毕后保持完成页面，不自动返回，用户手动点击返回按钮
  useEffect(() => {
    if (!isConfigLoaded) return; // 配置还没读完，不判断

    if (!hasConfig) {
      router.replace('/settings');
    }
  }, [hasConfig, isConfigLoaded]);

  // 开始播放
  useEffect(() => {
    if (!isPlaying || !config || !isStartedRef.current) return;

    console.log('[梦枕] 开始播放音频');
    playStartTimestampRef.current = Date.now();

    // 计算从当前时间到结束时间的实际剩余秒数（不含渐出时长）
    if (endTime) {
      const now = new Date();
      let endDateTime: Date;
      if (endTime.year && endTime.month && endTime.day) {
        endDateTime = new Date(endTime.year, endTime.month - 1, endTime.day, endTime.hour, endTime.minute, endTime.second ?? 0, 0);
      } else {
        endDateTime = new Date(now);
        endDateTime.setHours(endTime.hour, endTime.minute, endTime.second ?? 0, 0);
      }
      // 真正的播放结束时间（不含渐出时长）
      const fadeOutSec = config.fadeOutDuration ?? 0;
      const playEndTimestamp = endDateTime.getTime() - fadeOutSec * 1000;
      const actualRemaining = Math.max(0, Math.ceil((playEndTimestamp - Date.now()) / 1000));
      console.log('[梦枕] 设置播放剩余时间:', actualRemaining, '秒 (基于结束时间计算)');
      setRemainingSeconds(actualRemaining);
    }

    // PWA: 确保 AudioContext 活跃（解决自动播放限制）
    ensureAudioContext();
    
    // 开始播放第一个音频（空 Audio，由 playAudioHelper 设置真实 URL）
    const orderedAudios = config.order.map(id => config.audios.find(a => a.id === id)).filter(Boolean) as AudioItem[];
    const firstAudio = orderedAudios[0];
    
    if (!firstAudio) {
      console.error('[梦枕] 播放列表为空，无法开始播放');
      return;
    }
    
    console.log('[梦枕] 即将播放首个音频:', firstAudio.name, 'fileKey:', firstAudio.fileKey?.substring(0,30), 'serverUrl:', !!firstAudio.serverUrl);
    const audio = new Audio();
    audio.volume = 0;
    audioRef.current = audio;
    playAudioHelper(0, audio);
  }, [isPlaying, config, playAudioHelper, ensureAudioContext]);

  // PWA: 渐出定时器（渐入完成后启动独立的渐出倒计时）
  // 使用 playStartedRef 触发，确保组件挂载时如果已经在播放状态也能启动
  const [playStarted, setPlayStarted] = useState(false);
  
  // 当渐入完成时，标记播放已开始
  useEffect(() => {
    if (!isFadingIn && isPlaying && !playStarted) {
      setPlayStarted(true);
    }
  }, [isFadingIn, isPlaying, playStarted]);
  
  // 播放期间持续更新剩余时间（基于结束时间，不含渐出时长）
  useEffect(() => {
    if (!isPlaying || !isStartedRef.current || !endTime) {
      console.log('[梦枕] 播放更新useEffect: 条件不满足, isPlaying:', isPlaying, 'isStarted:', isStartedRef.current, 'endTime:', !!endTime);
      return;
    }
    
    // 如果渐出已经开始，不更新（由渐出定时器负责）
    if (isFadingOutRef.current) {
      console.log('[梦枕] 播放更新useEffect: 渐出已开始，停止更新');
      return;
    }
    
    console.log('[梦枕] 播放更新useEffect: 开始每秒更新剩余时间');
    const fadeOutSec = config?.fadeOutDuration ?? 0;
    
    // 构造结束时间戳
    const now = new Date();
    let endDateTime: Date;
    if (endTime.year && endTime.month && endTime.day) {
      endDateTime = new Date(endTime.year, endTime.month - 1, endTime.day, endTime.hour, endTime.minute, endTime.second ?? 0, 0);
    } else {
      endDateTime = new Date(now);
      endDateTime.setHours(endTime.hour, endTime.minute, endTime.second ?? 0, 0);
    }
    
    // 真正的播放结束时间（不含渐出时长）
    const playEndTimestamp = endDateTime.getTime() - fadeOutSec * 1000;
    
    const updateRemaining = () => {
      // 每次更新前再次检查渐出状态
      if (isFadingOutRef.current) {
        console.log('[梦枕] 播放更新useEffect: 渐出已开始，停止更新 remaining');
        return;
      }
      const now = Date.now();
      const remaining = Math.ceil((playEndTimestamp - now) / 1000);
      const clamped = Math.max(0, remaining);
      console.log('[梦枕] 更新remaining:', clamped, '秒 (播放中)');
      setRemainingSeconds(clamped);
    };
    
    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    
    return () => {
      console.log('[梦枕] 播放更新useEffect: 清理定时器');
      clearInterval(interval);
    };
  }, [isPlaying, isFadingOut, endTime, config?.fadeOutDuration]);
  
  useEffect(() => {
    // 只有当渐入完成（isFadingIn 变为 false）且正在播放时，才启动渐出定时器
    // 或者播放已经开始但还未启动过渐出定时器
    if (isFadingIn || !isPlaying || !isStartedRef.current || !endTime || !config) return;
    if (playStarted && isFadingOutRef.current) return; // 渐出定时器已启动
    
    const fadeOutSec = config.fadeOutDuration ?? 0;
    if (fadeOutSec <= 0) return; // 没有设置渐出时长，不启动

    // 构造结束时间戳
    const now = new Date();
    let endDateTime: Date;
    if (endTime.year && endTime.month && endTime.day) {
      endDateTime = new Date(endTime.year, endTime.month - 1, endTime.day, endTime.hour, endTime.minute, endTime.second ?? 0, 0);
    } else {
      endDateTime = new Date(now);
      endDateTime.setHours(endTime.hour, endTime.minute, endTime.second ?? 0, 0);
    }

    // 真正的停止时间 = 结束时间 + 渐出时长
    const stopTimestamp = endDateTime.getTime() + fadeOutSec * 1000;
    const totalFadeOutMs = fadeOutSec * 1000;

    // 如果停止时间已过，立即停止
    if (stopTimestamp <= Date.now()) {
      console.log('[梦枕] 结束时间+渐出时长已过，立即停止播放');
      handleEnd();
      return;
    }

    console.log('[梦枕] 启动渐出定时器. 结束时间:', `${endTime.hour}:${endTime.minute}`, '渐出:', fadeOutSec + '秒', '停止时间:', new Date(stopTimestamp).toLocaleTimeString());

    // 启动独立的渐出 Worker
    const worker = getTimerWorker();

    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'tick') {
        const remainingMs = e.data.remainingMs;
        const remainingSec = Math.ceil(remainingMs / 1000);
        
        // 渐出阶段只由 Worker 更新 remainingSeconds
        // 在渐出阶段，remainingSec 代表渐出剩余时间
        console.log('[梦枕] 渐出Worker tick: remainingSec=', remainingSec, 'fadeOutMs=', totalFadeOutMs);
        setRemainingSeconds(Math.max(0, remainingSec));

        // 渐出逻辑：当剩余时间 <= 渐出时长时，逐渐降低音量
        if (remainingMs <= totalFadeOutMs) {
          if (!isFadingOutRef.current) {
            isFadingOutRef.current = true;
            setIsFadingOut(true);
            setInitialFadeOutSeconds(Math.ceil(totalFadeOutMs / 1000)); // 记录渐出开始时的初始剩余秒数
            console.log('[梦枕] 开始渐出, fadeRatio开始从1降');
          }
          // 渐出比例：remainingMs 从 totalFadeOutMs 降到 0，比值从 1 降到 0
          const fadeRatio = Math.max(0, remainingMs / totalFadeOutMs);
          console.log('[梦枕] 渐出中: fadeRatio=', fadeRatio.toFixed(3));
          const targetVol = config.volume / 100;
          const newVolume = targetVol * fadeRatio;
          if (audioRef.current) {
            audioRef.current.volume = Math.max(0, Math.min(targetVol, newVolume));
          }
          setFadeOutRemaining(Math.ceil(remainingMs / 1000));
        }
      } else if (e.data.type === 'ended') {
        console.log('[梦枕] 渐出完毕(Worker发送ended)，停止播放');
        setIsFadingOut(false);
        isFadingOutRef.current = false;
        setInitialFadeOutSeconds(0);
        handleEnd();
      }
    };

    worker.addEventListener('message', handleMessage);
    worker.postMessage({ type: 'start', endTime: stopTimestamp });

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.postMessage({ type: 'stopEndTimer' });
    };
  }, [isFadingIn, isPlaying, endTime, config, handleEnd, getTimerWorker]);

  // 格式化时间 - 只显示时分秒
  const formatTime = (date: Date) => {
    return date.toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Shanghai'
    });
  };

  // 格式化日期 - 年月日
  const formatDate = (date: Date) => {
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false,
      timeZone: 'Asia/Shanghai'
    }).replace(/\//g, '-');
  };

  const formatCountdown = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    if (safeSeconds >= 3600) {
      // 超过1小时显示 HH:MM:SS
      const hrs = Math.floor(safeSeconds / 3600);
      const mins = Math.floor((safeSeconds % 3600) / 60);
      const secs = safeSeconds % 60;
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    // 不足1小时显示 MM:SS
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 格式化音频时间 (MM:SS)
  const formatAudioTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const m = Math.floor(safeSeconds / 60);
    const s = safeSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 获取当前播放音频名称
  const getCurrentAudioName = () => {
    if (!config) return currentAudioName;
    const orderedAudios = config.order.map(id => config.audios.find(a => a.id === id)).filter(Boolean) as AudioItem[];
    return orderedAudios[currentAudioIndex % orderedAudios.length]?.name || currentAudioName;
  };

  // 获取下一个播放音频名称
  const getNextAudioName = () => {
    if (!config || config.order.length <= 1) return '';
    const orderedAudios = config.order.map(id => config.audios.find(a => a.id === id)).filter(Boolean) as AudioItem[];
    const nextIndex = (currentAudioIndex + 1) % orderedAudios.length;
    return orderedAudios[nextIndex]?.name || '';
  };

  // 当前音频时长
  const currentAudioDuration = (() => {
    if (!config || !config.order.length) return 0;
    const orderedAudios = config.order.map(id => config.audios.find(a => a.id === id)).filter(Boolean) as AudioItem[];
    return orderedAudios[currentAudioIndex % orderedAudios.length]?.duration || 0;
  })();

  const fadeCountdown = useMemo(() => {
    if (!config?.startTime) return null;
    const startYear = config.startTime.year ?? new Date().getFullYear();
    const startMonth = config.startTime.month ?? 1;
    const startDay = config.startTime.day ?? 1;
    const startHour = config.startTime.hour;
    const startMinute = config.startTime.minute;
    const startSecond = config.startTime.second ?? 0;
    const fadeIn = config.fadeInDuration;
    const startDate = new Date(startYear, startMonth - 1, startDay, startHour, startMinute, startSecond, 0);
    const fadeDate = new Date(startDate.getTime() - fadeIn * 1000);
    const now = Date.now();
    const fadeMs = fadeDate.getTime() - now;
    const fadeSec = Math.max(0, Math.ceil(fadeMs / 1000));
    const hours = Math.floor(fadeSec / 3600);
    const minutes = Math.floor((fadeSec % 3600) / 60);
    const seconds = fadeSec % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, [config, currentTime]);

  const startCountdown = useMemo(() => {
    if (!config?.startTime) return null;
    const startYear = config.startTime.year ?? new Date().getFullYear();
    const startMonth = config.startTime.month ?? 1;
    const startDay = config.startTime.day ?? 1;
    const startHour = config.startTime.hour;
    const startMinute = config.startTime.minute;
    const startSecond = config.startTime.second ?? 0;
    const startDate = new Date(startYear, startMonth - 1, startDay, startHour, startMinute, startSecond, 0);
    const now = Date.now();
    const startMs = startDate.getTime() - now;
    const startSec = Math.max(0, Math.ceil(startMs / 1000));
    const hours = Math.floor(startSec / 3600);
    const minutes = Math.floor((startSec % 3600) / 60);
    const seconds = startSec % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, [config, currentTime]);

  return (
    <div className="min-h-screen text-foreground overflow-x-hidden relative z-10" suppressHydrationWarning>
      <DynamicBackground />

      {/* 主内容区域 */}
      <main className="flex flex-col items-center justify-center min-h-screen pt-14 px-4">
        {hasConfig ? (
          <>
            {/* 状态信息栏 - 顶部卡片 */}
            <div className="relative p-3 rounded-xl border transition-all text-left group overflow-hidden border-transparent hover:border-primary/30 mb-8">
              {/* Hover渐变背景 */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-br from-[#CC28FB]/10 via-[#CC28FB]/5 to-transparent pointer-events-none" />
              <div className="relative z-10 text-center">
                {isCompleted ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/30">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-sm text-green-500">播放完毕</span>
                  </div>
                ) : isPlaying ? (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#00d4aa]/10 border border-[#00d4aa]/30">
                    <div className="w-2 h-2 rounded-full bg-[#00d4aa] animate-pulse" />
                    <span className="text-sm text-[#00d4aa]">{isFadingOut ? '渐出中' : isFadingIn ? '渐入中' : '播放中'} · {formatAudioTime(currentAudioElapsed)}</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#CC28FB]/10 border border-[#CC28FB]/30">
                    <div className="w-2 h-2 rounded-full bg-[#CC28FB]" />
                    <span className="text-sm text-[#CC28FB]">等待中 · {formatCountdown(remainingSeconds)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 核心时间显示 - 中间大数字 */}
            <div className="text-center mb-12">
              {/* 时分秒 - 大数字：始终显示北京时间 */}
              <div
                className="text-6xl md:text-7xl font-bold text-white/90 tracking-wider"
                style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
              >
                {formatTime(currentTime)}
              </div>
              {/* 世纪年月日 - 小字显示在下方 */}
              <div 
                className="text-xs text-white/40 mt-4 tracking-wider"
                style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}
              >
                {formatDate(currentTime)}
              </div>
            </div>

            {/* 信息区域 - 左右分布 */}
            <div className="w-full max-w-4xl px-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* 左侧：音频信息 - 三种状态 */}
                <div className="relative bg-card/80 backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden">
                  {/* 顶部渐变条 */}
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-glow)]/20 to-transparent" />

                  <div className="p-4 space-y-3">

                    {/* ===== 状态1: 播放完毕 ===== */}
                    {isCompleted ? (
                      <div className="text-center py-6 space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                          <CheckCircle2 className="w-8 h-8 text-green-400" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-white/90">本次播放完毕</h3>
                          <p className="text-sm text-muted-foreground mt-1">感谢使用梦枕，祝好梦</p>
                        </div>
                        <button
                          onClick={() => router.push('/settings')}
                          className="px-5 py-2.5 rounded-lg bg-[var(--brand-start)]/15 border border-[var(--brand-start)]/30 text-[var(--brand-start)] text-sm font-medium hover:bg-[var(--brand-start)]/25 active:scale-[0.98] transition-all"
                        >
                          返回进行下一次播放自定义
                        </button>
                      </div>

                    /* ===== 状态2: 播动中 - 上部分=当前播放，下部分=下一个 ===== */
                    ) : isPlaying ? (
                      <>
                        {/* 获取当前播放音频的完整信息 */}
                        {(() => {
                          const orderedAudios = config?.order?.map((id: string) => config?.audios?.find((a: AudioItem) => a.id === id)).filter(Boolean) as AudioItem[] || [];
                          const currentAudio = orderedAudios[currentAudioIndex % orderedAudios.length];
                          return (
                          <>
                          {/* 主行：暂停按钮 + 文件信息 + 状态标签 */}
                          <div className="flex items-center gap-3">
                            {/* 暂停按钮 */}
                            <button
                              onClick={togglePause}
                              className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#00d4aa]/10 border border-[#00d4aa]/20 flex items-center justify-center text-[#00d4aa] hover:bg-[#00d4aa]/20 active:scale-95 transition-all"
                            >
                              <Pause className="w-3.5 h-3.5" fill="currentColor" />
                            </button>

                            {/* 文件详情 */}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate text-[var(--brand-start)]">
                                {currentAudioName || '正在播放'}
                              </p>
                              <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                                {currentAudio && currentAudio.size && currentAudio.size > 0 && (
                                  <span className="flex items-center gap-1">
                                    <HardDrive className="w-3 h-3" />
                                    {currentAudio.size >= 1024 * 1024 
                                      ? `${(currentAudio.size / (1024 * 1024)).toFixed(1)}MB` 
                                      : `${Math.round(currentAudio.size / 1024)}KB`}
                                  </span>
                                )}
                                {currentAudioDuration > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {formatAudioTime(currentAudioDuration)}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 text-[var(--brand-start)]">
                                  <Volume2 className="w-3 h-3" />
                                  已播 {formatAudioTime(currentAudioElapsed)}
                                </span>
                                {currentAudioDuration > 0 && currentAudioElapsed < currentAudioDuration && (
                                  <span className="flex items-center gap-1 text-white/60">
                                    <Clock className="w-3 h-3" />
                                    剩余: {formatAudioTime(currentAudioDuration - currentAudioElapsed)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* 状态标签：播放中/渐入中/渐出中 */}
                            <div className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#00d4aa]/10 border border-[#00d4aa]/20">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#00d4aa] animate-pulse" />
                              <span className="text-[11px] text-[#00d4aa] font-medium">
                                {isFadingOut ? '渐出中' : isFadingIn ? '渐入中' : '播放中'}
                              </span>
                            </div>
                          </div>

                          {/* 进度条 */}
                          {currentAudioDuration > 0 && (
                            <div className="space-y-1">
                              <div className="w-full h-1.5 rounded-full appearance-none bg-border/40 cursor-pointer overflow-hidden">
                                <div
                                  className="h-full bg-[var(--brand-start)] rounded-full transition-all duration-300"
                                  style={{ width: `${(currentAudioElapsed / currentAudioDuration) * 100}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                <span>{formatAudioTime(currentAudioElapsed)}</span>
                                <span>{formatAudioTime(currentAudioDuration)}</span>
                              </div>
                            </div>
                          )}
                          </>
                          );
                        })()}

                        {/* 下部分：下一个即将播放的音频 */}
                        {getNextAudioName() && config && config.order.length > 1 && (() => {
                          const nextIdx = currentAudioIndex + 1;
                          const nextAudio = nextIdx < config.audios.length
                            ? (config.order.length > 0
                              ? config.audios.find(a => a.id === config.order[nextIdx])
                              : config.audios[nextIdx])
                            : null;
                          return (
                            <div className="pt-3 space-y-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Play className="w-3.5 h-3.5" />
                                <span>下一个播放</span>
                              </div>
                              {nextAudio ? (
                                <div className="pl-5 space-y-1.5">
                                  <p className="font-medium text-sm text-foreground/80 truncate">{nextAudio.name}</p>
                                  <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                                    {nextAudio.size != null && (
                                      <span>{typeof nextAudio.size === 'number' && nextAudio.size > 1024 * 1024 ? `${(nextAudio.size / (1024 * 1024)).toFixed(1)}MB` : `${Math.round(nextAudio.size / 1024)}KB`}</span>
                                    )}
                                    {nextAudio.duration != null && nextAudio.duration > 0 && (
                                      <span>{formatAudioTime(nextAudio.duration)}</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <p className="pl-5 text-xs text-muted-foreground">{getNextAudioName()}</p>
                              )}
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      /* ===== 状态3: 等待中 - 显示第一个待播放音频详情（样式同设置页列表）+ 倒计时 ===== */
                      <>
                        {/* 标题行 */}
                        <div className="flex items-center gap-2 pb-2 border-b border-border/30">
                          <Play className="w-4 h-4 text-[var(--brand-start)]" />
                          <span className="text-xs font-medium text-[var(--brand-start)]">即将播放</span>
                          {config?.audios && config.audios.length > 1 && (
                            <span className="text-xs text-muted-foreground">（共 {config.audios.length} 首）</span>
                          )}
                        </div>

                        {/* 第一个音频详情 - 完全同设置页列表样式 */}
                        {config?.audios && config.audios.length > 0 ? (() => {
                          const firstAudio = config.order.length > 0
                            ? (config.audios.find(a => a.id === config.order[0]) || config.audios[0])
                            : config.audios[0];
                          return (
                            <div className="space-y-2.5">
                              {/* 音频名称行 - 同设置页 */}
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#CC28FB]/10 border border-[#CC28FB]/20 flex items-center justify-center">
                                    <Music2 className="w-4 h-4 text-[#CC28FB]" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm text-foreground truncate">{firstAudio.name || '音频文件'}</p>
                                    <div className="flex items-center gap-2.5 mt-0.5 text-[11px] text-muted-foreground">
                                      {firstAudio.size != null && (
                                        <span className="flex items-center gap-1">
                                          <Volume2 className="w-3 h-3" />
                                          {typeof firstAudio.size === 'number' && firstAudio.size > 0
                                            ? (firstAudio.size >= 1024 * 1024 ? `${(firstAudio.size / (1024 * 1024)).toFixed(1)}MB` : `${Math.round(firstAudio.size / 1024)}KB`)
                                            : '--'}
                                        </span>
                                      )}
                                      {firstAudio.duration != null && firstAudio.duration > 0 && (
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          {formatAudioTime(firstAudio.duration)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {/* 已就绪标签 - 同设置页 */}
                                {firstAudio.url && (
                                  <div className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/20">
                                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                                    <span className="text-[11px] text-green-500 font-medium">已就绪</span>
                                  </div>
                                )}
                              </div>

                              {/* 倒计时区域 - 已删除，保留音频信息 */}
                              {/* 
                              原倒计时区域已删除，让音频信息完整显示
                              */}
                            </div>
                          );
                        })() : (
                          <p className="text-sm text-muted-foreground">暂无音频</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* 右侧：倒计时 / 剩余播放时长 */}
                <div className="relative p-3 rounded-xl border transition-all text-left group overflow-hidden bg-card border-border hover:border-primary/30 hover:bg-accent/50">
                  {/* Hover渐变背景 */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-gradient-to-br from-[#CC28FB]/10 via-[#CC28FB]/5 to-transparent pointer-events-none" />
                  <div className="relative z-10 space-y-4">
                  {isCompleted ? (
                    /* 播放完毕 */
                    <>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-500 font-medium">本次播放完毕</span>
                      </div>
                      <p className="text-sm text-white/50 pt-2">
                        请返回设置页进行下一次播放自定义
                      </p>
                      <button
                        onClick={() => router.push('/settings')}
                        className="mt-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                      >
                        返回设置
                      </button>
                    </>
                  ) : isPlaying ? (
                    /* 播放中：区分渐入/正常播放/渐出 */
                    <>
                      {/* 状态标签 */}
                      {isFadingOut ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
                          <VolumeX className="w-4 h-4 text-orange-500" />
                          <span className="text-sm text-orange-500 font-medium">渐出中</span>
                        </div>
                      ) : isFadingIn ? (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                          <Volume2 className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-blue-500 font-medium">渐入中</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#CC28FB]/10 border border-[#CC28FB]/20">
                          <Clock className="w-4 h-4 text-[#CC28FB]" />
                          <span className="text-sm text-[#CC28FB] font-medium">剩余播放时长</span>
                        </div>
                      )}
                      
                      {/* 剩余时长大数字 - 添加平滑过渡防止闪烁 */}
                      <div 
                        className={`text-5xl font-bold tracking-wider transition-all duration-150 ease-out ${isFadingOut ? 'text-orange-500' : isFadingIn ? 'text-blue-500' : 'text-[#CC28FB]'}`}
                        style={{ 
                          fontFamily: 'monospace', 
                          letterSpacing: '0.05em',
                          minWidth: '140px',
                          display: 'inline-block',
                          textAlign: 'center'
                        }}
                      >
                        {isFadingIn ? formatCountdown(Math.round(fadeInRemaining)) : formatCountdown(Math.round(remainingSeconds))}
                      </div>
                      
                      {/* 渐入进度条 */}
                      {isFadingIn && config?.fadeInDuration && (
                        <div className="space-y-1">
                          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full transition-all duration-200"
                              style={{ width: `${Math.round((1 - fadeInRemaining / config.fadeInDuration) * 100)}%` }}
                            />
                          </div>
                          <div className="text-xs text-blue-400/60">
                            距目标音量 {formatCountdown(fadeInRemaining)}
                          </div>
                        </div>
                      )}
                      
                      {/* 渐出进度条 - 从左到右填充 */}
                      {isFadingOut && config?.fadeOutDuration && (
                        <div className="space-y-1">
                          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                            <div 
                              className="h-full bg-orange-500 rounded-full transition-all duration-100 ease-out"
                              style={{ width: `${Math.min(100, Math.max(0, Math.round((1 - fadeOutRemaining / initialFadeOutSeconds) * 100)))}%` }}
                            />
                          </div>
                          <div className="text-xs text-orange-400/60">
                            渐出进度 {Math.round((1 - fadeOutRemaining / initialFadeOutSeconds) * 100)}%
                          </div>
                        </div>
                      )}
                      
                      {/* 预设结束时间 */}
                      {endTime && !isFadingIn && (
                        <div className="text-sm text-white/50 pt-2 border-t border-white/10">
                          {isFadingOut ? '渐出完毕时间' : '预设结束播放时间'} {String(endTime.hour).padStart(2, '0')}:{String(endTime.minute).padStart(2, '0')}
                          {isFadingOut && config?.fadeOutDuration ? ` + ${config.fadeOutDuration}秒渐出` : ''}
                        </div>
                      )}
                      
                      {/* 音频总时长 */}
                      {!isFadingIn && !isFadingOut && (
                        <div className="text-xs text-white/30">
                          音频总时长 {formatAudioTime(getTotalDuration())}
                        </div>
                      )}
                    </>
                  ) : (
                    /* 等待中：显示渐入开始时间和预设开始时间 */
                    <div className="space-y-4">
                      {/* 状态标签 */}
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                        <Volume2 className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-blue-500 font-medium">等待渐入</span>
                      </div>

                      {/* 渐入开始时间 */}
                      <div className="space-y-2">
                        <div className="text-xs text-white/40 uppercase tracking-wider">渐入开始时间</div>
                        <div 
                          className="text-2xl font-bold text-blue-500 tracking-wider"
                          style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                        >
                          {config?.startTime && config?.fadeInDuration !== undefined ? (() => {
                            const startYear = config.startTime.year ?? new Date().getFullYear();
                            const startMonth = config.startTime.month ?? 1;
                            const startDay = config.startTime.day ?? 1;
                            const startHour = config.startTime.hour;
                            const startMinute = config.startTime.minute;
                            const startSecond = config.startTime.second ?? 0;
                            const fadeIn = config.fadeInDuration;
                            
                            // 创建开始时间的 Date 对象
                            const startDate = new Date(startYear, startMonth - 1, startDay, startHour, startMinute, startSecond, 0);
                            
                            // 计算渐入开始时间 = 开始时间 - 渐入时长
                            const fadeDate = new Date(startDate.getTime() - fadeIn * 1000);
                            
                            const fadeYear = fadeDate.getFullYear();
                            const fadeMonth = fadeDate.getMonth() + 1;
                            const fadeDay = fadeDate.getDate();
                            const fadeHour = fadeDate.getHours();
                            const fadeMinute = fadeDate.getMinutes();
                            const fadeSecond = fadeDate.getSeconds();
                            
                            return `${String(fadeMonth).padStart(2, '0')}/${String(fadeDay).padStart(2, '0')} ${String(fadeHour).padStart(2, '0')}:${String(fadeMinute).padStart(2, '0')}:${String(fadeSecond).padStart(2, '0')}`;
                          })() : '--/-- --:--:--'}
                        </div>
                      </div>

                      {/* 距离倒计时 */}
                      <div className="space-y-2 pt-3 border-t border-white/10">
                        <div className="flex gap-6">
                          <div className="flex-1">
                            <div className="text-xs text-white/40 uppercase tracking-wider">距离渐入开始还有</div>
                            <div 
                              className="text-lg font-bold text-cyan-400 tracking-wider"
                              style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                            >
                              {fadeCountdown ?? '--:--'}
                            </div>
                          </div>
                          
                          <div className="flex-1">
                            <div className="text-xs text-white/40 uppercase tracking-wider">距离真正播放还有</div>
                            <div 
                              className="text-lg font-bold text-purple-400 tracking-wider"
                              style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                            >
                              {startCountdown ?? '--:--'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 预设开始播放时间 */}
                      <div className="space-y-2 pt-3 border-t border-white/10">
                        <div className="text-xs text-white/40 uppercase tracking-wider">预设开始播放时间</div>
                        <div 
                          className="text-2xl font-bold text-[#CC28FB] tracking-wider"
                          style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
                        >
                          {config?.startTime ? `${config.startTime.month}/${config.startTime.day} ${String(config.startTime.hour).padStart(2, '0')}:${String(config.startTime.minute).padStart(2, '0')}:${String(config.startTime.second ?? 0).padStart(2, '0')}` : '--/-- --:--:--'}
                        </div>
                      </div>

                      {/* 渐入时长提示 */}
                      {config && config.fadeInDuration > 0 && (
                        <div className="text-xs text-white/30">
                          渐入时长 {config.fadeInDuration} 秒 · 目标音量 {config.volume}%
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                </div>
              
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
