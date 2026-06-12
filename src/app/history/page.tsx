'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Navbar from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { 
  Music, 
  Play, 
  Clock, 
  FileText, 
  Loader2,
  Download,
  RefreshCw,
  Calendar
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface AudioRecord {
  id: string;
  title: string;
  file_url: string;
  file_key: string;
  file_name: string;
  file_size: number;
  duration: number;
  mime_type: string;
  created_at: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [audios, setAudios] = useState<AudioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login');
    }
  }, [user, authLoading, router]);

  const fetchAudios = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/audio/my-list', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setAudios(data.audios || []);
      } else {
        console.error('获取历史记录失败:', data.error);
      }
    } catch (err) {
      console.error('获取历史记录失败:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAudios();
  }, [fetchAudios]);

  const handlePlay = (audio: AudioRecord) => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    if (playingId === audio.id) {
      setPlayingId(null);
      setCurrentAudio(null);
      return;
    }

    const url = audio.file_key
      ? `/api/audio/proxy?key=${encodeURIComponent(audio.file_key)}`
      : audio.file_url;

    const audioEl = new Audio(url);
    audioEl.play();
    audioEl.onended = () => {
      setPlayingId(null);
      setCurrentAudio(null);
    };
    setPlayingId(audio.id);
    setCurrentAudio(audioEl);
  };

  const handleExport = async (audio: AudioRecord) => {
    try {
      const url = audio.file_key
        ? `/api/audio/proxy?key=${encodeURIComponent(audio.file_key)}`
        : audio.file_url;

      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = audio.file_name || audio.title;
      link.click();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('导出失败:', err);
    }
  };

  const handleImport = (audio: AudioRecord) => {
    // 跳转到设置页，携带 file_key 参数
    const fileKey = audio.file_key 
      ? encodeURIComponent(audio.file_key) 
      : '';
    router.push(`/settings?fileKey=${fileKey}`);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-12">
        {/* 顶部 */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            onClick={() => fetchAudios()}
            disabled={loading}
          >
            <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">我的音频</h1>
            <p className="text-sm text-muted-foreground mt-1">
              共 {audios.length} 条音频记录
            </p>
          </div>
        </div>

        {/* 列表 */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">加载中...</p>
          </div>
        ) : audios.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <Music className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-foreground font-medium">暂无音频记录</p>
              <p className="text-sm text-muted-foreground mt-1">上传音频后将在这里显示</p>
            </div>
            <Link href="/settings">
              <Button className="mt-2 gap-2 bg-gradient-to-r from-pink-500 to-purple-500">
                去上传
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {audios.map((audio) => (
              <div
                key={audio.id}
                className={cn(
                  "flex items-center gap-3 p-4 rounded-xl",
                  "bg-card border border-border/50",
                  "hover:border-primary/30 hover:bg-muted/20",
                  "transition-all duration-200"
                )}
              >
                {/* 播放按钮 */}
                <button
                  onClick={() => handlePlay(audio)}
                  className={cn(
                    "w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0",
                    "bg-gradient-to-br from-pink-500 to-purple-500",
                    "text-white shadow-md",
                    "hover:shadow-lg hover:shadow-pink-500/20",
                    "hover:scale-105 active:scale-95",
                    "transition-all duration-200"
                  )}
                >
                  {playingId === audio.id ? (
                    <div className="w-4 h-4 flex items-center justify-center">
                      <div className="w-1 h-4 bg-white rounded-full animate-pulse" />
                    </div>
                  ) : (
                    <Play className="w-4 h-4 ml-0.5" fill="white" />
                  )}
                </button>

                {/* 音频信息 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {audio.title || audio.file_name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {formatFileSize(audio.file_size)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {audio.duration > 0 ? formatDuration(audio.duration) : '--:--'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(audio.created_at)}
                    </span>
                  </div>
                </div>

                {/* 导出和导入按钮 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleExport(audio)}
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      "bg-muted hover:bg-muted/80",
                      "text-muted-foreground hover:text-foreground",
                      "transition-all duration-200",
                      "hover:scale-105 active:scale-95"
                    )}
                    title="导出下载"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleImport(audio)}
                    className={cn(
                      "w-9 h-9 rounded-lg flex items-center justify-center",
                      "bg-gradient-to-br from-pink-500/10 to-purple-500/10",
                      "hover:from-pink-500/20 hover:to-purple-500/20",
                      "text-pink-500 hover:text-pink-400",
                      "transition-all duration-200",
                      "hover:scale-105 active:scale-95"
                    )}
                    title="导入到设置"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
