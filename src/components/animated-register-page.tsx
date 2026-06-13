"use client";

import { useState, useEffect, useRef, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, UserPlus, Check, X } from "lucide-react";

interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
}

const Pupil = memo(({
  size = 12, 
  maxDistance = 5,
  pupilColor = "black",
  forceLookX,
  forceLookY
}: PupilProps) => {
  const [pupilPosition, setPupilPosition] = useState({ x: 0, y: 0 });
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      setPupilPosition({ x: forceLookX, y: forceLookY });
      return;
    }
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    const deltaX = mouseX - screenCenterX;
    const deltaY = mouseY - screenCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance * 10);
    const angle = Math.atan2(deltaY, deltaX);
    setPupilPosition({ 
      x: Math.cos(angle) * distance / 10, 
      y: Math.sin(angle) * distance / 10 
    });
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance]);

  return (
    <div
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: 'transform 0.1s ease-out',
      }}
    />
  );
});
Pupil.displayName = 'Pupil';

interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
}

const EyeBall = memo(({
  size = 48, 
  pupilSize = 16, 
  maxDistance = 10,
  eyeColor = "white",
  pupilColor = "black",
  isBlinking = false,
  forceLookX,
  forceLookY
}: EyeBallProps) => {
  const [pupilPosition, setPupilPosition] = useState({ x: 0, y: 0 });
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      setPupilPosition({ x: forceLookX, y: forceLookY });
      return;
    }
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    const deltaX = mouseX - screenCenterX;
    const deltaY = mouseY - screenCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance * 10);
    const angle = Math.atan2(deltaY, deltaX);
    setPupilPosition({ 
      x: Math.cos(angle) * distance / 10, 
      y: Math.sin(angle) * distance / 10 
    });
  }, [mouseX, mouseY, forceLookX, forceLookY, maxDistance]);

  return (
    <div
      className="rounded-full flex items-center justify-center transition-all duration-150"
      style={{
        width: `${size}px`,
        height: isBlinking ? '2px' : `${size}px`,
        backgroundColor: eyeColor,
        overflow: 'hidden',
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}
    </div>
  );
});
EyeBall.displayName = 'EyeBall';

