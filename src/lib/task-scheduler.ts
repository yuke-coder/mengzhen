import {
  ScheduledTask,
  TaskAudio,
  getNextExecuteDate,
} from './task-types';
import { getAllTasks, saveAllTasks, updateTask } from './task-store';
import { getAudioBlob } from './audio-db';

type SchedulerCallback = (event: SchedulerEvent) => void;

export interface SchedulerEvent {
  type: 'phase-change' | 'tick' | 'task-started' | 'task-completed' | 'task-cancelled' | 'task-resumed';
  taskId: string;
  phase: 'waiting' | 'fading-in' | 'playing' | 'fading-out' | 'idle';
  remainingMs: number;
  taskName?: string;
}

interface ActivePlayback {
  taskId: string;
  audio: HTMLAudioElement;
  phase: 'fading-in' | 'playing' | 'fading-out';
  fadeTimer: ReturnType<typeof setInterval> | null;
  endTimer: ReturnType<typeof setTimeout> | null;
  currentAudioIndex: number;
  currentBlobUrl: string | null;
  startedAt: number;
  targetVolume: number;
  retryCount: number;
}

class TaskScheduler {
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private activePlaybacks: Map<string, ActivePlayback> = new Map();
  private listeners: Set<SchedulerCallback> = new Set();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private audioContext: AudioContext | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private isBackground: boolean = false;
  private static readonly MAX_RETRY = 3;
  private static readonly RETRY_DELAY_MS = 2000;

  async start() {
    if (this.checkInterval) return;

    await this.resumeActiveTasks();

    this.checkForDueTasks();
    this.checkInterval = setInterval(() => this.checkForDueTasks(), 1000);

    this.tickInterval = setInterval(() => this.emitTicks(), 500);

    this.initVisibilityHandler();
    this.requestWakeLock();
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.activePlaybacks.forEach((_, taskId) => this.stopPlayback(taskId));
    this.releaseWakeLock();
    this.clearMediaSession();
  }

