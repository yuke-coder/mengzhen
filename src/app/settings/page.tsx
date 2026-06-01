"use client";
import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { MindMapData, MindMapTemplate } from "@/lib/mindmap-types";
import { ContentInput } from "@/components/content-input";
import { AudioUpload } from "@/components/audio-upload";
import { TaskForm } from "@/components/task-form";
import { TaskList } from "@/components/task-list";
import { TaskModal } from "@/components/task-modal";
import { PlayMode, ScheduledTask } from "@/lib/task-types";
import { getPlayMode, setPlayMode as savePlayMode, getAllTasks, cleanupCompletedOnceTasks, cleanupCancelledTasks, type CleanupResult } from "@/lib/task-store";
import { startTaskScheduler, stopTaskScheduler, getTaskScheduler } from "@/lib/task-scheduler";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTheme, type Theme } from "@/lib/theme-context";
import { useAuth } from "@/lib/auth-context";
import DynamicBackground from "@/components/dynamic-background";

import {
    ArrowLeft,
    Sparkles,
    Brain,
    Wand2,
    Layers,
    Download,
    ArrowLeftRight,
    ChevronRight,
    Plus,
} from "lucide-react";

import { cn } from "@/lib/utils";

const TEMPLATE_NAMES: Record<string, string> = {
    radial: "经典放射图",
    circle: "圆圈图",
    bubble: "气泡图",
    "double-bubble": "双重气泡图",
    tree: "树状图",
    bracket: "括号图",
    flowchart: "流程图",
    "multi-flow": "多重流程图",
    bridge: "桥状图",
    venn: "韦恩图",
    fishbone: "鱼骨图",
    timeline: "时间线图",
    "org-chart": "组织结构图",
    concept: "概念图"
};

type Step = "input" | "generating" | "preview";

const GENERATING_PHASES = [{
    label: "解析内容结构",
    desc: "提取关键段落与主题",
    nodes: 8
}, {
    label: "构建知识图谱",
    desc: "关联概念与层级关系",
    nodes: 12
}, {
    label: "生成思维导图",
    desc: "应用专业布局算法",
    nodes: 16
}];

function usePrecisionReveal(
    options?: {
        threshold?: number;
    }
) {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const element = ref.current;

        if (!element)
            return;

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setIsVisible(true);
                observer.unobserve(element);
            }
        }, {
            threshold: options?.threshold ?? 0.1
        });

        observer.observe(element);
        return () => observer.disconnect();
    }, [options?.threshold]);

    return {
        ref,
        isVisible
    };
}

function RevealGroup(
    {
        children,
        className = "",
        delayBase = 0,
        id
    }: {
        children: React.ReactNode;
        className?: string;
        delayBase?: number;
        id?: string;
    }
) {
    const {
        ref,
        isVisible
    } = usePrecisionReveal({
        threshold: 0.08
    });

    return (
        <div ref={ref} id={id} className={cn("space-y-2", className)}>
            {Array.isArray(children) ? children.map((child, i) => <div
                key={i}
                style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateY(0)" : "translateY(16px)",
                    transition: `opacity 0.5s ease ${delayBase + i * 80}ms, transform 0.5s ease ${delayBase + i * 80}ms`
                }}>
                {child}
            </div>) : <div
                style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateY(0)" : "translateY(16px)",
                    transition: `opacity 0.5s ease ${delayBase}ms, transform 0.5s ease ${delayBase}ms`
                }}>
                {children}
            </div>}
        </div>
    );
}

function CharReveal(
    {
        text,
        className = "",
        charClassName = "",
        delayBase = 0,
        charDelay = 60
    }: {
        text: string;
        className?: string;
        charClassName?: string;
        delayBase?: number;
        charDelay?: number;
    }
) {
    return (
        <span
            className={cn("inline-flex flex-wrap justify-center", className)}
            suppressHydrationWarning>
            {text.split("").map((char, i) => <span
                key={i}
                className={cn(
                    "char-hidden animate-char-reveal",
                    charClassName
                )}
                style={{
                    width: char === " " ? "0.3em" : "auto",
                    ["--char-delay" as string]: `${delayBase + i * charDelay}ms`
                } as React.CSSProperties}>
                {char === " " ? "\u00A0" : char}
            </span>)}
        </span>
    );
}


function WordReveal(
    {
        text,
        className = "",
        wordClassName = "",
        delayBase = 0,
        wordDelay = 150,
        separator = "·"
    }: {
        text: string;
        className?: string;
        wordClassName?: string;
        delayBase?: number;
        wordDelay?: number;
        separator?: string;
    }
) {
    const words = text.split(separator).filter(w => w.trim());

    return (
        <span
            className={cn("inline-flex items-center justify-center gap-3", className)}
            suppressHydrationWarning>
            {words.map((word, i) => <span key={i} className="inline-flex">
                {word.split("").map((char, j) => <span
                    key={j}
                    className={cn(
                        "char-hidden animate-char-reveal text-foreground/60",
                        wordClassName
                    )}
                    style={{
                        '--char-delay': `${delayBase + i * wordDelay + j * 40}ms`
                    } as React.CSSProperties}>
                    {char}
                </span>)}
                {i < words.length - 1 && <span
                    className={cn(
                        "char-hidden animate-char-reveal text-[var(--brand-glow)]/50 mx-2"
                    )}
                    style={{
                        '--char-delay': `${delayBase + i * wordDelay + word.length * 40}ms`
                    } as React.CSSProperties}>
                    {separator}
                </span>}
            </span>)}
        </span>
    );
}