export function AnimatedRegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const [isHappy, setIsHappy] = useState(false);
  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  
  const { register } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Blinking effect for purple character
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsPurpleBlinking(true);
        setTimeout(() => {
          setIsPurpleBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };
    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Blinking effect for black character
  useEffect(() => {
    const getRandomBlinkInterval = () => Math.random() * 4000 + 3000;
    const scheduleBlink = () => {
      const blinkTimeout = setTimeout(() => {
        setIsBlackBlinking(true);
        setTimeout(() => {
          setIsBlackBlinking(false);
          scheduleBlink();
        }, 150);
      }, getRandomBlinkInterval());
      return blinkTimeout;
    };
    const timeout = scheduleBlink();
    return () => clearTimeout(timeout);
  }, []);

  // Looking at each other animation when typing starts
  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => {
        setIsLookingAtEachOther(false);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setIsLookingAtEachOther(false);
    }
  }, [isTyping]);

  // Purple sneaky peeking animation when typing password and it's visible
  useEffect(() => {
    if (password.length > 0 && showPassword) {
      const schedulePeek = () => {
        const peekInterval = setTimeout(() => {
          setIsPurplePeeking(true);
          setTimeout(() => {
            setIsPurplePeeking(false);
          }, 800);
        }, Math.random() * 3000 + 2000);
        return peekInterval;
      };
      const firstPeek = schedulePeek();
      return () => clearTimeout(firstPeek);
    } else {
      setIsPurplePeeking(false);
    }
  }, [password, showPassword, isPurplePeeking]);

  // Happy animation when both passwords match
  useEffect(() => {
    if (confirmPassword.length > 0 && password === confirmPassword) {
      setIsHappy(true);
    } else {
      setIsHappy(false);
    }
  }, [password, confirmPassword]);

  // Calculate character positions based on mouse
  const [positions, setPositions] = useState({
    purple: { faceX: 0, faceY: 0, bodySkew: 0 },
    black: { faceX: 0, faceY: 0, bodySkew: 0 },
    yellow: { faceX: 0, faceY: 0, bodySkew: 0 },
    orange: { faceX: 0, faceY: 0, bodySkew: 0 },
  });

  useEffect(() => {
    const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
      if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 3;
      const deltaX = mouseX - centerX;
      const deltaY = mouseY - centerY;
      const faceX = Math.max(-15, Math.min(15, deltaX / 20));
      const faceY = Math.max(-10, Math.min(10, deltaY / 30));
      const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));
      return { faceX, faceY, bodySkew };
    };

    setPositions({
      purple: calculatePosition(purpleRef),
      black: calculatePosition(blackRef),
      yellow: calculatePosition(yellowRef),
      orange: calculatePosition(orangeRef),
    });
  }, [mouseX, mouseY]);

  const purplePos = positions.purple;
  const blackPos = positions.black;
  const yellowPos = positions.yellow;
  const orangePos = positions.orange;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    
    if (!password) {
      setError('请输入密码');
      return;
    }
    
    if (password.length < 6) {
      setError('密码长度不能少于6个字符');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setIsLoading(true);

    const result = await register(username, password);
    setIsLoading(false);

    if (result.success) {
      router.push('/');
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="relative min-h-screen grid lg:grid-cols-2">
      {/* 渐变动画背景 - 容器内绝对定位，不覆盖导航栏 */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#ee7752] via-[#e73c7e] to-[#23a6d5] bg-[length:400%_400%] animate-gradient" />
      {/* 左侧渐变动画区域 */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white">
        <div className="relative z-20" />

        <div className="relative z-20 flex items-end justify-center h-[500px]">
          {/* Cartoon Characters */}
          <div className="relative" style={{ width: '550px', height: '400px' }}>
            {/* Purple tall rectangle character - Back layer */}
            <div 
              ref={purpleRef}
              className="absolute bottom-0 transition-all duration-700 ease-in-out"
              style={{
                left: '70px',
                width: '180px',
                height: isHappy ? '360px' : (isTyping || (password.length > 0 && !showPassword)) ? '440px' : '400px',
                backgroundColor: isHappy ? '#4CAF50' : '#6C3FF5',
                borderRadius: '10px 10px 0 0',
                zIndex: 1,
                transform: (password.length > 0 && showPassword)
                  ? `skewX(0deg)`
                  : (isTyping || (password.length > 0 && !showPassword))
                    ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px)` 
                    : `skewX(${purplePos.bodySkew || 0}deg)`,
                transformOrigin: 'bottom center',
              }}
            >
              {/* Eyes - Happy curved eyes when both passwords match */}
              <div 
                className="absolute flex gap-8 transition-all duration-700 ease-in-out"
                style={{
                  left: isHappy ? '35px' : (password.length > 0 && showPassword) ? `${20}px` : isLookingAtEachOther ? `${55}px` : `${45 + purplePos.faceX}px`,
                  top: isHappy ? '50px' : (password.length > 0 && showPassword) ? `${35}px` : isLookingAtEachOther ? `${65}px` : `${40 + purplePos.faceY}px`,
                }}
              >
                {isHappy ? (
                  <>
                    <div className="w-[18px] h-[9px] border-b-2 border-[#2D2D2D] rounded-b-full" />
                    <div className="w-[18px] h-[9px] border-b-2 border-[#2D2D2D] rounded-b-full" />
                  </>
                ) : (
                  <>
                    <EyeBall 
                      size={18} 
                      pupilSize={7} 
                      maxDistance={5} 
                      eyeColor="white" 
                      pupilColor="#2D2D2D" 
                      isBlinking={isPurpleBlinking}
                      forceLookX={(password.length > 0 && showPassword) ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
                      forceLookY={(password.length > 0 && showPassword) ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
                    />
                    <EyeBall 
                      size={18} 
                      pupilSize={7} 
                      maxDistance={5} 
                      eyeColor="white" 
                      pupilColor="#2D2D2D" 
                      isBlinking={isPurpleBlinking}
                      forceLookX={(password.length > 0 && showPassword) ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
                      forceLookY={(password.length > 0 && showPassword) ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
                    />
                  </>
                )}
              </div>
              {/* Smile when happy */}
              {isHappy && (
                <div 
                  className="absolute w-16 h-8 border-b-2 border-[#2D2D2D] rounded-b-full"
                  style={{ left: '52px', top: '70px' }}
                />
              )}
            </div>

            {/* Black tall rectangle character - Middle layer */}
            <div 
              ref={blackRef}
              className="absolute bottom-0 transition-all duration-700 ease-in-out"
              style={{
                left: '240px',
                width: '120px',
                height: isHappy ? '280px' : '310px',
                backgroundColor: isHappy ? '#388E3C' : '#2D2D2D',
                borderRadius: '8px 8px 0 0',
                zIndex: 2,
                transform: (password.length > 0 && showPassword)
                  ? `skewX(0deg)`
                  : isLookingAtEachOther
                    ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px)`
                    : (isTyping || (password.length > 0 && !showPassword))
                      ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)` 
                      : `skewX(${blackPos.bodySkew || 0}deg)`,
                transformOrigin: 'bottom center',
              }}
            >
              {/* Eyes */}
              <div 
                className="absolute flex gap-6 transition-all duration-700 ease-in-out"
                style={{
                  left: isHappy ? '27px' : (password.length > 0 && showPassword) ? `${10}px` : isLookingAtEachOther ? `${32}px` : `${26 + blackPos.faceX}px`,
                  top: isHappy ? '35px' : (password.length > 0 && showPassword) ? `${28}px` : isLookingAtEachOther ? `${12}px` : `${32 + blackPos.faceY}px`,
                }}
              >
                {isHappy ? (
                  <>
                    <div className="w-[16px] h-[8px] border-b-2 border-white rounded-b-full" />
                    <div className="w-[16px] h-[8px] border-b-2 border-white rounded-b-full" />
                  </>
                ) : (
                  <>
                    <EyeBall 
                      size={16} 
                      pupilSize={6} 
                      maxDistance={4} 
                      eyeColor="white" 
                      pupilColor="#2D2D2D" 
                      isBlinking={isBlackBlinking}
                      forceLookX={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? 0 : undefined}
                      forceLookY={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? -4 : undefined}
                    />
                    <EyeBall 
                      size={16} 
                      pupilSize={6} 
                      maxDistance={4} 
                      eyeColor="white" 
                      pupilColor="#2D2D2D" 
                      isBlinking={isBlackBlinking}
                      forceLookX={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? 0 : undefined}
                      forceLookY={(password.length > 0 && showPassword) ? -4 : isLookingAtEachOther ? -4 : undefined}
                    />
                  </>
                )}
              </div>
              {/* Smile when happy */}
              {isHappy && (
                <div 
                  className="absolute w-12 h-6 border-b-2 border-white rounded-b-full"
                  style={{ left: '34px', top: '50px' }}
                />
              )}
            </div>

            {/* Orange semi-circle character - Front left */}
            <div 
              ref={orangeRef}
              className="absolute bottom-0 transition-all duration-700 ease-in-out"
              style={{
                left: '0px',
                width: '240px',
                height: isHappy ? '180px' : '200px',
                zIndex: 3,
                backgroundColor: isHappy ? '#FFB74D' : '#FF9B6B',
                borderRadius: '120px 120px 0 0',
                transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : `skewX(${orangePos.bodySkew || 0}deg)`,
                transformOrigin: 'bottom center',
              }}
            >
              {/* Eyes - just pupils, no white */}
              <div 
                className="absolute flex gap-8 transition-all duration-200 ease-out"
                style={{
                  left: isHappy ? '60px' : (password.length > 0 && showPassword) ? `${50}px` : `${82 + (orangePos.faceX || 0)}px`,
                  top: isHappy ? '75px' : (password.length > 0 && showPassword) ? `${85}px` : `${90 + (orangePos.faceY || 0)}px`,
                }}
              >
                {isHappy ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-[#2D2D2D]" />
                    <div className="w-3 h-3 rounded-full bg-[#2D2D2D]" />
                  </>
                ) : (
                  <>
                    <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                    <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                  </>
                )}
              </div>
              {/* Smile when happy */}
              {isHappy && (
                <div 
                  className="absolute w-14 h-7 border-b-2 border-[#2D2D2D] rounded-b-full"
                  style={{ left: '73px', top: '100px' }}
                />
              )}
            </div>

            {/* Yellow tall rectangle character - Front right */}
            <div 
              ref={yellowRef}
              className="absolute bottom-0 transition-all duration-700 ease-in-out"
              style={{
                left: '310px',
                width: '140px',
                height: isHappy ? '200px' : '230px',
                backgroundColor: isHappy ? '#FDD835' : '#E8D754',
                borderRadius: '70px 70px 0 0',
                zIndex: 4,
                transform: (password.length > 0 && showPassword) ? `skewX(0deg)` : `skewX(${yellowPos.bodySkew || 0}deg)`,
                transformOrigin: 'bottom center',
              }}
            >
              {/* Eyes - just pupils, no white */}
              <div 
                className="absolute flex gap-6 transition-all duration-200 ease-out"
                style={{
                  left: isHappy ? '30px' : (password.length > 0 && showPassword) ? `${20}px` : `${52 + (yellowPos.faceX || 0)}px`,
                  top: isHappy ? '30px' : (password.length > 0 && showPassword) ? '35px' : `${40 + (yellowPos.faceY || 0)}px`,
                }}
              >
                {isHappy ? (
                  <>
                    <div className="w-3 h-3 rounded-full bg-[#2D2D2D]" />
                    <div className="w-3 h-3 rounded-full bg-[#2D2D2D]" />
                  </>
                ) : (
                  <>
                    <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                    <Pupil size={12} maxDistance={5} pupilColor="#2D2D2D" forceLookX={(password.length > 0 && showPassword) ? -5 : undefined} forceLookY={(password.length > 0 && showPassword) ? -4 : undefined} />
                  </>
                )}
              </div>
              {/* Mouth - changes based on state */}
              <div 
                className="absolute transition-all duration-200 ease-out"
                style={{
                  left: isHappy ? '30px' : (password.length > 0 && showPassword) ? `${10}px` : `${40 + (yellowPos.faceX || 0)}px`,
                  top: isHappy ? '75px' : (password.length > 0 && showPassword) ? '88px' : `${88 + (yellowPos.faceY || 0)}px`,
                }}
              >
                {isHappy ? (
                  <div className="w-14 h-7 border-b-2 border-[#2D2D2D] rounded-b-full" />
                ) : (
                  <div className="w-20 h-[4px] bg-[#2D2D2D] rounded-full" />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-20 text-sm text-white/60">
          <p>免费注册，开启智能思维导图之旅</p>
        </div>

        {/* Decorative elements */}
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
        <div className="absolute top-1/4 right-1/4 size-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 size-96 bg-white/5 rounded-full blur-3xl" />
      </div>

     {/* Right Register Section */}
      <div className="relative z-10 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-[420px] bg-black/10 backdrop-blur-sm rounded-2xl p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold tracking-tight mb-2">创建账户</h1>
            <p className="text-muted-foreground text-sm">注册后即可开始创作脑图</p>
          </div>

          {/* Register Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">用户名</label>
              <input
                id="username"
                type="text"
                placeholder="请输入用户名"
                value={username}
                autoComplete="off"
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                required
                disabled={isLoading}
                className="h-12 w-full px-4 rounded-xl bg-transparent border border-white/30 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-white placeholder:text-white/50"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">密码</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="请输入密码（至少6位）"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-12 w-full px-4 pr-10 rounded-xl bg-transparent border border-white/30 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-white placeholder:text-white/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="size-5" />
                  ) : (
                    <Eye className="size-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">确认密码</label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="请再次输入密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-12 w-full px-4 pr-10 rounded-xl bg-transparent border border-white/30 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/20 transition-all text-white placeholder:text-white/50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-5" />
                  ) : (
                    <Eye className="size-5" />
                  )}
                </button>
              </div>
              {/* Password match indicator */}
              {confirmPassword.length > 0 && (
                <div className={cn(
                  "flex items-center gap-2 text-xs mt-1 transition-all",
                  password === confirmPassword ? "text-green-500" : "text-red-400"
                )}>
                  {password === confirmPassword ? (
                    <>
                      <Check className="size-3" />
                      <span>密码匹配</span>
                    </>
                  ) : (
                    <>
                      <X className="size-3" />
                      <span>密码不匹配</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 text-sm text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl">
                {error}
              </div>
            )}

            <button 
              type="submit" 
              className="w-full h-12 text-base font-medium rounded-xl bg-gradient-to-r from-[var(--brand-start)] via-[var(--brand-mid)] to-[var(--brand-end)] text-white shadow-lg shadow-[var(--brand-start)]/25 hover:-translate-y-1 hover:scale-105 hover:shadow-2xl hover:shadow-[var(--brand-start)]/40 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <UserPlus className="size-5" />
                  <span>注册</span>
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="text-center text-sm text-muted-foreground mt-8">
            已有账户？{" "}
            <Link href="/auth/login" className="text-foreground font-medium hover:text-[var(--brand-start)] transition-colors">
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
