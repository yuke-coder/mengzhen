"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MindMapTemplate } from "@/lib/mindmap-types";
import { TemplateSelector } from "@/components/template-selector";
import RippleButton from "@/components/RippleButton";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/lib/theme-context";

import {
    Music,
    Clock,
    Volume2,
    ChevronRight,
    Sun,
    Moon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type IconComponent = React.ComponentType<{ className?: string }>;

function PainCard({ icon: Icon, title, desc, color, iconBg }: {
    icon: IconComponent;
    title: string;
    desc: string;
    color: string;
    iconBg: string;
}) {
    return (
        <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden">
            <div
                className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-20" />
            <div className="relative z-10 flex flex-col items-center text-center gap-4">
                <div
                    className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${iconBg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-7 h-7 text-[var(--brand-glow)]" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground/90 mb-2">{title}？</h3>
                    <p className="text-sm text-muted-foreground/70 leading-relaxed">{desc}</p>
                </div>
            </div>
            <div
                className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-30 transition-opacity duration-300">
                <ChevronRight className="w-8 h-8 text-muted-foreground/40" />
            </div>
        </div>
    );
}

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
        delayBase = 0
    }: {
        children: React.ReactNode;
        className?: string;
        delayBase?: number;
    }
) {
    const {
        ref,
        isVisible
    } = usePrecisionReveal({
        threshold: 0.08
    });

    return (
        <div ref={ref} className={cn("space-y-2", className)}>
            {Array.isArray(children) ? children.map((child, i) => <div
                key={i}
                style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateY(0)" : "translateY(16px)",
                    transition: `opacity 0.5s ease ${delayBase + i * 80}ms, transform 0.5s ease ${delayBase + i * 80}ms`,
                    pointerEvents: 'auto'
                }}>
                {child}
            </div>) : <div
                style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? "translateY(0)" : "translateY(16px)",
                    transition: `opacity 0.5s ease ${delayBase}ms, transform 0.5s ease ${delayBase}ms`,
                    pointerEvents: 'auto'
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
                className={cn("char-hidden animate-char-reveal", charClassName)}
                style={{
                    "--char-delay": `${delayBase + i * charDelay}ms`,
                    width: char === " " ? "0.3em" : "auto"
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
                    className={cn("char-hidden animate-char-reveal text-foreground/70", wordClassName)}
                    style={{
                        "--char-delay": `${delayBase + i * wordDelay + j * 40}ms`
                    } as React.CSSProperties}>
                    {char}
                </span>)}
                {i < words.length - 1 && <span
                    className={cn("char-hidden animate-char-reveal text-[var(--brand-glow)]/50 mx-2")}
                    style={{
                        "--char-delay": `${delayBase + i * wordDelay + word.length * 40}ms`
                    } as React.CSSProperties}>
                    {separator}
                </span>}
            </span>)}
        </span>
    );
}

function useScrollVisibility(targetRef: React.RefObject<HTMLElement | null>) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (!targetRef.current) {
                setIsVisible(false);
                return;
            }

            const rect = targetRef.current.getBoundingClientRect();
            const isInView = rect.top < window.innerHeight && rect.bottom > 0;
            setIsVisible(isInView);
        };

        handleScroll();

        window.addEventListener("scroll", handleScroll, {
            passive: true
        });

        return () => window.removeEventListener("scroll", handleScroll);
    }, [targetRef]);

    return isVisible;
}

function FloatingBar(
    {
        visible,
        selectedTemplates
    }: {
        visible: boolean;
        selectedTemplates: string[];
    }
) {
    const router = useRouter();

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 z-[500]",
                visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
            )}
            style={{
                transition: visible ? "transform 0.3s ease-out, opacity 0.3s ease-out" : "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease-out"
            }}>
            {}
            <div className="mx-auto max-w-md px-5 pb-5">
                <div
                    className="group relative flex items-center justify-between gap-4 px-4 py-3 rounded-2xl \\\                                bg-background/80 backdrop-blur-xl border border-border/60 \\\                                shadow-lg shadow-foreground/5\\\                                hover:shadow-xl hover:shadow-foreground/10 hover:border-border/80\\\                                transition-all duration-300 ease-out\\\                                overflow-hidden">
                    {}
                    <div
                        className="absolute inset-0 bg-gradient-to-r from-[var(--brand-start)]/5 via-[var(--brand-mid)]/3 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    {}
                    <div className="relative flex items-center gap-3 z-10">
                        <img
                            src="/logo.png"
                            alt="梦枕"
                            className="w-9 h-9 rounded-xl shadow-md shadow-[inset_0_2px_6px_rgba(0,0,0,0.35)] transition-transform duration-300 group-hover:scale-110" />
                        <span className="font-bold text-base tracking-tight">
                            <span
                                className="bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] bg-clip-text text-transparent">梦枕
                                                                                                                            </span>
                        </span>
                    </div>
                    {}
                    <RippleButton
                        onClick={() => router.push(
                            `/settings${selectedTemplates.length > 0 ? `?templates=${selectedTemplates.join(",")}` : ""}`
                        )}
                        className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] text-white font-semibold text-sm shadow-lg shadow-[var(--brand-start)]/25 hover:shadow-xl hover:shadow-[var(--brand-start)]/35 hover:scale-105 active:scale-95 transition-all duration-200 ease-out z-10">
                        <span className="relative flex items-center gap-2">
                            <span suppressHydrationWarning>免费体验</span>
                            <ChevronRight
                                className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
                        </span>
                    </RippleButton>
                </div>
            </div>
        </div>
    );
}