function GeneratingAnimation(
    {
        content,
        processedContent,
        showOriginal,
        onToggleOriginal,
        onCancel,
        templateCount = 1,
        contentLength = 0,
        completedCount = 0,
        currentTemplateName = ""
    }: {
        content: string;
        processedContent: string;
        showOriginal: boolean;
        onToggleOriginal: () => void;
        onCancel: () => void;
        templateCount?: number;
        contentLength?: number;
        completedCount?: number;
        currentTemplateName?: string;
    }
) {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState(0);
    const [elapsedTime, setElapsedTime] = useState(0);
    const [nodeCount, setNodeCount] = useState(0);
    const [completedTemplates, setCompletedTemplates] = useState(0);

    const [stars] = useState(() => {
        return Array.from({
            length: 50
        }, (_, i) => ({
            id: i,
            width: Math.random() * 2 + 1,
            height: Math.random() * 2 + 1,
            left: Math.random() * 100,
            top: Math.random() * 100,
            opacity: Math.random() * 0.5 + 0.1,
            duration: Math.random() * 3 + 2,
            delay: Math.random() * 3
        }));
    });

    const estimatedTotalTime = useMemo(() => {
        const contentFactor = Math.ceil(contentLength / 1000) * 6;
        const baseTime = 15;
        const templateExtra = Math.ceil(templateCount / 2) * 4;
        return Math.min(60, Math.max(20, baseTime + contentFactor + templateExtra));
    }, [contentLength, templateCount]);

    const formatTime = useCallback((seconds: number): string => {
        if (seconds < 60)
            return `${seconds}秒`;

        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}分${secs}秒`;
    }, []);

    const phases = useMemo(() => {
        const basePhases = [{
            label: "解析内容",
            desc: "提取关键信息与结构"
        }, {
            label: "构建图谱",
            desc: "关联概念与层级"
        }, {
            label: "生成导图",
            desc: `并行生成 ${templateCount} 个模板`
        }, {
            label: "优化输出",
            desc: "确保完整可读"
        }];

        return basePhases;
    }, [templateCount]);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress(p => {
                if (p >= 100) {
                    setPhase(prev => (prev + 1) % phases.length);

                    if (phase === 2) {
                        setCompletedTemplates(templateCount);
                    }

                    return 0;
                }

                const speed = phase === 0 ? 0.4 : phase === 1 ? 0.6 : phase === 2 ? 0.8 : 0.4;
                return p + speed;
            });

            setElapsedTime(t => t + 0.05);
            setNodeCount(c => Math.min(100 + templateCount * 20, c + (Math.random() > 0.6 ? 2 : 1)));
        }, 50);

        return () => clearInterval(interval);
    }, [phases.length, phase, templateCount]);

    const currentPhaseData = phases[phase];

    const nodes = useMemo(() => {
        const nodeData: Array<{
            x: number;
            y: number;
            size: number;
            delay: number;
            opacity: number;
            seed: number;
        }> = [];

        nodeData.push({
            x: 50,
            y: 50,
            size: 12,
            delay: 0,
            opacity: 1,
            seed: 0
        });

        for (let ring = 1; ring <= 4; ring++) {
            const nodeCountInRing = ring * 6;

            for (let i = 0; i < nodeCountInRing; i++) {
                const angle = i / nodeCountInRing * Math.PI * 2 - Math.PI / 2 + ring % 2 * 0.2;
                const distance = 12 + ring * 8;
                const progressFactor = progress / 100;
                const ringProgress = Math.min(1, (progressFactor * 4 - (ring - 1)) * 1.5);

                if (ringProgress > 0) {
                    const size = Math.max(2, 6 - ring * 0.8 + (ring * nodeCountInRing + i) % 3 * 0.7);

                    nodeData.push({
                        x: 50 + Math.cos(angle) * distance * Math.min(1, ringProgress),
                        y: 50 + Math.sin(angle) * distance * Math.min(1, ringProgress),
                        size,
                        delay: ring * 200 + i * 30,
                        opacity: Math.min(1, ringProgress * 1.5),
                        seed: ring * nodeCountInRing + i
                    });
                }
            }
        }

        return nodeData;
    }, [progress]);

    return (
        <section
            className="min-h-[90vh] flex items-center justify-center px-6 py-12 relative overflow-hidden">

            <div
                className={`absolute inset-0 ${
                    isDark 
                        ? "bg-gradient-to-b from-[#030308] via-[#050510] to-[#030308]"
                        : "bg-gradient-to-b from-pink-50/50 via-white/80 to-teal-50/50"
                }`}>
    
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
                        linear-gradient(to right, ${isDark ? "rgba(0, 212, 170, 0.03)" : "rgba(0, 150, 136, 0.05)"} 1px, transparent 1px),
                        linear-gradient(to bottom, ${isDark ? "rgba(0, 212, 170, 0.03)" : "rgba(0, 150, 136, 0.05)"} 1px, transparent 1px)
                    `,

                        backgroundSize: "60px 60px"
                    }} />
    
                <div className="absolute inset-0">
                    {stars.map(star => <div
                        key={star.id}
                        className={`absolute rounded-full ${isDark ? "bg-white" : "bg-teal-600"}`}
                        style={{
                            width: `${star.width}px`,
                            height: `${star.height}px`,
                            left: `${star.left}%`,
                            top: `${star.top}%`,
                            opacity: isDark ? star.opacity : star.opacity * 0.3,
                            animation: `twinkle ${star.duration}s ease-in-out infinite`,
                            animationDelay: `${star.delay}s`
                        }} />)}
                </div>
    
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]">
                    <div
                        className={`absolute inset-0 rounded-full animate-pulse-slow ${isDark ? "bg-gradient-radial from-[#00d4aa]/15 via-transparent to-transparent" : "bg-gradient-radial from-teal-400/20 via-transparent to-transparent"}`} />
                    <div
                        className={`absolute inset-[15%] rounded-full animate-pulse-slow ${isDark ? "bg-gradient-radial from-[#00d4aa]/20 via-transparent to-transparent" : "bg-gradient-radial from-teal-500/25 via-transparent to-transparent"}`}
                        style={{
                            animationDelay: "0.5s"
                        }} />
                    <div
                        className={`absolute inset-[30%] rounded-full animate-pulse-slow ${isDark ? "bg-gradient-radial from-[#00d4aa]/10 via-transparent to-transparent" : "bg-gradient-radial from-teal-600/15 via-transparent to-transparent"}`}
                        style={{
                            animationDelay: "1s"
                        }} />
                </div>
    
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border ${isDark ? "border-[#00d4aa]/5" : "border-teal-300/30"}`}
                    style={{
                        animation: "orbit 30s linear infinite"
                    }} />
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border ${isDark ? "border-[#00d4aa]/8" : "border-teal-400/40"}`}
                    style={{
                        animation: "orbit 25s linear infinite reverse"
                    }} />
                <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border ${isDark ? "border-[#00d4aa]/10" : "border-teal-500/50"}`}
                    style={{
                        animation: "orbit 20s linear infinite"
                    }} />
            </div>

            <div className="max-w-5xl w-full relative z-20">
    
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                
                            <div className="relative w-14 h-14">
                                <Image
                                    src="/logo.png"
                                    alt="梦枕"
                                    width={56}
                                    height={56}
                                    className="rounded-2xl shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
                                    priority
                                />
                            </div>
                            <div>
                                <div className={`font-bold text-xl tracking-wide ${isDark ? "text-white" : "text-gray-800"}`}>一键梦枕中</div>
                                <div className={`text-sm flex items-center gap-2 mt-0.5 ${isDark ? "text-[#00d4aa]/70" : "text-teal-600/80"}`}>
                                    <span className="relative flex h-2 w-2">
                                        <span
                                            className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isDark ? "bg-[#00d4aa]" : "bg-teal-500"} opacity-60`} />
                                        <span className={`relative inline-flex rounded-full h-2 w-2 ${isDark ? "bg-[#00d4aa]" : "bg-teal-500"}`} />
                                    </span>
                                    {completedCount && completedCount > 0 ? (
                                        <span>已完成 {completedCount}/{templateCount} 个脑图</span>
                                    ) : (
                                        <span>AI 智能分析中</span>
                                    )}
                                </div>
                                {currentTemplateName && (
                                    <div className={`text-xs mt-1 ${isDark ? "text-white/50" : "text-gray-500"}`}>
                                        正在生成: {currentTemplateName}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                
                            <div
                                className={`px-4 py-2 rounded-xl backdrop-blur-md ${isDark ? "bg-[#00d4aa]/10 border border-[#00d4aa]/20" : "bg-teal-100/80 border border-teal-200/50"}`}>
                                <span className={`text-sm font-medium ${isDark ? "text-[#00d4aa]" : "text-teal-700"}`}>预计 {formatTime(estimatedTotalTime)}
                                </span>
                            </div>
                
                            <button
                                onClick={onCancel}
                                className={`px-5 py-2.5 rounded-xl transition-all text-sm font-medium cursor-pointer ${isDark ? "bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20 text-white/70 hover:text-white" : "bg-gray-200/80 hover:bg-gray-300/80 border-gray-300/50 hover:border-gray-400/60 text-gray-600 hover:text-gray-800"}`}>取消
                                                                                                                            </button>
                        </div>
                    </div>
                </div>
    
                <div
                    className={`backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden ${isDark ? "bg-[#0a0a14]/90 shadow-[#00d4aa]/5 border border-[#00d4aa]/10" : "bg-white/90 shadow-teal-500/10 border border-teal-200/50"}`}>
        
                    <div className="px-8 pt-6 pb-4">
                        <div className={`relative h-2 rounded-full overflow-hidden ${isDark ? "bg-white/5" : "bg-gray-200"}`}>
                
                            <div
                                className="absolute inset-y-0 left-0 rounded-full transition-all duration-100"
                                style={{
                                    width: `${progress}%`,
                                    backgroundImage: isDark 
                                        ? "linear-gradient(90deg, #00d4aa, #5bb892, #00d4aa)" 
                                        : "linear-gradient(90deg, #14b8a6, #0d9488, #14b8a6)",
                                    backgroundSize: "200% 100%",
                                    backgroundPosition: "0% 0%",
                                    animation: "gradient-shift 2s ease infinite"
                                }}>
                    
                                <div
                                    className={`absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full blur-xl ${isDark ? "bg-white/40" : "bg-teal-300/60"}`} />
                            </div>
                
                            {phases.map((_, i) => <div
                                key={i}
                                className={cn(
                                    "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all duration-300",
                                    i * 25 <= progress 
                                        ? (isDark ? "bg-[#00d4aa] border-[#00d4aa]" : "bg-teal-500 border-teal-500") 
                                        : (isDark ? "bg-transparent border-white/30" : "bg-transparent border-gray-400/40")
                                )}
                                style={{
                                    left: `${i * 25}%`,
                                    marginLeft: "-6px"
                                }} />)}
                        </div>
            
                        <div className="flex items-center justify-between mt-4">
                            <div className="flex items-center gap-2">
                                <span className={`font-semibold ${isDark ? "text-white" : "text-gray-800"}`}>{currentPhaseData.label}</span>
                                <span className={isDark ? "text-white/40" : "text-gray-400"}>·</span>
                                <span className={`text-sm ${isDark ? "text-white/60" : "text-gray-500"}`}>{currentPhaseData.desc}</span>
                            </div>
                            <div className={`flex items-center gap-4 text-xs ${isDark ? "text-white/40" : "text-gray-500"}`}>
                                <span>已用时: {formatTime(Math.floor(elapsedTime))}</span>
                                {templateCount > 1 && phase >= 2 && <span
                                    className={`px-2 py-0.5 rounded font-medium ${isDark ? "bg-[#00d4aa]/20 text-[#00d4aa]" : "bg-teal-100 text-teal-700"}`}>并行生成 {templateCount}个模板
                                                                                                                                                </span>}
                                {templateCount > 1 && phase >= 2 && <span className={`px-2 py-0.5 rounded ${isDark ? "bg-white/10 text-white/60" : "bg-gray-200 text-gray-600"}`}>预估节省 {(templateCount - 1) * 0.4 * templateCount | 0}0% 时间
                                                                                                                                                </span>}
                            </div>
                        </div>
                    </div>
        
                    <div className="px-8 pb-6">
                        <div
                            className={`relative rounded-2xl overflow-hidden border ${isDark ? "border-white/5" : "border-gray-200/50"}`}
                            style={{
                                height: "380px",
                                background: isDark ? "linear-gradient(135deg, #050510 0%, #0a0a18 100%)" : "linear-gradient(135deg, #f0fdfa 0%, #e0f2f1 100%)"
                            }}>
                
                            <div className="absolute inset-0">
                                <div
                                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full ${isDark ? "bg-gradient-radial from-[#00d4aa]/20 via-transparent to-transparent" : "bg-gradient-radial from-teal-400/30 via-transparent to-transparent"}`} />
                            </div>
                
                            <svg
                                viewBox="0 0 100 100"
                                className="absolute inset-0 w-full h-full"
                                preserveAspectRatio="xMidYMid meet">
                                <defs>
                        
                                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="1" result="blur" />
                                        <feMerge>
                                            <feMergeNode in="blur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                        
                                    <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor={isDark ? "#00d4aa" : "#14b8a6"} stopOpacity="0.8" />
                                        <stop offset="100%" stopColor={isDark ? "#5bb892" : "#0d9488"} stopOpacity="0.2" />
                                    </linearGradient>
                        
                                    <radialGradient id="nodeGradient" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor={isDark ? "#00d4aa" : "#14b8a6"} stopOpacity="1" />
                                        <stop offset="100%" stopColor={isDark ? "#00d4aa" : "#14b8a6"} stopOpacity="0.3" />
                                    </radialGradient>
                        
                                    <radialGradient id="centerGradient" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor={isDark ? "#ffffff" : "#ffffff"} stopOpacity="1" />
                                        <stop offset="50%" stopColor={isDark ? "#00d4aa" : "#14b8a6"} stopOpacity="0.8" />
                                        <stop offset="100%" stopColor={isDark ? "#5bb892" : "#0d9488"} stopOpacity="0.4" />
                                    </radialGradient>
                                </defs>
                    
                                {nodes.slice(1).map((node, i) => {
                                    const delay = node.delay * 0.01;

                                    return (
                                        <line
                                            key={`line-${i}`}
                                            x1="50"
                                            y1="50"
                                            x2={node.x}
                                            y2={node.y}
                                            stroke="url(#connectionGradient)"
                                            strokeWidth="0.3"
                                            strokeLinecap="round"
                                            opacity={node.opacity * 0.6}
                                            style={{
                                                strokeDasharray: "100",
                                                strokeDashoffset: `${100 - progress}`,
                                                animation: "line-draw 2s ease-out forwards",
                                                animationDelay: `${delay}s`
                                            }} />
                                    );
                                })}
                                {nodes.map((node, i) => {
                                    const isCenter = i === 0;

                                    return (
                                        <g key={`node-${i}`} filter="url(#glow)">
                                            <circle
                                                cx={node.x}
                                                cy={node.y}
                                                r={node.size * (isCenter ? 2.5 : 1.8)}
                                                fill={isCenter ? (isDark ? "#00d4aa" : "#14b8a6") : (isDark ? "#5bb892" : "#0d9488")}
                                                opacity={node.opacity * (isCenter ? 0.3 : 0.15)}
                                                className="animate-pulse"
                                                style={{
                                                    animationDuration: `${2 + i * 0.1}s`
                                                }} />
                                            <circle
                                                cx={node.x}
                                                cy={node.y}
                                                r={node.size * (isCenter ? 1.5 : 1)}
                                                fill={isCenter ? "url(#centerGradient)" : "url(#nodeGradient)"}
                                                opacity={node.opacity} />
                                
                                            <circle
                                                cx={node.x}
                                                cy={node.y}
                                                r={node.size * (isCenter ? 0.4 : 0.3)}
                                                fill={isDark ? "white" : "white"}
                                                opacity={node.opacity * (isCenter ? 0.9 : 0.6)} />
                                        </g>
                                    );
                                })}
                            </svg>
                        </div>
                    </div>
        
                    <div
                        className={`h-px mx-8 ${isDark ? "bg-gradient-to-r from-transparent via-[#00d4aa]/20 to-transparent" : "bg-gradient-to-r from-transparent via-teal-300/30 to-transparent"}`} />
        
                    <div className="mx-8 my-6">
                        <div
                            className={`rounded-xl border overflow-hidden ${isDark ? "bg-[#050510]/60 border-white/5" : "bg-white/80 border-gray-200/50"}`}>
                            <div
                                className={`flex items-center justify-between px-5 py-3.5 border-b ${isDark ? "border-white/5" : "border-gray-200/50"}`}>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <div className={`w-3 h-3 rounded-full ${isDark ? "bg-red-500/60" : "bg-red-400/70"}`} />
                                        <div className={`w-3 h-3 rounded-full ${isDark ? "bg-yellow-500/60" : "bg-yellow-400/70"}`} />
                                        <div className={`w-3 h-3 rounded-full ${isDark ? "bg-green-500/60" : "bg-green-400/70"}`} />
                                    </div>
                                    <span className={`text-sm font-medium ml-2 ${isDark ? "text-white/60" : "text-gray-600"}`}>
                                        {showOriginal ? "原文内容" : "处理后内容"}
                                    </span>
                                </div>
                                <button
                                    onClick={onToggleOriginal}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs border cursor-pointer ${isDark ? "bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/10 text-white/50 hover:text-white/80" : "bg-gray-100 hover:bg-gray-200 border-gray-200 hover:border-gray-300 text-gray-500 hover:text-gray-700"}`}>
                                    {showOriginal ? "查看处理后" : "查看原文"}
                                    <ArrowLeftRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="p-5 max-h-44 overflow-y-auto scrollbar-thin">
                                <pre
                                    className={`text-sm whitespace-pre-wrap font-mono leading-relaxed ${isDark ? "text-white/40" : "text-gray-500"}`}>
                                    {showOriginal ? content : processedContent}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center">
                <p className={`text-sm flex items-center gap-2 ${isDark ? "text-white/20" : "text-gray-400"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? "bg-[#00d4aa]" : "bg-teal-500"}`} />脑图正在成形，请稍候...
                                                                            </p>
            </div>

            <style jsx>{`
                @keyframes orbit {
                    from { transform: translate(-50%, -50%) rotate(0deg); }
                    to { transform: translate(-50%, -50%) rotate(360deg); }
                }
                
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                @keyframes twinkle {
                    0%, 100% { opacity: 0.1; }
                    50% { opacity: 0.5; }
                }
                
                @keyframes pulse-slow {
                    0%, 100% { opacity: 0.3; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.05); }
                }
                
                @keyframes pulse-subtle {
                    0%, 100% { opacity: 0.8; }
                    50% { opacity: 1; }
                }
                
                @keyframes ring-pulse {
                    0% { transform: scale(1); opacity: 0.5; }
                    100% { transform: scale(1.5); opacity: 0; }
                }
                
                @keyframes gradient-shift {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                
                @keyframes line-draw {
                    from { stroke-dashoffset: 100; }
                    to { stroke-dashoffset: 0; }
                }
                
                .animate-spin-slow {
                    animation: spin-slow 8s linear infinite;
                }
                
                .animate-pulse-slow {
                    animation: pulse-slow 4s ease-in-out infinite;
                }
                
                .animate-pulse-subtle {
                    animation: pulse-subtle 2s ease-in-out infinite;
                }
                
                .animate-ring-pulse {
                    animation: ring-pulse 2s ease-out infinite;
                }
                
                .bg-gradient-radial {
                    background: radial-gradient(circle, var(--tw-gradient-stops));
                }
                
                .scrollbar-thin::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                
                .scrollbar-thin::-webkit-scrollbar-track {
                    background: transparent;
                }
                
                .scrollbar-thin::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                }
                
                .scrollbar-thin::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </section>
    );
}

export default function CreatePage() {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <CreatePageContent />
        </Suspense>
    );
}

function LoadingFallback() {
    return (
        <div
            className="min-h-screen flex items-center justify-center bg-background"
            suppressHydrationWarning>
            <div className="text-center">
                <Image
                    src="/logo.png"
                    alt="梦枕"
                    width={48}
                    height={48}
                    className="rounded-xl mx-auto mb-4 animate-pulse shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)]"
                    priority
                />
                <p className="text-muted-foreground">加载中...</p>
            </div>
        </div>
    );
}

function CreatePageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [step, setStep] = useState<Step>("input");
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // 初始化为空数组，确保首屏为空选状态
    const [selectedTemplates, setSelectedTemplates] = useState<MindMapTemplate[]>([]);
    const [mindmaps, setMindmaps] = useState<MindMapData[]>([]);
    const [currentTemplateIndex, setCurrentTemplateIndex] = useState(0);
    const [currentContent, setCurrentContent] = useState("");
    const [processedContent, setProcessedContent] = useState("");
    const [showOriginal, setShowOriginal] = useState(false);
    const [recommendedTemplates, setRecommendedTemplates] = useState<MindMapTemplate[]>([]);
    const [isRecommending, setIsRecommending] = useState(false);
    const hasRecommendedRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isCancelledRef = useRef(false);
    const mindmapsRef = useRef<MindMapData[]>([]);
    const totalCountRef = useRef(selectedTemplates.length);

    const [playMode, setPlayMode] = useState<PlayMode>("default");
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
    const [tasks, setTasks] = useState<ScheduledTask[]>([]);
    const [tasksVersion, setTasksVersion] = useState(0);

    // 生成记录相关状态
    const { user } = useAuth();

    useEffect(() => {
        const savedMode = getPlayMode();
        setPlayMode(savedMode);
        const completedResult = cleanupCompletedOnceTasks();
        const cancelledResult = cleanupCancelledTasks();
        if (completedResult.removedCount > 0) {
            toast.info(`已自动清理 ${completedResult.removedCount} 个已完成的一次性任务`, { duration: 3000 });
        }
        if (cancelledResult.removedCount > 0) {
            toast.info(`已自动清理 ${cancelledResult.removedCount} 个已取消的一次性任务`, { duration: 3000 });
        }
        setTasks(getAllTasks());
    }, []);

    useEffect(() => {
        const executingTasks = getAllTasks().filter(t => t.status === 'executing');
        startTaskScheduler().then(() => {
            if (executingTasks.length > 0) {
                const scheduler = getTaskScheduler();
                const resumedNames: string[] = [];
                executingTasks.forEach(t => {
                    if (scheduler.getTaskPhase(t.id) !== 'idle') {
                        resumedNames.push(t.name);
                    }
                });
                if (resumedNames.length > 0) {
                    toast.success(`${resumedNames.length} 个任务已恢复执行`, { duration: 3000 });
                }
            }
        });
        return () => {
            stopTaskScheduler();
        };
    }, []);

    useEffect(() => {
        setTasks(getAllTasks());
    }, [tasksVersion]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const completedResult = cleanupCompletedOnceTasks();
                const cancelledResult = cleanupCancelledTasks();
                if (completedResult.removedCount > 0) {
                    toast.info(`已自动清理 ${completedResult.removedCount} 个已完成的一次性任务`, { duration: 3000 });
                }
                if (cancelledResult.removedCount > 0) {
                    toast.info(`已自动清理 ${cancelledResult.removedCount} 个已取消的一次性任务`, { duration: 3000 });
                }
                setTasks(getAllTasks());
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const handleModeChange = useCallback((mode: PlayMode) => {
        setPlayMode(mode);
        savePlayMode(mode);
        if (mode === "default") {
            setShowTaskForm(false);
            setEditingTask(null);
        }
    }, []);

    const handleTaskSaved = useCallback((_task: ScheduledTask) => {
        setShowTaskForm(false);
        setEditingTask(null);
        setTasksVersion((v) => v + 1);
    }, []);

    const handleEditTask = useCallback((task: ScheduledTask) => {
        setEditingTask(task);
        setShowTaskForm(true);
    }, []);

    const handleRefreshTasks = useCallback(() => {
        setTasksVersion((v) => v + 1);
    }, []);

    // 页面加载时重置所有状态
    useEffect(() => {
        // 重置所有创作相关状态
        setSelectedTemplates([]);
        setMindmaps([]);
        setCurrentTemplateIndex(0);
        setCurrentContent("");
        setProcessedContent("");
        setShowOriginal(false);
        setStep("input");
        setProcessing(false);
        setError(null);
        setRecommendedTemplates([]);
        setIsRecommending(false);
        hasRecommendedRef.current = false;
        mindmapsRef.current = [];
        
        // 取消任何正在进行的请求
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        isCancelledRef.current = false;
    }, []); // 空依赖数组，只在组件挂载时执行一次

    // 确保 currentTemplateIndex 始终在有效范围内
    useEffect(() => {
        if (mindmaps.length > 0 && currentTemplateIndex >= mindmaps.length) {
            setCurrentTemplateIndex(Math.max(0, mindmaps.length - 1));
        }
    }, [mindmaps.length, currentTemplateIndex]);

    // 保存记录状态
    const [savingRecord, setSavingRecord] = useState(false);
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveModalType, setSaveModalType] = useState<'success' | 'login'>('success');

    // 保存生成记录
    const handleSaveRecord = useCallback(async () => {
        if (savingRecord) return;
        
        if (!user) {
            setSaveModalType('login');
            setShowSaveModal(true);
            return;
        }
        
        setSavingRecord(true);
        
        try {
            // 获取当前脑图图片
            const viewer = document.getElementById("jsmind_container");
            if (viewer) {
                const { default: html2canvas } = await import("html2canvas");
                const canvas = await html2canvas(viewer, { scale: 2 });
                const imageUrl = canvas.toDataURL("image/png");
                
                const mindmap = mindmaps[currentTemplateIndex];
                
                const response = await fetch("/api/generation-records", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId: user.id,
                        mindmapType: mindmap.template,
                        generationResult: imageUrl
                    })
                });

                const data = await response.json();

                if (data.success) {
                    setSaveModalType('success');
                    setShowSaveModal(true);
                } else {
                    toast.error(data.error || "保存失败");
                }
            }
        } catch (err) {
            console.error("保存失败:", err);
            toast.error("保存失败，请重试");
        } finally {
            setSavingRecord(false);
        }
    }, [savingRecord, user, mindmaps, currentTemplateIndex]);

    useEffect(() => {
        const templatesParam = searchParams.get("templates");

        if (templatesParam) {
            try {
                const templates = templatesParam.split(",").filter((t): t is MindMapTemplate => [
                    "radial",
                    "circle",
                    "bubble",
                    "double-bubble",
                    "tree",
                    "bracket",
                    "flowchart",
                    "multi-flow",
                    "bridge",
                    "venn",
                    "fishbone",
                    "timeline",
                    "org-chart",
                    "concept"
                ].includes(t));

                if (templates.length > 0) {
                    setSelectedTemplates(templates.slice(0, 5));
                }
            } catch {}
        }
    }, [searchParams]);

    const fetchRecommendations = useCallback(async (content: string) => {
        if (content.trim().length < 20)
            return;

        if (hasRecommendedRef.current && recommendedTemplates.length > 0)
            return;

        setIsRecommending(true);

        try {
            const response = await fetch(`/api/mindmap?content=${encodeURIComponent(content.substring(0, 2000))}`);

            if (!response.ok)
                return;

            const text = await response.text();

            if (!text || text.length === 0)
                return;

            const data = JSON.parse(text);

            if (data.success && data.recommendations?.length > 0) {
                hasRecommendedRef.current = true;
                setRecommendedTemplates(data.recommendations);
                // 不自动选中，保持用户自主选择
            }
        } catch {} finally {
            setIsRecommending(false);
        }
    }, [selectedTemplates]);

    const handleSubmit = useCallback(async (content: string, title?: string) => {
        if (selectedTemplates.length === 0) {
            setError("请下滑选择模板");
            const templateSection = document.getElementById("template-section");

            if (templateSection) {
                templateSection.scrollIntoView({
                    behavior: "smooth",
                    block: "center"
                });

                templateSection.classList.add("ring-2", "ring-[var(--brand-start)]/50");

                setTimeout(() => {
                    templateSection.classList.remove("ring-2", "ring-[var(--brand-start)]/50");
                }, 2000);
            }

            return;
        }

        // 优化的文本预处理逻辑
        const processed = content
            // 去除首尾空白
            .trim()
            // 规范化换行符
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            // 合并多个连续空行为两个空行
            .replace(/\n{3,}/g, '\n\n')
            // 去除行尾多余空白
            .replace(/[ \t]+\n/g, '\n')
            // 去除行首多余空白（保留Markdown格式）
            .replace(/^[ \t]+/gm, '')
            // 过滤掉完全空白的行
            .split('\n')
            .filter(line => line.trim().length > 0)
            .join('\n');
        
        // 确保处理后的内容不为空
        if (processed.length < 10) {
            setError("内容过短");
            return;
        }

        setCurrentContent(content);
        setProcessedContent(processed);
        setStep("generating");
        setProcessing(true);
        setShowOriginal(false);
        setError(null);
        setMindmaps([]); // 清空之前的脑图
        setCurrentTemplateIndex(0);
        abortControllerRef.current = new AbortController();
        isCancelledRef.current = false;
        
        // 重置 ref（使用顶层的 ref）
        mindmapsRef.current = [];
        totalCountRef.current = selectedTemplates.length;

        // 流式生成
        fetch("/api/mindmap-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: processed,
                templates: selectedTemplates,
                title
            }),
            signal: abortControllerRef.current.signal
        })
        .then(response => {
            if (!response.ok) throw new Error("请求失败");
            return response.body;
        })
        .then(body => {
            if (!body) throw new Error("无响应体");

            const reader = body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            function processBuffer() {
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const event = JSON.parse(line.substring(6));
                            handleStreamEvent(event);
                        } catch {
                            // 解析失败，跳过
                        }
                    }
                }
            }

            function handleStreamEvent(event: { type: string; total?: number; mindmap?: MindMapData }) {
                switch (event.type) {
                    case "start":
                        totalCountRef.current = event.total || selectedTemplates.length;
                        break;

                    case "complete":
                        if (event.mindmap) {
                            console.log('[complete] template:', event.mindmap.template, 'structure:', typeof event.mindmap.structure, event.mindmap.structure);
                            mindmapsRef.current.push(event.mindmap);
                            setMindmaps([...mindmapsRef.current]);
                            // 如果是第一个完成的脑图，切换到预览视图
                            if (mindmapsRef.current.length === 1) {
                                setCurrentTemplateIndex(0);
                                setStep("preview");
                            }
                        }
                        break;

                    case "failed":
                        // 可以记录失败日志，但不阻塞流程
                        break;

                    case "done":
                        setProcessing(false);
                        if (mindmapsRef.current.length > 0) {
                            setMindmaps([...mindmapsRef.current]);
                        } else {
                            setError("生成失败");
                            setStep("input");
                        }
                        abortControllerRef.current = null;
                        break;
                }
            }

            function read() {
                reader.read().then(({ done, value }) => {
                    // 检查是否已取消
                    if (isCancelledRef.current) {
                        return;
                    }
                    
                    if (done) {
                        setProcessing(false);
                        abortControllerRef.current = null;
                        return;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    processBuffer();
                    read();
                });
            }

            read();
        })
        .catch(err => {
            // 如果是取消操作，不显示错误
            if (isCancelledRef.current) {
                isCancelledRef.current = false;
                return;
            }
            if (err instanceof Error && err.name === "AbortError") {
                setError("已取消生成");
            } else {
                setError("网络错误");
            }
            setStep("input");
            setProcessing(false);
            abortControllerRef.current = null;
        });
    }, [selectedTemplates]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (currentContent && currentContent.length >= 20 && step === "input") {
                fetchRecommendations(currentContent);
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [currentContent, step, fetchRecommendations, recommendedTemplates]);

    const handleCancel = useCallback(() => {
        // 设置取消标志，防止流式处理中抛出 AbortError
        isCancelledRef.current = true;
        
        if (abortControllerRef.current) {
            // 使用 setTimeout 确保在 React 事件循环外执行 abort
            setTimeout(() => {
                try {
                    abortControllerRef.current?.abort();
                } catch {
                    // 忽略 abort 错误
                }
            }, 0);
        }
        
        // 直接设置处理状态为完成，让界面回到输入状态
        setProcessing(false);
        setStep("input");
    }, []);

    const handleBack = useCallback(() => {
        // 清空脑图数据
        setMindmaps([]);
        setCurrentTemplateIndex(0);
        // 重置到输入状态
        setStep("input");
        setError(null);
        hasRecommendedRef.current = false;
        setRecommendedTemplates([]);
        // 滚动到页面顶部
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    const handleToggleOriginal = useCallback(() => {
        setShowOriginal(prev => !prev);
    }, []);

    return (
        <div
            className="min-h-screen text-foreground overflow-x-hidden relative z-10"
            suppressHydrationWarning>

            <DynamicBackground />

            <main className="pt-14 relative">
                {step === "input" && <section
                    className="relative min-h-[85vh] flex flex-col items-center justify-center px-4 sm:px-6 overflow-hidden">
        
                    <div className="absolute inset-0 overflow-hidden">
                        <svg
                            className="absolute inset-0 w-full h-full opacity-30"
                            viewBox="0 0 1200 800"
                            preserveAspectRatio="xMidYMid slice">
                            <defs>
                                <radialGradient id="heroNodeGlow" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="var(--brand-glow)" stopOpacity="0.6" />
                                    <stop offset="100%" stopColor="var(--brand-glow)" stopOpacity="0" />
                                </radialGradient>
                                <linearGradient id="heroLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="var(--brand-dim)" stopOpacity="0" />
                                    <stop offset="50%" stopColor="var(--brand-glow)" stopOpacity="0.8" />
                                    <stop offset="100%" stopColor="var(--brand-dim)" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                
                            <g>
                                <path
                                    d="M100,400 Q300,200 500,350 T900,400"
                                    fill="none"
                                    stroke="url(#heroLineGrad)"
                                    strokeWidth="1.5"
                                    strokeDasharray="8,4"
                                    className="animate-dash" />
                                <path
                                    d="M200,500 Q400,600 600,450 T1100,300"
                                    fill="none"
                                    stroke="url(#heroLineGrad)"
                                    strokeWidth="1"
                                    strokeDasharray="6,6"
                                    className="animate-dash-reverse"
                                    style={{
                                        animationDelay: "1s"
                                    }} />
                                <path
                                    d="M50,300 Q250,100 450,250 T850,150"
                                    fill="none"
                                    stroke="var(--brand-dim)"
                                    strokeWidth="0.8"
                                    strokeDasharray="4,8"
                                    className="animate-dash"
                                    style={{
                                        animationDelay: "0.5s"
                                    }} />
                            </g>
                
                            <g>
                                {[{
                                    x: 200,
                                    y: 300,
                                    r: 4,
                                    delay: 0
                                }, {
                                    x: 400,
                                    y: 200,
                                    r: 3,
                                    delay: 0.2
                                }, {
                                    x: 600,
                                    y: 400,
                                    r: 5,
                                    delay: 0.4
                                }, {
                                    x: 800,
                                    y: 250,
                                    r: 3,
                                    delay: 0.6
                                }, {
                                    x: 1000,
                                    y: 350,
                                    r: 4,
                                    delay: 0.8
                                }, {
                                    x: 300,
                                    y: 500,
                                    r: 3,
                                    delay: 1
                                }, {
                                    x: 700,
                                    y: 550,
                                    r: 4,
                                    delay: 1.2
                                }, {
                                    x: 500,
                                    y: 600,
                                    r: 3,
                                    delay: 1.4
                                }].map((node, i) => <g key={i}>
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={node.r * 3}
                                        fill="url(#heroNodeGlow)"
                                        className="animate-pulse-slow"
                                        style={{
                                            animationDelay: `${node.delay}s`
                                        }} />
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={node.r}
                                        fill="var(--brand-glow)"
                                        className="animate-glow"
                                        style={{
                                            animationDelay: `${node.delay}s`
                                        }} />
                                </g>)}
                            </g>
                        </svg>
            
                        <div
                            className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-background via-background/80 to-transparent" />
                    </div>
                    <div className="relative z-20 max-w-4xl mx-auto w-full space-y-4 sm:space-y-6 px-2 sm:px-4 md:px-0">
            
                        <div className="text-center space-y-4 mt-8">
                
                            <div className="relative inline-block text-center">
                                <svg 
                                    className="w-full max-w-4xl mx-auto"
                                    viewBox="0 0 1100 700" 
                                    preserveAspectRatio="xMidYMid meet"
                                >
                                    <defs>
                                        <linearGradient id="createTitleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#5EEDA0"/>
                                            <stop offset="35%" stopColor="#40C78A"/>
                                            <stop offset="50%" stopColor="#60C4A0"/>
                                            <stop offset="65%" stopColor="#9055E0"/>
                                            <stop offset="100%" stopColor="#A855F7"/>
                                        </linearGradient>
                                    </defs>
                                    <text 
                                        x="50%" 
                                        y="320" 
                                        textAnchor="middle" 
                                        dominantBaseline="middle"
                                        fontSize="clamp(100px, 28vw, 280px)"
                                        fontWeight="bold"
                                        fontFamily="system-ui, -apple-system, sans-serif"
                                        fill="url(#createTitleGradient)"
                                    >
                                        <tspan x="50%" dy="-0.5em" className="svg-char" style={{["--char-delay" as string]: "200ms"}}>星</tspan>
                                        <tspan className="svg-char" style={{["--char-delay" as string]: "260ms"}}>河</tspan>
                                        <tspan className="svg-char" style={{["--char-delay" as string]: "320ms"}}>入</tspan>
                                        <tspan className="svg-char" style={{["--char-delay" as string]: "380ms"}}>眠</tspan>
                                        <tspan x="50%" dy="1.2em" className="svg-char" style={{["--char-delay" as string]: "500ms"}}>伴</tspan>
                                        <tspan className="svg-char" style={{["--char-delay" as string]: "560ms"}}>你</tspan>
                                        <tspan className="svg-char" style={{["--char-delay" as string]: "620ms"}}>梦</tspan>
                                        <tspan className="svg-char" style={{["--char-delay" as string]: "680ms"}}>枕</tspan>
                                    </text>
                                </svg>
                            </div>
                
                            <div className="flex items-center justify-center gap-3">
                                <span
                                    className="animate-char-reveal w-12 h-px bg-gradient-to-r from-transparent to-[var(--brand-start)]/50"
                                    style={{
                                        animationDelay: "1500ms"
                                    }} />
                                <span
                                    className="animate-char-reveal w-2 h-2 rounded-full bg-[var(--brand-glow)]"
                                    style={{
                                        animationDelay: "1600ms"
                                    }} />
                                <span
                                    className="animate-char-reveal w-12 h-px bg-gradient-to-l from-transparent to-[var(--brand-end)]/50"
                                    style={{
                                        animationDelay: "1700ms"
                                    }} />
                            </div>
                        </div>
            
                        <div className="text-center">
                            <WordReveal
                                text="粘贴文章·AI智能解析·一键生成精美脑图"
                                className="text-lg max-w-xl mx-auto leading-relaxed"
                                delayBase={1900}
                                wordDelay={200} />
                        </div>
            
                        <RevealGroup delayBase={150}>
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                {[{
                                    icon: Wand2,
                                    text: "智能生成",
                                    desc: "AI 深度理解"
                                }, {
                                    icon: Layers,
                                    text: "14种模板",
                                    desc: "专业多风格"
                                }, {
                                    icon: Download,
                                    text: "高清导出",
                                    desc: "PNG 无水印"
                                }].map((item, idx) => <div
                                    key={idx}
                                    className="group relative flex items-center gap-3 px-5 py-3 rounded-2xl md:bg-background/40 md:backdrop-blur-sm border border-border/50 md:border-border/50 hover:border-[var(--brand-glow)]/50 md:hover:bg-background/70 transition-all duration-300 cursor-default overflow-hidden">
                        
                                    <div
                                        className="absolute inset-0 bg-gradient-to-br from-[var(--brand-start)]/0 via-[var(--brand-mid)]/0 to-[var(--brand-end)]/0 group-hover:from-[var(--brand-start)]/10 group-hover:via-[var(--brand-mid)]/5 group-hover:to-[var(--brand-end)]/10 transition-all duration-500" />
                        
                                    <div
                                        className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--brand-start)]/20 to-[var(--brand-end)]/20 group-hover:from-[var(--brand-start)]/30 group-hover:to-[var(--brand-end)]/30 transition-all duration-300">
                                        <item.icon
                                            className="w-5 h-5 text-[var(--brand-glow)] group-hover:scale-110 group-hover:rotate-3 transition-all duration-300" />
                                    </div>
                        
                                    <div className="relative flex flex-col">
                                        <span
                                            className="text-sm font-medium text-foreground/90 group-hover:text-foreground transition-colors">{item.text}</span>
                                        <span className="text-xs text-muted-foreground/60">{item.desc}</span>
                                    </div>
                                </div>)}
                            </div>
                        </RevealGroup>
            
                        <RevealGroup delayBase={200}>
                            <div className="relative">
                    
                                <div
                                    className="absolute -inset-2 md:bg-gradient-to-r from-[var(--brand-start)]/30 md:via-[var(--brand-mid)]/20 md:to-[var(--brand-end)]/30 md:rounded-3xl md:blur-2xl md:opacity-40 animate-pulse-slow" />
                    
                                <div
                                    className="relative md:bg-background/90 md:backdrop-blur-2xl md:border md:border-border/80 md:rounded-3xl md:overflow-hidden md:shadow-2xl md:shadow-[var(--brand-start)]/10">
                        
                                    <div
                                        className="hidden sm:block absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)]" />
                                    <div className="p-2 sm:p-6 md:p-8">
                                        <AudioUpload
                                            importFileKey={searchParams.get("fileKey") || undefined}
                                            mode={playMode}
                                            onModeChange={handleModeChange}
                                            onAudioUploaded={(audioList) => {
                                                console.log("音频已上传:", audioList);
                                                const last = audioList[audioList.length - 1];
                                                if (last) toast.success(`「${last.file.name}」上传成功`);
                                            }}
                                            onAudioRemoved={(id) => {
                                                console.log("音频已移除:", id);
                                            }}
                                        >
                                            <div className="space-y-5 sm:space-y-6">
                                                <div className="space-y-4 sm:space-y-4 pt-2 sm:pt-0">
                                                    <button
                                                        onClick={() => {
                                                            setEditingTask(null);
                                                            setShowTaskForm(true);
                                                        }}
                                                        className="w-full relative overflow-hidden px-5 sm:px-5 py-4 sm:py-3.5 rounded-xl sm:rounded-xl font-bold text-sm transition-all duration-300 transform text-[#050510] hover:-translate-y-0.5 cursor-pointer flex items-center justify-center gap-2"
                                                        style={{
                                                            background: "linear-gradient(135deg, #00d4aa 0%, #00b894 50%, #00d4aa 100%)",
                                                            boxShadow: "0 4px 15px rgba(0, 212, 170, 0.3)",
                                                        }}
                                                    >
                                                        <Plus className="w-4 h-4 sm:w-4 sm:h-4" />
                                                        新建任务
                                                    </button>

                                                    <TaskList
                                                        tasks={tasks}
                                                        onEdit={handleEditTask}
                                                        onRefresh={handleRefreshTasks}
                                                    />
                                                </div>
                                            </div>
                                        </AudioUpload>
                                    </div>
                        
                                    <div
                                        className="hidden sm:block absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--brand-glow)]/50 to-transparent" />
                                </div>
                            </div>
                        </RevealGroup>
                    </div>
                </section>}
    
                {step === "generating" && <GeneratingAnimation
                    content={currentContent}
                    processedContent={processedContent}
                    showOriginal={showOriginal}
                    onToggleOriginal={handleToggleOriginal}
                    onCancel={handleCancel}
                    templateCount={selectedTemplates.length}
                    contentLength={currentContent.length}
                    completedCount={mindmaps.length}
                />}
    
                {step === "preview" && (
                    <div className="fixed inset-0 z-[99] bg-gradient-to-b from-[#050510] via-[#0a0a1a] to-[#050510]">
                        <div className="absolute top-0 left-0 right-0 z-50">
                            <div className="flex items-center justify-between px-4 py-2 bg-[#0a0a1a]/95 backdrop-blur-xl border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleBack}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all">
                                        <ArrowLeft className="w-4 h-4" />
                                        <span>返回</span>
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* 保存记录按钮 */}
                                    <button
                                        onClick={handleSaveRecord}
                                        disabled={savingRecord}
                                        className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] text-white hover:opacity-90 transition-all disabled:opacity-50"
                                    >
                                        <Save className="w-4 h-4" />
                                        <span>{savingRecord ? "保存中..." : "保存记录"}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="absolute inset-0 pt-12 pb-16">
                                {/* 梦枕音频管理区域 - 待开发 */}
                        </div>
                    </div>
                )}
            </main>

            <TaskModal
                visible={showTaskForm}
                onClose={() => {
                    setShowTaskForm(false);
                    setEditingTask(null);
                }}
            >
                <TaskForm
                    editTask={editingTask}
                    onSave={handleTaskSaved}
                    onCancel={() => {
                        setShowTaskForm(false);
                        setEditingTask(null);
                    }}
                />
            </TaskModal>

            <footer className="border-t border-border py-8 px-6 bg-muted/20 relative z-20">
                <div className="max-w-5xl mx-auto text-center">
                    <div className="flex items-center justify-center gap-2 mb-3">
                        <Image
                            src="/logo.png"
                            alt="梦枕"
                            width={20}
                            height={20}
                            className="rounded-md shadow-[inset_0_1px_4px_rgba(0,0,0,0.35)]"
                        />
                        <span
                            className="font-bold text-lg bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] bg-clip-text text-transparent">梦枕</span>
                    </div>
                    <p className="text-xs text-muted-foreground">深夜助眠播放器 · PWA渐进式网页应用 · 自定义音频</p>
                </div>
            </footer>
        </div>
    );
}