  on(callback: SchedulerCallback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getActiveTaskIds(): string[] {
    return Array.from(this.activePlaybacks.keys());
  }

  getTaskPhase(taskId: string): 'waiting' | 'fading-in' | 'playing' | 'fading-out' | 'idle' {
    const playback = this.activePlaybacks.get(taskId);
    if (playback) return playback.phase;

    const task = getAllTasks().find(t => t.id === taskId);
    if (!task || task.status === 'cancelled') return 'idle';
    if (task.skipUntil && Date.now() < task.skipUntil) return 'idle';
    if (task.status === 'completed') return 'idle';

    const status = this.computeStatus(task);
    if (status === 'executing') {
      const now = Date.now();
      const startTime = this.getTaskStartTimestamp(task);
      const fadeInMs = (task.fadeInDuration || 0) * 1000;
      if (now < startTime && now >= startTime - fadeInMs) {
        return 'fading-in';
      }
      const endTime = startTime + task.playDurationMinutes * 60 * 1000;
      const fadeOutMs = (task.fadeOutDuration || 0) * 1000;
      if (now >= endTime && now < endTime + fadeOutMs) {
        return 'fading-out';
      }
      return 'playing';
    }
    if (status === 'pending') return 'waiting';
    return 'idle';
  }

  getTaskRemainingMs(taskId: string): number {
    const playback = this.activePlaybacks.get(taskId);
    if (playback) {
      return this.computePlaybackRemaining(playback);
    }

    const task = getAllTasks().find(t => t.id === taskId);
    if (!task) return 0;

    const now = Date.now();
    const status = this.computeStatus(task);

    if (status === 'pending') {
      const nextExec = getNextExecuteDate(task);
      if (nextExec) {
        const fadeInMs = (task.fadeInDuration || 0) * 1000;
        const audioStartAt = nextExec.getTime() - fadeInMs;
        return Math.max(0, audioStartAt - now);
      }
      return 0;
    }

    if (status === 'executing') {
      const startTime = this.getTaskStartTimestamp(task);
      const endTime = startTime + task.playDurationMinutes * 60 * 1000;
      const fadeInMs = (task.fadeInDuration || 0) * 1000;
      const fadeOutMs = (task.fadeOutDuration || 0) * 1000;

      if (now < startTime && now >= startTime - fadeInMs) {
        return Math.max(0, startTime - now);
      }
      if (now >= endTime && now < endTime + fadeOutMs) {
        return Math.max(0, endTime + fadeOutMs - now);
      }
      return Math.max(0, endTime - now);
    }

    return 0;
  }

  cancelTask(taskId: string) {
    const task = getAllTasks().find(t => t.id === taskId);
    if (!task) return;

    this.stopPlayback(taskId);

    if (task.repeatType === 'once') {
      updateTask(taskId, { status: 'cancelled' });
    } else {
      const now = Date.now();
      const nextExec = getNextExecuteDate(task);
      let skipEndTime: number;

      if (nextExec) {
        const nextStart = nextExec.getTime();
        const nextEnd = nextStart + task.playDurationMinutes * 60 * 1000;
        const fadeOutMs = (task.fadeOutDuration || 0) * 1000;
        skipEndTime = nextEnd + fadeOutMs;
      } else {
        skipEndTime = now + task.playDurationMinutes * 60 * 1000;
      }

      updateTask(taskId, { skipUntil: skipEndTime });
    }

    this.emit({
      type: 'task-cancelled',
      taskId,
      phase: 'idle',
      remainingMs: 0,
    });
  }

  // 强制停止播放，不修改任务状态（用于删除任务前清理）
  forceStopPlayback(taskId: string) {
    this.stopPlayback(taskId);
    if (this.activePlaybacks.size === 0) {
      this.clearMediaSession();
      this.releaseWakeLock();
    }
    this.emit({
      type: 'task-cancelled',
      taskId,
      phase: 'idle',
      remainingMs: 0,
    });
  }

  resumeTask(taskId: string) {
    const task = getAllTasks().find(t => t.id === taskId);
    if (!task) return;

    updateTask(taskId, { skipUntil: undefined });

    this.emit({
      type: 'task-resumed',
      taskId,
      phase: 'waiting',
      remainingMs: 0,
    });
  }

  async executeNow(taskId: string) {
    const task = getAllTasks().find(t => t.id === taskId);
    if (!task) return;
    if (this.activePlaybacks.has(taskId)) return;

    updateTask(taskId, { status: 'executing', lastExecutedAt: Date.now() });

    await this.startPlayback(task);
  }

  private computeStatus(task: ScheduledTask): 'pending' | 'executing' | 'completed' | 'cancelled' {
    const now = Date.now();
    const startTime = this.getTaskStartTimestamp(task);
    const endTime = startTime + task.playDurationMinutes * 60 * 1000;

    if (task.status === 'cancelled') return 'cancelled';

    if (task.skipUntil && now < task.skipUntil) return 'cancelled';

    if (task.repeatType === 'once') {
      if (now >= endTime) return 'completed';
      if (now >= startTime) return 'executing';
      return 'pending';
    }

    const nextExec = getNextExecuteDate(task);
    if (!nextExec) return 'completed';

    const nextStart = nextExec.getTime();
    const nextEnd = nextStart + task.playDurationMinutes * 60 * 1000;

    if (now >= nextStart && now < nextEnd) return 'executing';
    return 'pending';
  }

  private getTaskStartTimestamp(task: ScheduledTask): number {
    return new Date(
      task.startTime.year,
      task.startTime.month - 1,
      task.startTime.day,
      task.startTime.hour,
      task.startTime.minute,
      task.startTime.second
    ).getTime();
  }

  private computePlaybackRemaining(playback: ActivePlayback): number {
    const task = getAllTasks().find(t => t.id === playback.taskId);
    if (!task) return 0;

    // 使用实际播放开始时间，而非计划时间
    const startTime = playback.startedAt;
    const endTime = startTime + task.playDurationMinutes * 60 * 1000;
    const now = Date.now();

    if (playback.phase === 'fading-in') {
      const fadeInEnd = startTime + (task.fadeInDuration || 0) * 1000;
      return Math.max(0, fadeInEnd - now);
    }
    if (playback.phase === 'playing') {
      return Math.max(0, endTime - now);
    }
    if (playback.phase === 'fading-out') {
      const fadeOutEnd = endTime + (task.fadeOutDuration || 0) * 1000;
      return Math.max(0, fadeOutEnd - now);
    }
    return 0;
  }

  private emit(event: SchedulerEvent) {
    this.listeners.forEach(cb => {
      try { cb(event); } catch {}
    });
  }

  private emitTicks() {
    this.activePlaybacks.forEach((playback, taskId) => {
      this.emit({
        type: 'tick',
        taskId,
        phase: playback.phase,
        remainingMs: this.computePlaybackRemaining(playback),
      });

      if (!this.isBackground && this.activePlaybacks.size > 0) {
        const task = getAllTasks().find(t => t.id === taskId);
        if (task) {
          this.updateMediaSessionForTask(task, playback);
        }
      }
    });
  }

  private async checkForDueTasks() {
    const tasks = getAllTasks();
    const now = Date.now();

    for (const task of tasks) {
      if (task.status === 'cancelled') continue;

      if (task.skipUntil && now >= task.skipUntil) {
        updateTask(task.id, { skipUntil: undefined });
        this.emit({
          type: 'task-resumed',
          taskId: task.id,
          phase: 'waiting',
          remainingMs: 0,
        });
        // skipUntil刚过期，跳过本次检查，等下一轮再决定是否启动
        continue;
      }

      if (this.activePlaybacks.has(task.id)) continue;

      if (task.skipUntil && now < task.skipUntil) continue;

      const nextExec = getNextExecuteDate(task);
      if (!nextExec) continue;

      const nextStart = nextExec.getTime();
      const fadeInMs = (task.fadeInDuration || 0) * 1000;
      const audioStartAt = nextStart - fadeInMs;
      const nextEnd = nextStart + task.playDurationMinutes * 60 * 1000;

      if (now >= audioStartAt && now < nextEnd) {
        await this.startPlayback(task);
      }
    }

    this.checkCompletedTasks();
  }

  private checkCompletedTasks() {
    const tasks = getAllTasks();
    const now = Date.now();

    for (const task of tasks) {
      if (task.status !== 'pending' && task.status !== 'executing') continue;
      if (this.activePlaybacks.has(task.id)) continue;

      const startTime = this.getTaskStartTimestamp(task);
      const endTime = startTime + task.playDurationMinutes * 60 * 1000;

      if (task.repeatType === 'once' && now >= endTime) {
        updateTask(task.id, { status: 'completed', completedAt: now });
      }
    }
  }

  private async startPlayback(task: ScheduledTask) {
    if (this.activePlaybacks.has(task.id)) return;
    if (task.audios.length === 0) return;

    this.ensureAudioContext();

    updateTask(task.id, { status: 'executing', lastExecutedAt: Date.now() });

    const audio = new Audio();
    const targetVolume = (task.volume || 70) / 100;

    const playback: ActivePlayback = {
      taskId: task.id,
      audio,
      phase: 'fading-in',
      fadeTimer: null,
      endTimer: null,
      currentAudioIndex: 0,
      currentBlobUrl: null,
      startedAt: Date.now(),
      targetVolume,
      retryCount: 0,
    };

    this.activePlaybacks.set(task.id, playback);

    this.emit({
      type: 'task-started',
      taskId: task.id,
      phase: 'fading-in',
      remainingMs: this.computePlaybackRemaining(playback),
      taskName: task.name,
    });

    this.emit({
      type: 'phase-change',
      taskId: task.id,
      phase: 'fading-in',
      remainingMs: this.computePlaybackRemaining(playback),
    });

    const audioUrl = await this.resolveAudioUrl(task.audios[0]);
    if (!audioUrl) {
      console.error('[TaskScheduler] Cannot resolve audio URL for task:', task.id);
      this.handlePlaybackError(task.id, new Error('Cannot resolve audio URL'));
      return;
    }

    // await后检查任务是否已被取消/停止
    if (!this.activePlaybacks.has(task.id)) return;

    audio.src = audioUrl;
    audio.volume = 0;

    audio.onerror = () => {
      console.error('[TaskScheduler] Audio error for task:', task.id);
      this.handlePlaybackError(task.id, new Error('Audio element error'));
    };

    try {
      await audio.play();
    } catch (err) {
      console.error('[TaskScheduler] Audio play failed:', err);
      this.handlePlaybackError(task.id, err instanceof Error ? err : new Error('Play failed'));
      return;
    }

    // await后再次检查任务是否已被取消/停止
    if (!this.activePlaybacks.has(task.id)) {
      audio.pause();
      audio.src = '';
      return;
    }

    this.updateMediaSessionForTask(task, playback);
    this.requestWakeLock();

    this.startFadeIn(task, playback);
    this.scheduleEnd(task, playback);
  }

  private startFadeIn(task: ScheduledTask, playback: ActivePlayback) {
    const fadeInDuration = task.fadeInDuration || 0;

    if (fadeInDuration <= 0) {
      playback.audio.volume = playback.targetVolume;
      playback.phase = 'playing';
      this.emit({
        type: 'phase-change',
        taskId: task.id,
        phase: 'playing',
        remainingMs: this.computePlaybackRemaining(playback),
      });
      this.updateMediaSessionForTask(task, playback);
      return;
    }

    const totalSteps = fadeInDuration * 10;
    const volumeStep = playback.targetVolume / totalSteps;
    let currentStep = 0;

    playback.fadeTimer = setInterval(() => {
      currentStep++;
      const newVol = Math.min(currentStep * volumeStep, playback.targetVolume);
      playback.audio.volume = newVol;

      if (currentStep >= totalSteps) {
        if (playback.fadeTimer) {
          clearInterval(playback.fadeTimer);
          playback.fadeTimer = null;
        }
        playback.audio.volume = playback.targetVolume;
        playback.phase = 'playing';
        this.emit({
          type: 'phase-change',
          taskId: task.id,
          phase: 'playing',
          remainingMs: this.computePlaybackRemaining(playback),
        });
        this.updateMediaSessionForTask(task, playback);
      }
    }, 100);
  }

  private scheduleEnd(task: ScheduledTask, playback: ActivePlayback) {
    // 使用实际播放开始时间，而非计划时间
    const startTime = playback.startedAt;
    const endTime = startTime + task.playDurationMinutes * 60 * 1000;
    const now = Date.now();

    const delayToFadeOut = Math.max(0, endTime - now);

    playback.endTimer = setTimeout(() => {
      this.startFadeOut(task, playback);
    }, delayToFadeOut);
  }

  private startFadeOut(task: ScheduledTask, playback: ActivePlayback) {
    const fadeOutDuration = task.fadeOutDuration || 0;

    if (fadeOutDuration <= 0) {
      this.completeTask(task, playback);
      return;
    }

    playback.phase = 'fading-out';
    this.emit({
      type: 'phase-change',
      taskId: task.id,
      phase: 'fading-out',
      remainingMs: fadeOutDuration * 1000,
    });
    this.updateMediaSessionForTask(task, playback);

    const totalSteps = fadeOutDuration * 10;
    const volumeStep = playback.targetVolume / totalSteps;
    let currentStep = 0;

    if (playback.fadeTimer) {
      clearInterval(playback.fadeTimer);
      playback.fadeTimer = null;
    }

    playback.fadeTimer = setInterval(() => {
      currentStep++;
      const newVol = Math.max(0, playback.targetVolume - currentStep * volumeStep);
      playback.audio.volume = newVol;

      if (currentStep >= totalSteps) {
        if (playback.fadeTimer) {
          clearInterval(playback.fadeTimer);
          playback.fadeTimer = null;
        }
        this.completeTask(task, playback);
      }
    }, 100);
  }

  private completeTask(task: ScheduledTask, playback: ActivePlayback) {
    this.stopPlayback(task.id);

    if (task.repeatType === 'once') {
      updateTask(task.id, { status: 'completed', completedAt: Date.now() });
    } else {
      updateTask(task.id, { lastExecutedAt: Date.now() });
    }

    if (this.activePlaybacks.size === 0) {
      this.clearMediaSession();
      this.releaseWakeLock();
    }

    this.emit({
      type: 'task-completed',
      taskId: task.id,
      phase: 'idle',
      remainingMs: 0,
      taskName: task.name,
    });
  }

  private stopPlayback(taskId: string) {
    const playback = this.activePlaybacks.get(taskId);
    if (!playback) return;

    if (playback.fadeTimer) {
      clearInterval(playback.fadeTimer);
    }
    if (playback.endTimer) {
      clearTimeout(playback.endTimer);
    }

    playback.audio.pause();
    playback.audio.src = '';

    if (playback.currentBlobUrl) {
      URL.revokeObjectURL(playback.currentBlobUrl);
    }

    this.activePlaybacks.delete(taskId);
  }

  private async resolveAudioUrl(taskAudio: TaskAudio): Promise<string | undefined> {
    if (taskAudio.fileKey) {
      return `/api/audio/proxy?key=${encodeURIComponent(taskAudio.fileKey)}`;
    }
    if (taskAudio.serverUrl) {
      return taskAudio.serverUrl;
    }
    if (taskAudio.dbKey) {
      try {
        const blob = await getAudioBlob(taskAudio.dbKey);
        if (blob) {
          return URL.createObjectURL(blob);
        }
      } catch (err) {
        console.error('[TaskScheduler] IndexedDB read failed:', err);
      }
    }
    return undefined;
  }

  private async resumeActiveTasks() {
    const tasks = getAllTasks();
    const now = Date.now();

    for (const task of tasks) {
      if (task.status !== 'executing') continue;
      if (this.activePlaybacks.has(task.id)) continue;

      const startTime = this.getTaskStartTimestamp(task);
      const endTime = startTime + task.playDurationMinutes * 60 * 1000;
      const fadeInMs = (task.fadeInDuration || 0) * 1000;
      const fadeOutMs = (task.fadeOutDuration || 0) * 1000;
      const audioStartAt = startTime - fadeInMs;

      if (now < audioStartAt || now >= endTime + fadeOutMs) {
        if (task.repeatType === 'once' && now >= endTime) {
          updateTask(task.id, { status: 'completed', completedAt: now });
        } else if (task.repeatType !== 'once') {
          updateTask(task.id, { status: 'pending' });
        }
        continue;
      }

      await this.resumePlayback(task);
    }
  }

  private async resumePlayback(task: ScheduledTask) {
    if (this.activePlaybacks.has(task.id)) return;
    if (task.audios.length === 0) return;

    this.ensureAudioContext();

    const now = Date.now();
    const startTime = this.getTaskStartTimestamp(task);
    const endTime = startTime + task.playDurationMinutes * 60 * 1000;
    const fadeInMs = (task.fadeInDuration || 0) * 1000;
    const fadeOutMs = (task.fadeOutDuration || 0) * 1000;
    const audioStartAt = startTime - fadeInMs;

    let phase: 'fading-in' | 'playing' | 'fading-out';

    if (fadeInMs > 0 && now < startTime) {
      phase = 'fading-in';
    } else if (now >= endTime) {
      phase = 'fading-out';
    } else {
      phase = 'playing';
    }

    const audio = new Audio();
    const targetVolume = (task.volume || 70) / 100;

    const playback: ActivePlayback = {
      taskId: task.id,
      audio,
      phase,
      fadeTimer: null,
      endTimer: null,
      currentAudioIndex: 0,
      currentBlobUrl: null,
      startedAt: now,
      targetVolume,
      retryCount: 0,
    };

    this.activePlaybacks.set(task.id, playback);

    this.emit({
      type: 'task-started',
      taskId: task.id,
      phase,
      remainingMs: this.computePlaybackRemaining(playback),
      taskName: task.name,
    });

    const audioUrl = await this.resolveAudioUrl(task.audios[0]);
    if (!audioUrl) {
      console.error('[TaskScheduler] Cannot resolve audio URL for resuming task:', task.id);
      this.handlePlaybackError(task.id, new Error('Cannot resolve audio URL on resume'));
      return;
    }

    // await后检查任务是否已被取消/停止
    if (!this.activePlaybacks.has(task.id)) return;

    audio.src = audioUrl;

    let seekTime = 0;
    if (phase === 'fading-in') {
      const elapsed = now - audioStartAt;
      const progress = Math.min(elapsed / fadeInMs, 1);
      audio.volume = targetVolume * progress;
      seekTime = elapsed / 1000;
    } else if (phase === 'playing') {
      audio.volume = targetVolume;
      seekTime = (now - startTime) / 1000;
    } else {
      audio.volume = targetVolume;
      seekTime = task.playDurationMinutes * 60;
    }

    audio.currentTime = seekTime;

    audio.onerror = () => {
      console.error('[TaskScheduler] Audio error for resumed task:', task.id);
      this.handlePlaybackError(task.id, new Error('Audio element error on resume'));
    };

    try {
      await audio.play();
    } catch (err) {
      console.error('[TaskScheduler] Audio play failed on resume:', err);
      this.handlePlaybackError(task.id, err instanceof Error ? err : new Error('Play failed on resume'));
      return;
    }

    // await后再次检查任务是否已被取消/停止
    if (!this.activePlaybacks.has(task.id)) {
      audio.pause();
      audio.src = '';
      return;
    }

    this.updateMediaSessionForTask(task, playback);
    this.requestWakeLock();

    if (phase === 'fading-in') {
      this.resumeFadeIn(task, playback);
      this.scheduleEnd(task, playback);
    } else if (phase === 'playing') {
      this.emit({
        type: 'phase-change',
        taskId: task.id,
        phase: 'playing',
        remainingMs: this.computePlaybackRemaining(playback),
      });
      this.scheduleEnd(task, playback);
    } else {
      this.resumeFadeOut(task, playback);
    }
  }

  private resumeFadeIn(task: ScheduledTask, playback: ActivePlayback) {
    const fadeInDuration = task.fadeInDuration || 0;
    const startTime = this.getTaskStartTimestamp(task);
    const now = Date.now();
    const elapsed = now - (startTime - fadeInDuration * 1000);
    const progress = Math.min(elapsed / (fadeInDuration * 1000), 1);

    if (progress >= 1) {
      playback.audio.volume = playback.targetVolume;
      playback.phase = 'playing';
      this.emit({
        type: 'phase-change',
        taskId: task.id,
        phase: 'playing',
        remainingMs: this.computePlaybackRemaining(playback),
      });
      this.updateMediaSessionForTask(task, playback);
      return;
    }

    const remainingSteps = Math.ceil((1 - progress) * fadeInDuration * 10);
    const remainingVolume = playback.targetVolume * (1 - progress);
    const volumeStep = remainingVolume / remainingSteps;
    let currentStep = 0;

    playback.fadeTimer = setInterval(() => {
      currentStep++;
      const newVol = Math.min(playback.audio.volume + volumeStep, playback.targetVolume);
      playback.audio.volume = newVol;

      if (currentStep >= remainingSteps) {
        if (playback.fadeTimer) {
          clearInterval(playback.fadeTimer);
          playback.fadeTimer = null;
        }
        playback.audio.volume = playback.targetVolume;
        playback.phase = 'playing';
        this.emit({
          type: 'phase-change',
          taskId: task.id,
          phase: 'playing',
          remainingMs: this.computePlaybackRemaining(playback),
        });
        this.updateMediaSessionForTask(task, playback);
      }
    }, 100);
  }

  private resumeFadeOut(task: ScheduledTask, playback: ActivePlayback) {
    const fadeOutDuration = task.fadeOutDuration || 0;

    if (fadeOutDuration <= 0) {
      this.completeTask(task, playback);
      return;
    }

    const endTime = this.getTaskStartTimestamp(task) + task.playDurationMinutes * 60 * 1000;
    const now = Date.now();
    const elapsed = now - endTime;
    const progress = Math.min(elapsed / (fadeOutDuration * 1000), 1);

    if (progress >= 1) {
      this.completeTask(task, playback);
      return;
    }

    const remainingVolume = playback.targetVolume * (1 - progress);
    playback.audio.volume = remainingVolume;

    const remainingSteps = Math.ceil((1 - progress) * fadeOutDuration * 10);
    const volumeStep = remainingVolume / remainingSteps;
    let currentStep = 0;

    if (playback.fadeTimer) {
      clearInterval(playback.fadeTimer);
      playback.fadeTimer = null;
    }

    playback.fadeTimer = setInterval(() => {
      currentStep++;
      const newVol = Math.max(0, playback.audio.volume - volumeStep);
      playback.audio.volume = newVol;

      if (currentStep >= remainingSteps) {
        if (playback.fadeTimer) {
          clearInterval(playback.fadeTimer);
          playback.fadeTimer = null;
        }
        this.completeTask(task, playback);
      }
    }, 100);
  }

  private async requestWakeLock() {
    if (this.activePlaybacks.size === 0) return;
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {}
  }

  private releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  private initVisibilityHandler() {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        this.isBackground = false;
        this.adjustTickInterval();
        this.requestWakeLock();
        this.syncPlaybackStates();
      } else {
        this.isBackground = true;
        this.adjustTickInterval();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
  }

  private adjustTickInterval() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
    }
    const interval = this.isBackground ? 3000 : 500;
    this.tickInterval = setInterval(() => this.emitTicks(), interval);
  }

  private syncPlaybackStates() {
    this.activePlaybacks.forEach((playback, taskId) => {
      const task = getAllTasks().find(t => t.id === taskId);
      if (!task) return;

      if (playback.audio.paused) {
        playback.audio.play().catch(() => {
          this.handlePlaybackError(taskId, new Error('Audio paused unexpectedly'));
        });
      }

      this.updateMediaSessionForTask(task, playback);
    });
  }

  private updateMediaSessionForTask(task: ScheduledTask, playback: ActivePlayback) {
    if (!('mediaSession' in navigator)) return;

    const phaseLabel = playback.phase === 'fading-in' ? '渐入中'
      : playback.phase === 'playing' ? '播放中'
      : playback.phase === 'fading-out' ? '渐出中'
      : '播放中';

    const remaining = this.computePlaybackRemaining(playback);
    const totalSec = Math.floor(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: task.name,
      artist: `梦枕 - ${phaseLabel} ${timeStr}`,
      album: '自定义任务',
    });

    navigator.mediaSession.setActionHandler('play', () => {
      if (playback.audio.paused) {
        playback.audio.play().catch(() => {});
      }
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      this.cancelTask(task.id);
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      this.cancelTask(task.id);
    });
  }

  private clearMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('stop', null);
  }

  private async handlePlaybackError(taskId: string, error: Error): Promise<void> {
    const playback = this.activePlaybacks.get(taskId);
    if (!playback) return;

    const task = getAllTasks().find(t => t.id === taskId);
    if (!task) {
      this.stopPlayback(taskId);
      return;
    }

    if (playback.retryCount < TaskScheduler.MAX_RETRY) {
      playback.retryCount++;

      this.emit({
        type: 'phase-change',
        taskId,
        phase: playback.phase,
        remainingMs: this.computePlaybackRemaining(playback),
      });

      await new Promise(resolve => setTimeout(resolve, TaskScheduler.RETRY_DELAY_MS));

      const currentTask = getAllTasks().find(t => t.id === taskId);
      if (!currentTask || currentTask.status === 'cancelled' || (currentTask.skipUntil && Date.now() < currentTask.skipUntil)) {
        this.stopPlayback(taskId);
        return;
      }

      const now = Date.now();
      const startTime = this.getTaskStartTimestamp(currentTask);
      const endTime = startTime + currentTask.playDurationMinutes * 60 * 1000;
      const fadeOutMs = (currentTask.fadeOutDuration || 0) * 1000;

      if (now >= endTime + fadeOutMs) {
        this.stopPlayback(taskId);
        if (currentTask.repeatType === 'once') {
          updateTask(currentTask.id, { status: 'completed', completedAt: now });
        }
        return;
      }

      try {
        const audioUrl = await this.resolveAudioUrl(currentTask.audios[0]);
        if (!audioUrl) throw new Error('Cannot resolve audio URL');

        // await后检查任务是否已被取消/停止
        if (!this.activePlaybacks.has(taskId)) return;

        playback.audio.src = audioUrl;
        playback.audio.volume = playback.phase === 'fading-in'
          ? playback.targetVolume * 0.5
          : playback.targetVolume;

        await playback.audio.play();

        // await后再次检查
        if (!this.activePlaybacks.has(taskId)) {
          playback.audio.pause();
          playback.audio.src = '';
          return;
        }

        return;
      } catch {
        return this.handlePlaybackError(taskId, error);
      }
    }

    this.stopPlayback(taskId);

    if (task.repeatType === 'once') {
      updateTask(taskId, { status: 'completed', completedAt: Date.now() });
    } else {
      updateTask(taskId, { status: 'pending' });
    }

    this.emit({
      type: 'task-completed',
      taskId,
      phase: 'idle',
      remainingMs: 0,
      taskName: task.name,
    });
  }

  private ensureAudioContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch {}
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
  }
}

let schedulerInstance: TaskScheduler | null = null;

export function getTaskScheduler(): TaskScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new TaskScheduler();
  }
  return schedulerInstance;
}

export async function startTaskScheduler(): Promise<TaskScheduler> {
  const scheduler = getTaskScheduler();
  await scheduler.start();
  return scheduler;
}

export function stopTaskScheduler() {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}