export default function HomePage() {
    const router = useRouter();
    const { setTheme, resolvedTheme } = useTheme();
    
    const [selectedTemplates, setSelectedTemplates] = useState<MindMapTemplate[]>([]);
    const [recommendedTemplates, setRecommendedTemplates] = useState<MindMapTemplate[]>([]);
    const [isRecommending, setIsRecommending] = useState(false);
    const heroButtonRef = useRef<HTMLButtonElement>(null);
    const bottomCtaRef = useRef<HTMLButtonElement>(null);
    const heroButtonVisible = useScrollVisibility(heroButtonRef as React.RefObject<HTMLElement | null>);
    const bottomCtaVisible = useScrollVisibility(bottomCtaRef as React.RefObject<HTMLElement | null>);
    const showFloatingBar = !heroButtonVisible && !bottomCtaVisible;

    const scrollToSection = (id: string) => {
        document.getElementById(id)?.scrollIntoView({
            behavior: "smooth"
        });
    };

    return (
        <div
            className="min-h-screen text-foreground overflow-x-hidden relative"
            suppressHydrationWarning>

            <main className="relative">
                {}
                <section
                    className="relative min-h-[85vh] flex flex-col items-center justify-center px-6 overflow-hidden">
                    {}
                    <div className="absolute inset-0 overflow-hidden">
                        <svg
                            className="absolute inset-0 w-full h-full opacity-30 z-0"
                            viewBox="0 0 1200 800"
                            preserveAspectRatio="xMidYMid slice">
                            <defs>
                                <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                                    <stop offset="0%" stopColor="var(--brand-glow)" stopOpacity="0.6" />
                                    <stop offset="100%" stopColor="var(--brand-glow)" stopOpacity="0" />
                                </radialGradient>
                                <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="var(--brand-dim)" stopOpacity="0" />
                                    <stop offset="50%" stopColor="var(--brand-glow)" stopOpacity="0.8" />
                                    <stop offset="100%" stopColor="var(--brand-dim)" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {}
                            <g>
                                <path
                                    d="M100,400 Q300,200 500,350 T900,400"
                                    fill="none"
                                    stroke="url(#lineGrad)"
                                    strokeWidth="1.5"
                                    strokeDasharray="8,4"
                                    className="animate-dash" />
                                <path
                                    d="M200,500 Q400,600 600,450 T1100,300"
                                    fill="none"
                                    stroke="url(#lineGrad)"
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
                            {}
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
                                        fill="url(#nodeGlow)"
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
                    </div>
                    <div className="relative z-1000 max-w-4xl mx-auto text-center space-y-10">
                        {}
                        <div className="space-y-2">
                            <svg
                                className="w-full max-w-4xl mx-auto"
                                viewBox="0 0 600 300"
                                preserveAspectRatio="xMidYMid meet">
                                <defs>
                                    <linearGradient id="titleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#5EEDA0" />
                                        <stop offset="35%" stopColor="#40C78A" />
                                        <stop offset="50%" stopColor="#60C4A0" />
                                        <stop offset="65%" stopColor="#9055E0" />
                                        <stop offset="100%" stopColor="#A855F7" />
                                    </linearGradient>
                                </defs>
                                <text
                                    x="50%"
                                    y="150"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize="clamp(56px, 12vw, 120px)"
                                    fontWeight="bold"
                                    fontFamily="system-ui, -apple-system, sans-serif"
                                    fill="url(#titleGradient)"
                                    style={{
                                        boxShadow: "rgba(0, 0, 0, 0.15) 0px 0px 30px 0px"
                                    }}>
                                    {}
                                    <tspan
                                        x="50%"
                                        dy="-0.5em"
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "200ms"
                                        }}>星</tspan>
                                    <tspan
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "260ms"
                                        }}>河</tspan>
                                    <tspan
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "320ms"
                                        }}>入</tspan>
                                    <tspan
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "380ms"
                                        }}>眠</tspan>
                                    {}
                                    <tspan
                                        x="50%"
                                        dy="1.2em"
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "500ms"
                                        }}>伴</tspan>
                                    <tspan
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "560ms"
                                        }}>你</tspan>
                                    <tspan
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "620ms"
                                        }}>梦</tspan>
                                    <tspan
                                        className="svg-char"
                                        style={{
                                            ["--char-delay" as string]: "680ms"
                                        }}>枕</tspan>
                                </text>
                            </svg>
                        </div>
                        {}
                        <WordReveal
                            text="PWA渐进式网页应用构建·云端数据库数据持久化·Cookie客户端本地持久化存储"
                            className="text-lg md:text-xl max-w-xl mx-auto leading-relaxed font-light"
                            delayBase={1200}
                            wordDelay={200} />
                        {}
                        <RevealGroup delayBase={300}>
                            <div className="inline-flex flex-col items-center gap-4">
                                {}
                                <div
                                    className="group flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-[var(--brand-start)]/20 to-[var(--brand-end)]/15 border border-[var(--brand-start)]/30 backdrop-blur-sm hover:border-[var(--brand-start)]/50 hover:from-[var(--brand-start)]/25 hover:to-[var(--brand-end)]/20 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 ease-out cursor-default">
                                    <div className="relative flex items-center gap-2">
                                        <div
                                            className="w-2.5 h-2.5 rounded-full bg-[var(--brand-start)] animate-pulse" />
                                        <span suppressHydrationWarning className="text-[var(--brand-start)] font-semibold text-sm tracking-wide">用户认证系统</span>
                                    </div>
                                    <div className="w-px h-4 bg-[var(--brand-start)]/30" />
                                    <span suppressHydrationWarning className="text-sm text-foreground/70">全平台兼容</span>
                                    <span suppressHydrationWarning 
                                        className="text-sm text-[var(--brand-start)]/60 font-medium tracking-wide group-hover:font-bold group-hover:text-[var(--brand-start)] transition-all duration-300 relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-0.5 after:bg-[var(--brand-start)] group-hover:after:w-full after:transition-all after:duration-300 after:ease-out"
                                        style={{ fontFamily: "'Georgia', 'Cambria', 'Times New Roman', 'STKaiti', 'KaiTi', 'FangSong', serif" }}>
                                        全自动流程
                                    </span>
                                </div>
                                {}
                                <RippleButton
                                    ref={heroButtonRef}
                                    onClick={() => router.push(
                                        `/settings${selectedTemplates.length > 0 ? `?templates=${selectedTemplates.join(",")}` : ""}`
                                    )}
                                    className="group relative inline-flex items-center gap-3 px-6 py-3 rounded-2xl bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] text-white font-semibold text-lg shadow-xl shadow-[var(--brand-start)]/25 z-10 hover:z-20 transition-[transform,box-shadow,z-index] duration-300 hover:shadow-2xl hover:shadow-[var(--brand-start)]/35 hover:scale-105 active:scale-95">
                                    {}
                                    <div
                                        className="absolute inset-0 bg-gradient-to-r from-[var(--brand-end)] to-[var(--brand-start)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                    {}
                                    <div className="absolute inset-0 opacity-30">
                                        <div
                                            className="absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                                    </div>
                                    {}
                                    <div className="relative flex items-center gap-3">
                                        <img 
                                            src="/logo.png" 
                                            alt="梦枕" 
                                            className="w-6 h-6 group-hover:scale-110 transition-transform duration-300 rounded shadow-md" 
                                        />
                                        <span
                                            style={{
                                                fontFamily: "DOUYINSANSBOLD-GB",
                                                fontSize: "24px",
                                                filter: "drop-shadow(rgb(161, 161, 170) 0px 0px 10px)"
                                            }} suppressHydrationWarning>免费体验</span>
                                        <ChevronRight
                                            className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
                                    </div>
                                </RippleButton>
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                                {[{
                                    icon: Music,
                                    text: "多格式音频适配"
                                }, {
                                    icon: Clock,
                                    text: "时段自定义配置"
                                }, {
                                    icon: Volume2,
                                    text: "精细化音量管控"
                                }].map((item, idx) => <div
                                    key={idx}
                                    className="group flex items-center gap-2 px-4 py-2 rounded-full bg-background/60 backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 hover:bg-background/80 transition-all duration-300 cursor-default">
                                    <item.icon
                                        className="w-4 h-4 text-[var(--brand-glow)] group-hover:scale-110 transition-transform" />
                                    <span
                                        className="text-sm text-foreground/80 group-hover:text-foreground transition-colors"
                                        style={{
                                            fontFamily: "DOUYINSANSBOLD-GB",
                                            fontWeight: "normal",
                                            fontSize: "16px"
                                        }}>{item.text}</span>
                                </div>)}
                            </div>
                        </RevealGroup>
                        {}
                        <RevealGroup delayBase={500}>
                            <div className="flex flex-col items-center gap-3 pt-8">
                                <span
                                    className="text-[11px] text-muted-foreground/40 tracking-[0.3em] uppercase" suppressHydrationWarning>向下探索</span>
                                <div
                                    className="relative w-6 h-10 rounded-full border border-border/30 flex items-start justify-center p-1.5">
                                    <div
                                        className="w-1.5 h-3 rounded-full bg-gradient-to-b from-[var(--brand-glow)] to-[var(--brand-dim)] animate-scroll-indicator" />
                                </div>
                            </div>
                        </RevealGroup>
                    </div>
                </section>
                {}
                <section id="features" className="py-32 px-6 relative overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-gradient-radial from-[var(--brand-glow)]/8 via-transparent to-transparent blur-3xl" />
                        <div className="absolute bottom-0 right-1/4 w-80 h-80 rounded-full bg-gradient-radial from-[var(--brand-end)]/5 via-transparent to-transparent blur-3xl" />
                    </div>
                    <div className="max-w-6xl mx-auto relative z-10">
                        <RevealGroup className="text-center mb-20" delayBase={0}>
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--brand-glow)]/10 border border-[var(--brand-glow)]/20 mb-6">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-glow)] animate-pulse" />
                                <span suppressHydrationWarning className="text-[var(--brand-glow)] text-sm font-medium">核心优势</span>
                            </div>
                            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                                <span suppressHydrationWarning className="text-foreground/90">专为中国浅眠人群</span>
                                <span className="block bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>匠心打造</span>
                            </h2>
                            <p className="text-lg text-muted-foreground/70 max-w-2xl mx-auto">深度适配睡眠浅、对音量突变敏感、半夜易醒的用户群体</p>
                        </RevealGroup>

                        {/* 第一板块：核心痛点 - 独立卡片平铺 */}
                        <div className="grid md:grid-cols-2 gap-6 mb-16">
                            <div className="group relative flex items-start gap-4 p-5 rounded-2xl border border-[var(--brand-glow)]/20 hover:border-[var(--brand-glow)]/40 hover:shadow-lg hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-0.5 transition-all duration-300"
                                style={{
                                    background: `radial-gradient(circle 80% 70% at 10% 20%, rgba(34, 211, 170, 0.35), transparent), radial-gradient(circle 60% 80% at 90% 30%, rgba(6, 182, 212, 0.25), transparent), radial-gradient(circle 70% 50% at 30% 80%, rgba(16, 185, 129, 0.2), transparent), radial-gradient(circle 50% 60% at 70% 90%, rgba(0, 212, 170, 0.15), transparent), radial-gradient(circle 90% 40% at 50% 50%, rgba(20, 184, 166, 0.1), transparent)`
                                }}>
                                <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[var(--brand-glow)]/20 text-[var(--brand-glow)] text-xs font-medium">
                                    专为浅眠人群
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-start)]/20 to-[var(--brand-end)]/10 flex items-center justify-center shrink-0">
                                    <Moon className="w-6 h-6 text-[var(--brand-glow)]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground/90 mb-2">睡眠深度较浅</h3>
                                    <p className="text-sm text-muted-foreground/70 leading-relaxed">对音量突变敏感，音频启停稍有不慎便会彻底惊醒，难以再次入睡</p>
                                </div>
                            </div>
                            <div className="group relative flex items-start gap-4 p-5 rounded-2xl border border-[var(--brand-glow)]/20 hover:border-[var(--brand-glow)]/40 hover:shadow-lg hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-0.5 transition-all duration-300"
                                style={{
                                    background: `radial-gradient(circle 90% 60% at 85% 15%, rgba(251, 191, 36, 0.35), transparent), radial-gradient(circle 70% 80% at 15% 25%, rgba(249, 115, 22, 0.25), transparent), radial-gradient(circle 60% 70% at 40% 85%, rgba(245, 158, 11, 0.2), transparent), radial-gradient(circle 80% 50% at 75% 75%, rgba(234, 179, 8, 0.15), transparent), radial-gradient(circle 50% 90% at 20% 60%, rgba(202, 138, 4, 0.1), transparent)`
                                }}>
                                <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[var(--brand-glow)]/20 text-[var(--brand-glow)] text-xs font-medium">
                                    专为浅眠人群
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-start)]/20 to-[var(--brand-end)]/10 flex items-center justify-center shrink-0">
                                    <Sun className="w-6 h-6 text-[var(--brand-glow)]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground/90 mb-2">夜间易中途觉醒</h3>
                                    <p className="text-sm text-muted-foreground/70 leading-relaxed">入睡效率良好，但夜间频繁中途醒来，需要柔和音频辅助接续睡眠</p>
                                </div>
                            </div>
                            <div className="group relative flex items-start gap-4 p-5 rounded-2xl border border-[var(--brand-glow)]/20 hover:border-[var(--brand-glow)]/40 hover:shadow-lg hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-0.5 transition-all duration-300"
                                style={{
                                    background: `radial-gradient(circle 80% 90% at 25% 35%, rgba(168, 85, 247, 0.35), transparent), radial-gradient(circle 70% 60% at 75% 15%, rgba(139, 92, 246, 0.25), transparent), radial-gradient(circle 60% 80% at 45% 90%, rgba(124, 58, 237, 0.2), transparent), radial-gradient(circle 90% 70% at 80% 65%, rgba(109, 40, 217, 0.15), transparent), radial-gradient(circle 50% 50% at 15% 55%, rgba(147, 51, 234, 0.1), transparent)`
                                }}>
                                <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[var(--brand-glow)]/20 text-[var(--brand-glow)] text-xs font-medium">
                                    专为浅眠人群
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-start)]/20 to-[var(--brand-end)]/10 flex items-center justify-center shrink-0">
                                    <Volume2 className="w-6 h-6 text-[var(--brand-glow)]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground/90 mb-2">音量突变惊醒</h3>
                                    <p className="text-sm text-muted-foreground/70 leading-relaxed">精准音量渐入渐出自定义，彻底规避音频启停音量骤变惊醒用户的问题</p>
                                </div>
                            </div>
                            <div className="group relative flex items-start gap-4 p-5 rounded-2xl border border-[var(--brand-glow)]/20 hover:border-[var(--brand-glow)]/40 hover:shadow-lg hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-0.5 transition-all duration-300"
                                style={{
                                    background: `radial-gradient(circle 70% 80% at 55% 10%, rgba(236, 72, 153, 0.35), transparent), radial-gradient(circle 80% 60% at 35% 75%, rgba(244, 63, 94, 0.25), transparent), radial-gradient(circle 60% 90% at 85% 45%, rgba(225, 29, 72, 0.2), transparent), radial-gradient(circle 90% 70% at 15% 85%, rgba(190, 24, 93, 0.15), transparent), radial-gradient(circle 50% 50% at 65% 35%, rgba(219, 39, 119, 0.1), transparent)`
                                }}>
                                <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-[var(--brand-glow)]/20 text-[var(--brand-glow)] text-xs font-medium">
                                    专为浅眠人群
                                </div>
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-start)]/20 to-[var(--brand-end)]/10 flex items-center justify-center shrink-0">
                                    <Clock className="w-6 h-6 text-[var(--brand-glow)]" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground/90 mb-2">深夜操作困难</h3>
                                    <p className="text-sm text-muted-foreground/70 leading-relaxed">半夜醒来后睡意朦胧，不愿手动操作手机，一键预设定时播放完美适配</p>
                                </div>
                            </div>
                        </div>

                        {/* 第二板块：接续睡眠 */}
                        <div className="text-center mb-8">
                            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--brand-glow)]/10 text-sm text-[var(--brand-glow)] mb-4">
                                <Zap className="w-4 h-4" />
                                核心价值
                            </div>
                            <h3 className="text-2xl font-bold text-foreground/90 mb-2">夜间觉醒后接续睡眠</h3>
                            <p className="text-muted-foreground/60">不求辅助入眠，只为中途觉醒后快速重新入睡</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                            {[
                                { icon: RefreshCw, title: "觉醒自动续播", desc: "夜间醒来后，柔和音频无缝衔接，帮助快速重新入睡", gradient: "radial-gradient(ellipse 70% 60% at 20% 30%, rgba(34, 211, 170, 0.25), transparent), radial-gradient(ellipse 60% 50% at 80% 70%, rgba(6, 182, 212, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(16, 185, 129, 0.15), transparent)" },
                                { icon: Volume2, title: "零突变音量", desc: "全程音量渐入渐出，彻底规避惊醒风险，营造柔和睡眠氛围", gradient: "radial-gradient(ellipse 70% 60% at 30% 40%, rgba(16, 185, 129, 0.25), transparent), radial-gradient(ellipse 60% 50% at 70% 80%, rgba(20, 184, 166, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(5, 150, 105, 0.15), transparent)" },
                                { icon: Moon, title: "黑屏后台播放", desc: "锁屏休眠持续播放，不干扰睡眠，支持定时自动停止", gradient: "radial-gradient(ellipse 70% 60% at 40% 20%, rgba(139, 92, 246, 0.25), transparent), radial-gradient(ellipse 60% 50% at 60% 80%, rgba(124, 58, 237, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(109, 40, 217, 0.15), transparent)" }
                            ].map((item, idx) => (
                                <div key={idx} className="group relative p-5 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                                    style={{ background: item.gradient }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-glow)]/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                            <item.icon className="w-5 h-5 text-[var(--brand-glow)]" />
                                        </div>
                                        <h4 className="font-semibold text-foreground/90 group-hover:text-[var(--brand-glow)] transition-colors duration-300">{item.title}</h4>
                                    </div>
                                    <p className="relative text-sm text-muted-foreground/70 group-hover:text-muted-foreground/90 transition-colors duration-300">{item.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* 第三板块：音频控制 */}
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-bold text-foreground/90 mb-2">个性化音频配置</h3>
                            <p className="text-muted-foreground/60">精细化音量控制，适配个人听觉耐受度</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
                            {[
                                { icon: Music, title: "全格式兼容", desc: "MP3、WAV、FLAC 等全主流音频格式", gradient: "radial-gradient(ellipse 70% 60% at 20% 30%, rgba(34, 211, 238, 0.25), transparent), radial-gradient(ellipse 60% 50% at 80% 70%, rgba(59, 130, 246, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(14, 165, 233, 0.15), transparent)" },
                                { icon: Headphones, title: "在线试听", desc: "上传后实时预览，快速筛选适配音频", gradient: "radial-gradient(ellipse 70% 60% at 30% 40%, rgba(14, 165, 233, 0.25), transparent), radial-gradient(ellipse 60% 50% at 70% 80%, rgba(99, 102, 241, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(79, 70, 229, 0.15), transparent)" },
                                { icon: Volume2, title: "小数级音量", desc: "0-100% 精细化分级，支持 0.1 微调", gradient: "radial-gradient(ellipse 70% 60% at 40% 20%, rgba(168, 85, 247, 0.25), transparent), radial-gradient(ellipse 60% 50% at 60% 80%, rgba(139, 92, 246, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(124, 58, 237, 0.15), transparent)" },
                                { icon: Layers, title: "播放列表", desc: "自定义音频播放顺序，编排专属播放列表", gradient: "radial-gradient(ellipse 70% 60% at 20% 50%, rgba(251, 191, 36, 0.25), transparent), radial-gradient(ellipse 60% 50% at 80% 30%, rgba(249, 115, 22, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(245, 158, 11, 0.15), transparent)" },
                                { icon: Settings2, title: "全面自定义", desc: "定时、渐变音量、播放规则全部可调", gradient: "radial-gradient(ellipse 70% 60% at 30% 20%, rgba(236, 72, 153, 0.25), transparent), radial-gradient(ellipse 60% 50% at 70% 80%, rgba(244, 63, 94, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(225, 29, 72, 0.15), transparent)" },
                                { icon: Calendar, title: "周期定时", desc: "每日/工作日重复定时，适配长期规律睡眠", gradient: "radial-gradient(ellipse 70% 60% at 20% 30%, rgba(16, 185, 129, 0.25), transparent), radial-gradient(ellipse 60% 50% at 80% 70%, rgba(20, 184, 166, 0.2), transparent), radial-gradient(ellipse 50% 40% at 50% 50%, rgba(5, 150, 105, 0.15), transparent)" }
                            ].map((item, idx) => (
                                <div key={idx} className="group relative p-5 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                                    style={{ background: item.gradient }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-glow)]/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                            <item.icon className="w-5 h-5 text-[var(--brand-glow)]" />
                                        </div>
                                        <h4 className="font-semibold text-foreground/90 group-hover:text-[var(--brand-glow)] transition-colors duration-300">{item.title}</h4>
                                    </div>
                                    <p className="relative text-sm text-muted-foreground/70 group-hover:text-muted-foreground/90 transition-colors duration-300">{item.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* 第三板块：PWA技术 */}
                        <div className="mb-12">
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--brand-start)]/20 to-[var(--brand-end)]/10 mb-4">
                                    <Smartphone className="w-8 h-8 text-[var(--brand-glow)]" />
                                </div>
                                <h3 className="text-2xl font-bold text-foreground/90 mb-2">后台稳定播放</h3>
                                <p className="text-muted-foreground/60">夜间锁屏休眠持续播放，不中断接续睡眠</p>
                                </div>
                                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {[
                                        { icon: Zap, title: "后台唤醒", desc: "锁屏休眠仍可定时唤醒正常播放", gradient: "radial-gradient(ellipse 80% 70% at 20% 30%, rgba(251, 191, 36, 0.3), transparent), radial-gradient(ellipse 60% 80% at 80% 70%, rgba(249, 115, 22, 0.25), transparent), radial-gradient(ellipse 70% 50% at 40% 85%, rgba(234, 179, 8, 0.2), transparent), radial-gradient(ellipse 90% 60% at 60% 40%, rgba(202, 138, 4, 0.15), transparent)" },
                                        { icon: Battery, title: "电池优化", desc: "忽略电池优化引导，提升休眠稳定性", gradient: "radial-gradient(ellipse 80% 70% at 30% 20%, rgba(168, 85, 247, 0.3), transparent), radial-gradient(ellipse 60% 80% at 70% 80%, rgba(139, 92, 246, 0.25), transparent), radial-gradient(ellipse 70% 50% at 50% 50%, rgba(124, 58, 237, 0.2), transparent), radial-gradient(ellipse 90% 60% at 20% 60%, rgba(147, 51, 234, 0.15), transparent)" },
                                        { icon: RefreshCw, title: "异常兜底", desc: "系统杀进程后可自动重试唤醒", gradient: "radial-gradient(ellipse 80% 70% at 25% 35%, rgba(236, 72, 153, 0.3), transparent), radial-gradient(ellipse 60% 80% at 75% 65%, rgba(244, 63, 94, 0.25), transparent), radial-gradient(ellipse 70% 50% at 45% 80%, rgba(225, 29, 72, 0.2), transparent), radial-gradient(ellipse 90% 60% at 65% 25%, rgba(190, 24, 93, 0.15), transparent)" },
                                        { icon: WifiOff, title: "离线模式", desc: "断网网络不佳时定时播放正常", gradient: "radial-gradient(ellipse 80% 70% at 20% 25%, rgba(14, 165, 233, 0.3), transparent), radial-gradient(ellipse 60% 80% at 80% 75%, rgba(99, 102, 241, 0.25), transparent), radial-gradient(ellipse 70% 50% at 50% 45%, rgba(79, 70, 229, 0.2), transparent), radial-gradient(ellipse 90% 60% at 30% 70%, rgba(99, 102, 241, 0.15), transparent)" }
                                    ].map((item, idx) => (
                                        <div key={idx} className="group relative text-center p-4 rounded-xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
                                            style={{ background: item.gradient }}>
                                            <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-glow)]/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                            <div className="relative w-10 h-10 rounded-lg bg-[var(--brand-glow)]/10 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                                <item.icon className="w-5 h-5 text-[var(--brand-glow)]" />
                                            </div>
                                            <h4 className="relative font-medium text-foreground/90 text-sm mb-1 group-hover:text-[var(--brand-glow)] transition-colors duration-300">{item.title}</h4>
                                            <p className="relative text-xs text-muted-foreground/60 group-hover:text-muted-foreground/80 transition-colors duration-300">{item.desc}</p>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 text-center">
                                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--brand-glow)]/10 text-sm">
                                        <Monitor className="w-4 h-4 text-[var(--brand-glow)]" />
                                        <span className="text-muted-foreground/80">可添加至手机桌面，像原生 App 一样使用</span>
                                    </div>
                                </div>
                            </div>

                        {/* 第四板块：数据安全 */}
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-bold text-foreground/90 mb-2">分层数据存储方案</h3>
                            <p className="text-muted-foreground/60">兼顾云端便捷性与本地隐私安全</p>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4 mb-12">
                            <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                style={{ background: "radial-gradient(ellipse 80% 70% at 20% 30%, rgba(14, 165, 233, 0.3), transparent), radial-gradient(ellipse 60% 80% at 80% 70%, rgba(59, 130, 246, 0.25), transparent), radial-gradient(ellipse 70% 50% at 40% 85%, rgba(34, 211, 238, 0.2), transparent), radial-gradient(ellipse 90% 60% at 60% 40%, rgba(6, 182, 212, 0.15), transparent)" }}>
                                <div className="absolute inset-0 bg-gradient-to-br from-sky-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500/20 to-blue-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <Database className="w-6 h-6 text-sky-400" />
                                </div>
                                <h4 className="relative text-lg font-semibold text-foreground/90 mb-2 group-hover:text-sky-400 transition-colors duration-300">云端数据库</h4>
                                <p className="relative text-sm text-muted-foreground/70 leading-relaxed">音频文件统一存入云端数据库，跨设备同步无缝使用</p>
                            </div>
                            <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                style={{ background: "radial-gradient(ellipse 80% 70% at 30% 20%, rgba(251, 191, 36, 0.3), transparent), radial-gradient(ellipse 60% 80% at 70% 80%, rgba(249, 115, 22, 0.25), transparent), radial-gradient(ellipse 70% 50% at 50% 50%, rgba(234, 179, 8, 0.2), transparent), radial-gradient(ellipse 90% 60% at 20% 70%, rgba(202, 138, 4, 0.15), transparent)" }}>
                                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <Cookie className="w-6 h-6 text-amber-400" />
                                </div>
                                <h4 className="relative text-lg font-semibold text-foreground/90 mb-2 group-hover:text-amber-400 transition-colors duration-300">本地持久化</h4>
                                <p className="relative text-sm text-muted-foreground/70 leading-relaxed">Cookie 本地存储配置信息，响应速度快、隐私性强</p>
                            </div>
                            <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                style={{ background: "radial-gradient(ellipse 80% 70% at 25% 35%, rgba(16, 185, 129, 0.3), transparent), radial-gradient(ellipse 60% 80% at 75% 65%, rgba(20, 184, 166, 0.25), transparent), radial-gradient(ellipse 70% 50% at 45% 80%, rgba(5, 150, 105, 0.2), transparent), radial-gradient(ellipse 90% 60% at 65% 25%, rgba(6, 182, 212, 0.15), transparent)" }}>
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                    <Shield className="w-6 h-6 text-emerald-400" />
                                </div>
                                <h4 className="relative text-lg font-semibold text-foreground/90 mb-2 group-hover:text-emerald-400 transition-colors duration-300">自主可控</h4>
                                <p className="relative text-sm text-muted-foreground/70 leading-relaxed">支持云端备份开关，自主选择是否同步播放配置</p>
                            </div>
                        </div>

                        {/* 第五板块：极简纯粹 */}
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-bold text-foreground/90 mb-2">纯粹极简的产品定位</h3>
                                <p className="text-muted-foreground/60">零干扰沉浸式接续睡眠体验</p>
                                <div className="flex flex-wrap justify-center gap-3">
                                    {[
                                        { text: "无广告", color: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/30" },
                                        { text: "无付费会员", color: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/30" },
                                        { text: "无订阅", color: "bg-violet-500/10 border-violet-500/20 text-violet-400 hover:bg-violet-500/20 hover:border-violet-500/30" },
                                        { text: "无推广弹窗", color: "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/30" },
                                        { text: "无睡眠监测", color: "bg-pink-500/10 border-pink-500/20 text-pink-400 hover:bg-pink-500/20 hover:border-pink-500/30" },
                                        { text: "无社交分享", color: "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20 hover:border-rose-500/30" },
                                        { text: "轻量快速", color: "bg-sky-500/10 border-sky-500/20 text-sky-400 hover:bg-sky-500/20 hover:border-sky-500/30" },
                                        { text: "低资源占用", color: "bg-teal-500/10 border-teal-500/20 text-teal-400 hover:bg-teal-500/20 hover:border-teal-500/30" },
                                        { text: "无感更新", color: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/30" }
                                    ].map((tag, idx) => (
                                        <span key={idx} className={`px-4 py-2 rounded-full text-sm font-medium border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 cursor-default ${tag.color}`}>
                                            {tag.text}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-6 text-center">
                                    <p className="text-sm text-muted-foreground/60">只专注接续睡眠核心功能，轻量化架构设计</p>
                                </div>
                            </div>

                        {/* 第六板块：安全保障 */}
                        <div className="text-center mb-8">
                            <h3 className="text-2xl font-bold text-foreground/90 mb-2">全方位隐私安全保障</h3>
                            <p className="text-muted-foreground/60">用户数据完全可控</p>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 20% 30%, rgba(168, 85, 247, 0.25), transparent), radial-gradient(ellipse 60% 80% at 80% 70%, rgba(139, 92, 246, 0.2), transparent), radial-gradient(ellipse 70% 50% at 40% 85%, rgba(124, 58, 237, 0.15), transparent), radial-gradient(ellipse 90% 60% at 60% 40%, rgba(147, 51, 234, 0.1), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-600/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                            <Shield className="w-6 h-6 text-violet-400" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-semibold text-foreground/90 group-hover:text-violet-400 transition-colors duration-300">银行级密码安全</h4>
                                            <p className="text-xs text-muted-foreground/60">bcrypt 哈希算法加密</p>
                                        </div>
                                    </div>
                                    <ul className="relative space-y-2 text-sm text-muted-foreground/70">
                                        <li className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                            不可逆加密处理，杜绝明文泄露
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                            独立随机盐值混合加密
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                            抵御彩虹表攻击、暴力破解
                                        </li>
                                    </ul>
                                </div>
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 30% 20%, rgba(34, 211, 238, 0.25), transparent), radial-gradient(ellipse 60% 80% at 70% 80%, rgba(6, 182, 212, 0.2), transparent), radial-gradient(ellipse 70% 50% at 50% 50%, rgba(14, 165, 233, 0.15), transparent), radial-gradient(ellipse 90% 60% at 20% 70%, rgba(0, 182, 199, 0.1), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-600/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                            <Lock className="w-6 h-6 text-cyan-400" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-semibold text-foreground/90 group-hover:text-cyan-400 transition-colors duration-300">数据完全可控</h4>
                                            <p className="text-xs text-muted-foreground/60">无第三方快捷登录</p>
                                        </div>
                                    </div>
                                    <ul className="relative space-y-2 text-sm text-muted-foreground/70">
                                        <li className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                            不收集睡眠数据、不追踪使用行为
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                            音频素材自主上传管理
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                            无多余数据上报，仅存用户主动数据
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                    </section>

                        {/* 第七板块：精准用户群体 */}
                        <section className="py-20 px-6 relative overflow-hidden">
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[300px] rounded-full bg-gradient-radial from-[var(--brand-glow)]/5 via-transparent to-transparent" />
                            </div>
                            <div className="max-w-4xl mx-auto relative z-10">
                                <div className="text-center mb-12">
                                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                                        <span suppressHydrationWarning className="text-foreground/80">专为浅眠人群设计</span>
                                        <span className="bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>接续睡眠</span>
                                    </h2>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {/* 1. 浅眠 / 神经衰弱人群 */}
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 70% 60% at 20% 30%, rgba(34, 211, 238, 0.20), transparent), radial-gradient(ellipse 60% 50% at 80% 70%, rgba(16, 185, 129, 0.15), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-glow)]/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <Moon className="w-8 h-8 text-[var(--brand-glow)]" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded-full bg-[var(--brand-glow)]/20 text-[var(--brand-glow)] text-xs font-medium">核心用户</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground/90 mb-2">浅眠 / 神经衰弱人群</h3>
                                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                            长期睡眠浅、半夜频繁惊醒、对音量突变极度敏感，需要柔和渐变音量 + 全自动定时 + 后台稳定播放
                                        </p>
                                    </div>
                                </div>

                                {/* 2. 高压都市上班族 */}
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 70% 60% at 30% 40%, rgba(251, 191, 36, 0.20), transparent), radial-gradient(ellipse 60% 50% at 70% 80%, rgba(217, 119, 6, 0.15), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <Briefcase className="w-8 h-8 text-amber-500" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-xs font-medium">职场首选</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground/90 mb-2">高压都市上班族</h3>
                                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                            职场压力大、入睡困难，PWA免安装即用，全自动定时关闭，厌恶广告付费与臃肿APP
                                        </p>
                                    </div>
                                </div>

                                {/* 3. 住校学生群体 */}
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 70% 60% at 25% 35%, rgba(168, 85, 247, 0.20), transparent), radial-gradient(ellipse 60% 50% at 75% 75%, rgba(139, 92, 246, 0.15), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <GraduationCap className="w-8 h-8 text-purple-500" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-500 text-xs font-medium">校园适配</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground/90 mb-2">住校学生群体</h3>
                                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                            宿舍环境嘈杂、集体作息受限，自定义专属助眠音频、音量柔和不吵室友，无冗余社交广告
                                        </p>
                                    </div>
                                </div>

                                {/* 4. 产后宝妈 / 新手父母 */}
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 70% 60% at 20% 30%, rgba(236, 72, 153, 0.20), transparent), radial-gradient(ellipse 60% 50% at 80% 70%, rgba(219, 39, 119, 0.15), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-pink-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <Heart className="w-8 h-8 text-pink-500" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-500 text-xs font-medium">新手爸妈</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground/90 mb-2">产后宝妈 / 新手父母</h3>
                                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                            睡眠碎片化、夜间频繁惊醒，没有精力手动开关，全自动预设播放、后台静默运行、解放双手
                                        </p>
                                    </div>
                                </div>

                                {/* 5. 情绪性失眠 / 焦虑人群 */}
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 70% 60% at 30% 25%, rgba(14, 165, 233, 0.20), transparent), radial-gradient(ellipse 60% 50% at 70% 80%, rgba(2, 132, 199, 0.15), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-sky-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <Brain className="w-8 h-8 text-sky-500" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-500 text-xs font-medium">个性化</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground/90 mb-2">情绪性失眠 / 焦虑人群</h3>
                                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                            依赖个人专属音频助眠（冥想音、雨声、私人歌单），拒绝平台推送、商业化干扰
                                        </p>
                                    </div>
                                </div>

                                {/* 6. 中老年浅眠用户 */}
                                <div className="group relative p-6 rounded-2xl backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/40 shadow-lg hover:shadow-xl hover:shadow-[var(--brand-glow)]/10 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden"
                                    style={{ background: "radial-gradient(ellipse 70% 60% at 25% 30%, rgba(16, 185, 129, 0.20), transparent), radial-gradient(ellipse 60% 50% at 75% 75%, rgba(5, 150, 105, 0.15), transparent)" }}>
                                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                                            <Users className="w-8 h-8 text-emerald-500" />
                                        </div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 text-xs font-medium">易上手</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-foreground/90 mb-2">中老年浅眠用户</h3>
                                        <p className="text-sm text-muted-foreground/70 leading-relaxed">
                                            睡眠周期短、半夜易醒，产品操作极简、全自动定时、无复杂功能，适配低门槛使用习惯
                                        </p>
                                    </div>
                                </div>
                            </div>

                    </div>
                </section>

                {/* 展示模式切换 & 全功能免费 */}
                <section className="py-20 px-6 relative overflow-hidden">
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-gradient-radial from-[var(--brand-glow)]/8 via-transparent to-transparent" />
                    </div>
                    <div className="max-w-5xl mx-auto relative z-10">

                        {/* 1. 展示模式切换 */}
                        <RevealGroup className="text-center mb-16" delayBase={0}>
                            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                                <span suppressHydrationWarning className="text-foreground/80">随心切换</span>
                                <span className="bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>展示模式</span>
                            </h2>
                            <p className="text-sm text-muted-foreground/60">适配不同使用环境，自动切换最佳视觉体验</p>
                        </RevealGroup>

                        <RevealGroup delayBase={100}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20 max-w-4xl mx-auto">

                                {/* 日间模式 */}
                                <button
                                    onClick={() => {
                                        setTheme("light");
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        setTheme("light");
                                    }}
                                    type="button"
                                    className="relative p-8 rounded-3xl backdrop-blur-sm border-2 border-amber-500/40 hover:border-amber-500 hover:shadow-xl hover:shadow-amber-500/15 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden text-left cursor-pointer w-full bg-gradient-to-br from-amber-50 to-amber-100 active:scale-95"
                                >
                                    <div className="absolute top-4 right-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-200 to-amber-300 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                        <Sun className="w-8 h-8 text-amber-700" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-xl font-bold text-amber-700 mb-2">日间模式</h3>
                                        <p className="text-sm text-amber-600/80">明亮清晰的视觉体验，适合白天使用</p>
                                    </div>
                                </button>

                                {/* 夜间模式 */}
                                <button
                                    onClick={() => {
                                        setTheme("dark");
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        setTheme("dark");
                                    }}
                                    type="button"
                                    className="relative p-8 rounded-3xl backdrop-blur-sm border-2 border-indigo-500/40 hover:border-indigo-500 hover:shadow-xl hover:shadow-indigo-500/15 hover:-translate-y-2 transition-all duration-400 ease-out overflow-hidden text-left cursor-pointer w-full bg-gradient-to-br from-indigo-900 to-purple-900 active:scale-95"
                                >
                                    <div className="absolute top-4 right-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                        <Moon className="w-8 h-8 text-white" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="text-xl font-bold text-indigo-400 mb-2">夜间模式</h3>
                                        <p className="text-sm text-indigo-300/80">柔和护眼的深色界面，适合夜晚使用</p>
                                    </div>
                                </button>
                            </div>
                        </RevealGroup>

                        {/* 2. 全功能免费使用 */}
                        <RevealGroup className="text-center mb-10" delayBase={0}>
                            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                                <span className="bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>全功能免费</span>
                                <span suppressHydrationWarning className="text-foreground/80">使用权益</span>
                            </h2>
                            <p className="text-sm text-muted-foreground/60">无需付费、无需订阅、无任何限制，尽情享受完整功能</p>
                        </RevealGroup>

                        <RevealGroup delayBase={100}>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">

                                {/* 免费权益卡片1 */}
                                <div className="group relative p-5 rounded-2xl border border-green-500/30 hover:border-green-500/60 hover:shadow-xl hover:shadow-green-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 20% 30%, rgba(34, 197, 94, 0.25), transparent), radial-gradient(ellipse 60% 80% at 80% 70%, rgba(22, 163, 74, 0.2), transparent), radial-gradient(ellipse 70% 50% at 40% 85%, rgba(21, 128, 61, 0.15), transparent)" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/30 to-green-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Gift className="w-6 h-6 text-green-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">全部功能免费</h4>
                                        <p className="text-xs text-muted-foreground/60">无付费门槛</p>
                                    </div>
                                </div>

                                {/* 免费权益卡片2 */}
                                <div className="group relative p-5 rounded-2xl border border-blue-500/30 hover:border-blue-500/60 hover:shadow-xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 30% 20%, rgba(59, 130, 246, 0.25), transparent), radial-gradient(ellipse 60% 80% at 70% 80%, rgba(37, 99, 235, 0.2), transparent), radial-gradient(ellipse 70% 50% at 50% 50%, rgba(29, 78, 216, 0.15), transparent)" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Clock className="w-6 h-6 text-blue-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">全自动定时</h4>
                                        <p className="text-xs text-muted-foreground/60">到点自动播放</p>
                                    </div>
                                </div>

                                {/* 免费权益卡片3 */}
                                <div className="group relative p-5 rounded-2xl border border-purple-500/30 hover:border-purple-500/60 hover:shadow-xl hover:shadow-purple-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 25% 35%, rgba(168, 85, 247, 0.25), transparent), radial-gradient(ellipse 60% 80% at 75% 65%, rgba(139, 92, 246, 0.2), transparent), radial-gradient(ellipse 70% 50% at 45% 80%, rgba(124, 58, 237, 0.15), transparent)" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Zap className="w-6 h-6 text-purple-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">无广告弹窗</h4>
                                        <p className="text-xs text-muted-foreground/60">纯净体验</p>
                                    </div>
                                </div>

                                {/* 免费权益卡片4 */}
                                <div className="group relative p-5 rounded-2xl border border-amber-500/30 hover:border-amber-500/60 hover:shadow-xl hover:shadow-amber-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 20% 25%, rgba(251, 191, 36, 0.25), transparent), radial-gradient(ellipse 60% 80% at 80% 75%, rgba(249, 115, 22, 0.2), transparent), radial-gradient(ellipse 70% 50% at 50% 45%, rgba(234, 179, 8, 0.15), transparent)" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Shield className="w-6 h-6 text-amber-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">隐私零收集</h4>
                                        <p className="text-xs text-muted-foreground/60">数据安全</p>
                                    </div>
                                </div>

                                {/* 免费权益卡片5 */}
                                <div className="group relative p-5 rounded-2xl border border-cyan-500/30 hover:border-cyan-500/60 hover:shadow-xl hover:shadow-cyan-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 30% 30%, rgba(34, 211, 238, 0.25), transparent), radial-gradient(ellipse 60% 80% at 70% 70%, rgba(6, 182, 212, 0.2), transparent), radial-gradient(ellipse 70% 50% at 40% 60%, rgba(14, 165, 233, 0.15), transparent)" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/30 to-cyan-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Smartphone className="w-6 h-6 text-cyan-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">全平台通用</h4>
                                        <p className="text-xs text-muted-foreground/60">多设备同步</p>
                                    </div>
                                </div>

                                {/* 免费权益卡片6 */}
                                <div className="group relative p-5 rounded-2xl border border-pink-500/30 hover:border-pink-500/60 hover:shadow-xl hover:shadow-pink-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 25% 40%, rgba(236, 72, 153, 0.25), transparent), radial-gradient(ellipse 60% 80% at 75% 60%, rgba(244, 63, 94, 0.2), transparent), radial-gradient(ellipse 70% 50% at 50% 75%, rgba(225, 29, 72, 0.15), transparent)" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/30 to-pink-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Shield className="w-6 h-6 text-pink-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">密码安全加密</h4>
                                        <p className="text-xs text-muted-foreground/60">银行级保障</p>
                                    </div>
                                </div>

                                {/* 免费权益卡片7 */}
                                <div className="group relative p-5 rounded-2xl border border-emerald-500/30 hover:border-emerald-500/60 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center"
                                    style={{ background: "radial-gradient(ellipse 80% 70% at 20% 35%, rgba(16, 185, 129, 0.25), transparent), radial-gradient(ellipse 60% 80% at 80% 65%, rgba(5, 150, 105, 0.2), transparent), radial-gradient(ellipse 70% 50% at 45% 55%, rgba(4, 120, 87, 0.15), transparent)" }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/30 to-emerald-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Zap className="w-6 h-6 text-emerald-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">极速加载</h4>
                                        <p className="text-xs text-muted-foreground/60">PWA应用</p>
                                    </div>
                                </div>

                                {/* 免费权益卡片8 */}
                                <div className="group relative p-5 rounded-2xl border border-indigo-500/30 hover:border-indigo-500/60 hover:shadow-xl hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden text-center">
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="relative">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-indigo-600/15 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300">
                                            <Crown className="w-6 h-6 text-indigo-500" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground/90 mb-1">专属音频库</h4>
                                        <p className="text-xs text-muted-foreground/60">云端存储</p>
                                    </div>
                                </div>
                            </div>
                        </RevealGroup>

                    </div>
                </section>

                <section className="py-16 px-6 relative overflow-hidden">
                    {}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] rounded-full bg-gradient-radial from-[var(--brand-glow)]/5 via-transparent to-transparent" />
                    </div>
                    <div className="max-w-5xl mx-auto relative z-10">
                        <RevealGroup className="text-center mb-12" delayBase={0}>
                            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                                <span suppressHydrationWarning className="text-foreground/80">你是否也遇到过</span>
                                <span
                                    className="bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>这些困扰</span>
                            </h2>
                            <p className="text-sm text-muted-foreground/60">梦枕帮你轻松解决</p>
                        </RevealGroup>
                        <RevealGroup delayBase={100}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                <PainCard icon={Upload} title="音频难上传" desc="想用专属音频助眠，却找不到支持私人音频文件的应用" color="from-teal-500/15 to-emerald-500/8" iconBg="from-teal-500/20 to-emerald-500/10" />
                                <PainCard icon={Clock} title="定时不智能" desc="普通定时器无法自动停止，半夜醒来还得手动关闭" color="from-blue-500/15 to-cyan-500/8" iconBg="from-blue-500/20 to-cyan-500/10" />
                                <PainCard icon={Volume2} title="启停太突兀" desc="音频突然播放或停止，音量骤变极易惊醒浅眠的你" color="from-violet-500/15 to-purple-500/8" iconBg="from-violet-500/20 to-purple-500/10" />
                                <PainCard icon={Zap} title="操作太繁琐" desc="现有工具功能分散，全流程自动化难以实现" color="from-amber-500/15 to-orange-500/8" iconBg="from-amber-500/20 to-orange-500/10" />
                            </div>
                        </RevealGroup>
                        {}
                        <RevealGroup delayBase={300}>
                            <div className="mt-10 text-center">
                                <div
                                    className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-[var(--brand-start)]/10 to-[var(--brand-end)]/10 border border-[var(--brand-start)]/20">
                                    <Sparkles className="w-4 h-4 text-[var(--brand-glow)]" />
                                    <span suppressHydrationWarning className="text-sm text-muted-foreground">上传音频 · 自定义定时 · 淡入淡出 · 全自动运行</span>
                                </div>
                            </div>
                        </RevealGroup>
                    </div>
                </section>
                {}
                <section id="templates" className="py-20 px-6">
                    <div className="max-w-4xl mx-auto">
                        <RevealGroup className="text-center mb-10" delayBase={0}>
                            <h2
                                className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] bg-clip-text text-transparent mb-4 tracking-wide">专业模板</h2>
                            <p className="text-base text-muted-foreground font-medium">选择最适合的展示方式</p>
                        </RevealGroup>
                        <RevealGroup delayBase={100}>
                            <TemplateSelector
                                selected={selectedTemplates}
                                onChange={setSelectedTemplates}
                                maxSelect={5}
                                recommended={recommendedTemplates} />
                        </RevealGroup>
                    </div>
                </section>
                {}
                <section className="py-28 px-6 relative">
                    {}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <svg
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[400px] opacity-20"
                            viewBox="0 0 1200 200">
                            <defs>
                                <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="var(--brand-dim)" stopOpacity="0" />
                                    <stop offset="50%" stopColor="var(--brand-glow)" stopOpacity="0.6" />
                                    <stop offset="100%" stopColor="var(--brand-dim)" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path
                                d="M0,100 Q300,60 600,100 T1200,100"
                                fill="none"
                                stroke="url(#flowGrad)"
                                strokeWidth="2"
                                className="animate-flow-line" />
                        </svg>
                    </div>
                    <div className="max-w-4xl mx-auto relative z-10">
                        <RevealGroup className="text-center mb-16" delayBase={0}>
                            <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                                <span suppressHydrationWarning className="text-foreground/90">简单</span>
                                <span
                                    className="bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>三步</span>
                            </h2>
                            <p className="text-base text-muted-foreground/70">从文章到脑图，弹指之间</p>
                        </RevealGroup>
                        <div className="grid md:grid-cols-3 gap-6 relative">
                            {}
                            <div className="hidden md:block absolute top-16 left-1/3 right-1/3 h-px">
                                <div
                                    className="absolute left-1/2 right-0 top-0 h-px bg-gradient-to-r from-[var(--brand-glow)]/40 to-transparent" />
                                <div
                                    className="absolute left-0 right-1/2 top-0 h-px bg-gradient-to-l from-[var(--brand-glow)]/40 to-transparent" />
                            </div>
                            {[{
                                num: "01",
                                icon: FileText,
                                title: "输入内容",
                                desc: "粘贴文章、输入链接或上传文档，支持多种格式",
                                color: "from-[var(--brand-start)]"
                            }, {
                                num: "02",
                                icon: Wand2,
                                title: "智能生成",
                                desc: "AI 瞬间分析内容结构，生成精美思维导图",
                                color: "from-[var(--brand-mid)]"
                            }, {
                                num: "03",
                                icon: Download,
                                title: "导出使用",
                                desc: "一键下载高清图片，或直接全屏展示",
                                color: "from-[var(--brand-end)]"
                            }].map((item, idx) => <RevealGroup key={idx} delayBase={idx * 120}>
                                <div className="relative group">
                                    {}
                                    <div
                                        className="absolute -top-3 -left-1 text-6xl font-bold opacity-5 select-none pointer-events-none">
                                        {item.num}
                                    </div>
                                    <div
                                        className="relative h-[200px] p-8 rounded-2xl bg-background/60 backdrop-blur-sm border border-border/50 hover:border-[var(--brand-glow)]/30 shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-400 ease-out overflow-hidden flex flex-col">
                                        {}
                                        <div
                                            className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${item.color} to-transparent opacity-60`} />
                                        <div className="relative z-10 text-center flex flex-col h-full">
                                            <div
                                                className={`w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br ${item.color}/20 to-transparent flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300 shrink-0`}>
                                                <item.icon className="w-7 h-7 text-[var(--brand-glow)]" />
                                            </div>
                                            <h3
                                                className="text-xl font-semibold text-foreground/90 mb-3 tracking-tight shrink-0">{item.title}</h3>
                                            <p className="text-sm text-muted-foreground/70 leading-relaxed flex-1">{item.desc}</p>
                                        </div>
                                    </div>
                                </div>
                            </RevealGroup>)}
                        </div>
                    </div>
                </section>
                {}
                <section id="start" className="py-24 px-6 relative">
                    {}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                        <div
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-gradient-radial from-[var(--brand-glow)]/10 via-transparent to-transparent blur-3xl" />
                    </div>
                    <div className="max-w-2xl mx-auto relative z-10 text-center">
                        <RevealGroup delayBase={0}>
                            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                                <span suppressHydrationWarning className="text-foreground/90">开始</span>
                                <span
                                    className="bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>创作</span>
                            </h2>
                            <p className="text-base text-muted-foreground/70 mb-8">输入你的文章，让 AI 为你生成精美的思维导图</p>
                            {}
                            <div className="flex items-center justify-center mb-8">
                                <div
                                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[var(--brand-start)]/15 to-[var(--brand-end)]/10 border border-[var(--brand-start)]/20">
                                    <div className="w-2 h-2 rounded-full bg-[var(--brand-start)] animate-pulse" />
                                    <span suppressHydrationWarning className="text-[var(--brand-start)] text-sm font-medium">无需登录 · 开箱即用</span>
                                </div>
                            </div>
                            {}
                            <RippleButton
                                ref={bottomCtaRef}
                                onClick={() => router.push(
                                    `/settings${selectedTemplates.length > 0 ? `?templates=${selectedTemplates.join(",")}` : ""}`
                                )}
                                className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] text-white font-semibold text-xl shadow-xl shadow-[var(--brand-start)]/25 hover:shadow-2xl hover:shadow-[var(--brand-start)]/35 hover:scale-105 active:scale-95 transition-all duration-300">
                                {}
                                <div
                                    className="absolute inset-0 bg-gradient-to-r from-[var(--brand-end)] to-[var(--brand-start)] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                {}
                                <div className="absolute inset-0 opacity-30">
                                    <div
                                        className="absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                                </div>
                                {}
                                <div className="relative flex items-center gap-3">
                                    <img 
                                        src="/logo.png" 
                                        alt="梦枕" 
                                        className="w-7 h-7 group-hover:scale-110 transition-transform duration-300 rounded shadow-md" 
                                    />
                                    <span suppressHydrationWarning>免费体验</span>
                                    <ChevronRight
                                        className="w-6 h-6 group-hover:translate-x-1 transition-transform duration-300" />
                                </div>
                            </RippleButton>
                        </RevealGroup>
                    </div>
                </section>
            </main>
            {}
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
                            className="font-bold text-lg bg-gradient-to-r from-[var(--brand-start)] to-[var(--brand-end)] bg-clip-text text-transparent" suppressHydrationWarning>梦枕</span>
                    </div>
                    <p className="text-xs text-muted-foreground">深夜助眠播放器 · PWA渐进式网页应用 · 自定义音频</p>
                </div>
            </footer>
            {}
            <FloatingBar visible={showFloatingBar} selectedTemplates={selectedTemplates} />
        </div>
    );
}
