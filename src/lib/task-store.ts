import {
  ScheduledTask,
  PlayMode,
  PlayConfig,
  generateTaskId,
  getNextExecuteDate,
  STEP_DURATION,
  TaskRepeatType,
  TaskAudio,
} from './task-types';

const TASKS_KEY = 'dream_pillow_tasks';
const MODE_KEY = 'dream_pillow_mode';
const DEFAULT_CONFIG_KEY = 'dream_default_play_config';

export function getPlayMode(): PlayMode {
  if (typeof window === 'undefined') return 'default';
  return (localStorage.getItem(MODE_KEY) as PlayMode) || 'default';
}

export function setPlayMode(mode: PlayMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

export interface DefaultPlayConfig {
  startTime: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
  playDurationMinutes: number;
  fadeInDuration: number;
  fadeOutDuration: number;
  volume: number;
}

export function getDefaultPlayConfig(): DefaultPlayConfig | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(DEFAULT_CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setDefaultPlayConfig(config: DefaultPlayConfig): void {
  localStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(config));
}

export function getAllTasks(): ScheduledTask[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(TASKS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveAllTasks(tasks: ScheduledTask[]): void {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

export function getTaskById(id: string): ScheduledTask | null {
  const tasks = getAllTasks();
  return tasks.find(t => t.id === id) || null;
}

export function createTask(data: Omit<ScheduledTask, 'id' | 'createdAt' | 'status'>): ScheduledTask {
  const task: ScheduledTask = {
    ...data,
    id: generateTaskId(),
    createdAt: Date.now(),
    status: 'pending',
  };

  const nextExec = getNextExecuteDate(task);
  if (nextExec) {
    task.nextExecuteAt = nextExec.getTime();
  }

  const tasks = getAllTasks();
  tasks.push(task);
  saveAllTasks(tasks);
  return task;
}

export function updateTask(id: string, updates: Partial<ScheduledTask>): ScheduledTask | null {
  const tasks = getAllTasks();
  const index = tasks.findIndex(t => t.id === id);
  if (index === -1) return null;

  tasks[index] = { ...tasks[index], ...updates };

  if (updates.startTime || updates.repeatType) {
    const nextExec = getNextExecuteDate(tasks[index]);
    tasks[index].nextExecuteAt = nextExec?.getTime();
  }

  saveAllTasks(tasks);
  return tasks[index];
}

export function deleteTask(id: string): boolean {
  const tasks = getAllTasks();
  const filtered = tasks.filter(t => t.id !== id);
  if (filtered.length === tasks.length) return false;
  saveAllTasks(filtered);
  return true;
}

export function cancelTask(id: string): ScheduledTask | null {
  return updateTask(id, { status: 'cancelled' });
}

export interface CleanupResult {
  removedCount: number;
  removedNames: string[];
}

export function cleanupCompletedOnceTasks(): CleanupResult {
  const tasks = getAllTasks();
  const removedNames: string[] = [];
  const remaining = tasks.filter(t => {
    if (t.repeatType !== 'once') return true;
    if (t.status === 'completed') {
      removedNames.push(t.name);
      return false;
    }
    return true;
  });
  const removed = tasks.length - remaining.length;
  if (removed > 0) saveAllTasks(remaining);
  return { removedCount: removed, removedNames };
}

export function cleanupCancelledTasks(): CleanupResult {
  const tasks = getAllTasks();
  const removedNames: string[] = [];
  const remaining = tasks.filter(t => {
    if (t.status === 'cancelled') {
      removedNames.push(t.name);
      return false;
    }
    if (t.skipUntil && Date.now() >= t.skipUntil) {
      updateTask(t.id, { skipUntil: undefined });
    }
    return true;
  });
  const removed = tasks.length - remaining.length;
  if (removed > 0) saveAllTasks(remaining);
  return { removedCount: removed, removedNames };
}

export function getActiveTasks(): ScheduledTask[] {
  const now = Date.now();
  return getAllTasks().filter(t => t.status !== 'cancelled' && !(t.skipUntil && now < t.skipUntil));
}

export function resolvePlayConfig(): PlayConfig | null {
  const mode = getPlayMode();

  if (mode === 'custom') {
    const tasks = getActiveTasks();
    const now = Date.now();

    let nextTask: ScheduledTask | null = null;
    let earliestTime = Infinity;

    for (const task of tasks) {
      const nextExec = getNextExecuteDate(task);
      if (nextExec) {
        const execTime = nextExec.getTime();
        if (execTime < earliestTime && execTime >= now - 60000) {
          earliestTime = execTime;
          nextTask = task;
        }
      }
    }

    if (!nextTask) return null;

    const nextExec = getNextExecuteDate(nextTask)!;
    return {
      mode: 'custom',
      startTime: {
        year: nextExec.getFullYear(),
        month: nextExec.getMonth() + 1,
        day: nextExec.getDate(),
        hour: nextExec.getHours(),
        minute: nextExec.getMinutes(),
        second: nextExec.getSeconds(),
      },
      playDurationMinutes: nextTask.playDurationMinutes,
      fadeInDuration: nextTask.fadeInDuration,
      fadeOutDuration: nextTask.fadeOutDuration,
      volume: nextTask.volume,
      audios: nextTask.audios,
      taskId: nextTask.id,
    };
  }

  const defaultConfig = getDefaultPlayConfig();
  if (!defaultConfig) return null;

  const savedConfig = localStorage.getItem('dream_config');
  let audios: TaskAudio[] = [];
  if (savedConfig) {
    try {
      const parsed = JSON.parse(savedConfig);
      if (parsed.audios && Array.isArray(parsed.audios)) {
        audios = parsed.audios.map((a: Record<string, unknown>) => ({
          id: a.id as string,
          name: a.name as string,
          duration: (a.duration as number) || 0,
          size: (a.size as number) || ((a.file as Record<string, unknown>)?.size as number) || 0,
          fileKey: a.fileKey as string | undefined,
          serverUrl: a.serverUrl as string | undefined,
          dbKey: a.dbKey as string | undefined,
        }));
      }
    } catch {}
  }

  return {
    mode: 'default',
    startTime: defaultConfig.startTime,
    playDurationMinutes: defaultConfig.playDurationMinutes,
    fadeInDuration: defaultConfig.fadeInDuration,
    fadeOutDuration: defaultConfig.fadeOutDuration,
    volume: defaultConfig.volume,
    audios,
  };
}
