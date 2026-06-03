"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { LocationCascader, planetValueToText, planetTextToValue, countryValueToText, countryTextToValue } from "@/components/location-cascader";
import { useProfile } from "@/lib/profile-context";
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button";
import {
  Camera,
  User,
  Mail,
  Calendar as CalendarIcon,
  MapPin,
  FileText,
  Heart,
  Loader2,
  Edit3,
  AlertCircle,
} from "lucide-react";

interface LocationValue {
  planet?: string;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
}

interface ProfileFormData {
  username: string;
  nickname: string;
  gender: "male" | "female" | "secret" | "";
  birthday: string;
  location: LocationValue;
  signature: string;
  bio: string;
}

export default function ProfilePage() {
  const { user, loading, updateUser } = useAuth();
  const router = useRouter();
  const { saving, setSaving, setSubmitHandler, setCancelHandler } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  // 记录进入 profile 之前的路径，作为 router.back() 失效时的兜底跳转目标
  const previousPathRef = useRef<string>("/");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const ref = document.referrer;
      try {
        if (ref) {
          const u = new URL(ref);
          if (u.origin === window.location.origin && !u.pathname.startsWith("/profile")) {
            previousPathRef.current = u.pathname + u.search;
          }
        }
      } catch {
        // ignore
      }
    }
  }, []);
  const [formData, setFormData] = useState<ProfileFormData>({
    username: "",
    nickname: "",
    gender: "",
    birthday: "",
    location: { planet: "", country: "", province: "", city: "", district: "" },
    signature: "",
    bio: "",
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/profile", {
          credentials: "include",
        });
        const data = await res.json();
        if (data.success) {
          const locationObj: LocationValue = { planet: "", country: "", province: "", city: "", district: "" };
          if (data.profile.location) {
            const parts = data.profile.location.split('/');
            if (parts.length >= 1) locationObj.planet = planetTextToValue(parts[0]) || parts[0];
            if (parts.length >= 2) locationObj.country = countryTextToValue(parts[1]) || parts[1];
            if (parts.length >= 3) locationObj.province = parts[2] || "";
            if (parts.length >= 4) locationObj.city = parts[3] || "";
            if (parts.length >= 5) locationObj.district = parts[4] || "";
          }
          setFormData({
            username: data.profile.username || "",
            nickname: data.profile.nickname || data.profile.username || "",
            gender: data.profile.gender || "",
            birthday: data.profile.birthday || "",
            location: locationObj,
            signature: data.profile.signature || "",
            bio: data.profile.bio || "",
          });
        }
      } catch (error) {
        console.error("加载资料失败:", error);
      }
    };

    if (user) {
      loadProfile();
    }
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      setMessage({ type: "error", text: "请选择图片文件" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: "error", text: "图片大小不能超过 5MB" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const avatarData = new FormData();
      avatarData.append("avatar", file);

      const res = await fetch("/api/avatar", {
        method: "POST",
        credentials: "include",
        body: avatarData,
      });

      const data = await res.json();
      if (data.success) {
        const timestamp = Date.now();
        const newAvatarUrl = `${data.avatar_url}?t=${timestamp}`;
        updateUser({ avatar_url: newAvatarUrl });
        setMessage({ type: "success", text: "头像上传成功" });
      } else {
        setMessage({ type: "error", text: data.error || "上传失败" });
      }
    } catch {
      setMessage({ type: "error", text: "上传失败，请重试" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const defaultAvatars = {
    male: "/avatars/default-male.png",
    female: "/avatars/default-female.png",
    secret: "/avatars/default.png",
  };

  const handleResetAvatar = async () => {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const currentGender = formData.gender || "secret";
      const defaultAvatarUrl = defaultAvatars[currentGender as keyof typeof defaultAvatars];

      const res = await fetch(`/api/avatar?gender=${currentGender}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        updateUser({ avatar_url: defaultAvatarUrl });
        setMessage({ type: "success", text: "头像已重置" });
      }
    } catch {
      setMessage({ type: "error", text: "重置失败" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) return;

    setSaving(true);
    setMessage(null);
    try {
      const loc = formData.location;
      const submitData = {
        ...formData,
        location: loc.planet || loc.country || loc.province || loc.city || loc.district
          ? [loc.planet ? planetValueToText(loc.planet) : '', loc.country ? countryValueToText(loc.country) : '', loc.province, loc.city, loc.district].filter(Boolean).join('/')
          : undefined,
      };
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(submitData),
      });

      const data = await res.json();
      if (data.success) {
        updateUser({
          username: data.profile.username,
          nickname: data.profile.nickname,
          avatar_url: data.profile.avatar_url,
          gender: data.profile.gender || null,
          birthday: data.profile.birthday || null,
          location: data.profile.location || null,
          signature: data.profile.signature || null,
          bio: data.profile.bio || null,
        });
        setFormData((prev) => ({
          ...prev,
          username: data.profile.username,
          nickname: data.profile.nickname,
        }));
        setEditingUsername(false);
        setMessage({ type: "success", text: data.message || "资料更新成功" });
        setTimeout(() => {
          if (window.location.hostname.includes('preview') || window.location.hostname.includes('dev.coze')) {
            router.push('/');
          } else {
            router.back();
          }
        }, 800);
      } else {
        setMessage({ type: "error", text: data.error || "更新失败" });
      }
    } catch {
      setMessage({ type: "error", text: "更新失败，请重试" });
    } finally {
      setSaving(false);
    }
  };

  const navigateBack = useCallback(() => {
    if (typeof window === "undefined") return;
    const fallback = previousPathRef.current || "/";
    // 在 preview / dev.coze 域名下直接回到首页
    if (
      window.location.hostname.includes("preview") ||
      window.location.hostname.includes("dev.coze")
    ) {
      router.push("/");
      return;
    }
    // 历史栈里存在上一页且不是当前页时才用 back，否则用兜底路径
    if (window.history.length > 1 && document.referrer && !document.referrer.endsWith("/profile")) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router]);

  const startEditUsername = () => {
    setEditingUsername(true);
    setTimeout(() => usernameInputRef.current?.focus(), 0);
  };

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  const handleCancelRef = useRef(() => router.back());
  handleCancelRef.current = () => router.back();

  useEffect(() => {
    const stableSubmit = () => { handleSubmitRef.current(); };
    const stableCancel = () => { handleCancelRef.current(); };
    setSubmitHandler(() => stableSubmit);
    setCancelHandler(() => stableCancel);
    return () => {
      setSubmitHandler(() => null);
      setCancelHandler(() => null);
    };
  }, []);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand-start)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {message && (
          <div
            className="mb-6 p-4 rounded-lg border flex items-center gap-3"
            style={{
              background: message.type === "success" ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
              borderColor: message.type === "success" ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)",
              color: message.type === "success" ? "#22c55e" : "#ef4444",
            }}
          >
            {message.type === "error" ? <AlertCircle className="w-5 h-5 flex-shrink-0" /> : null}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar & Gender Section */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <div className="flex items-center gap-6">
              <div
                className="relative cursor-pointer group shrink-0"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 transition-all group-hover:border-[var(--brand-end)]" style={{ borderColor: "var(--brand-start)" }}>
                  {user.avatar_url ? (
                    <img src={`${user.avatar_url}${user.avatar_url.includes('?') ? '&' : '?'}t=${Date.now()}`} alt="头像" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center glass">
                      <User className="w-12 h-12" style={{ color: "var(--muted-foreground)" }} />
                    </div>
                  )}
                </div>
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.5)" }}>
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              </div>

              <div className="flex-1">
                <label className="flex items-center gap-2 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
                  <Heart className="w-4 h-4" />
                  性别
                </label>
                <div className="flex gap-3">
                  {[
                    { value: "male", label: "男", emoji: "♂" },
                    { value: "female", label: "女", emoji: "♀" },
                    { value: "secret", label: "保密", emoji: "🔒" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, gender: option.value as ProfileFormData["gender"] })}
                      className="flex-1 py-2.5 px-4 rounded-lg border font-medium transition-all"
                      style={{
                        background: formData.gender === option.value ? "var(--brand-start)" : "transparent",
                        borderColor: formData.gender === option.value ? "var(--brand-start)" : "var(--border)",
                        color: formData.gender === option.value ? "white" : "var(--foreground)",
                      }}
                    >
                      {option.emoji} {option.label}
                    </button>
                  ))}
                </div>
                {user.avatar_url && (
                  <button
                    type="button"
                    onClick={handleResetAvatar}
                    disabled={uploadingAvatar}
                    className="mt-3 px-4 py-2 rounded-lg font-medium border transition-colors hover:bg-[var(--muted)] text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
                  >
                    重置默认头像
                  </button>
                )}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>

          {/* Username Section */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <label className="flex items-center gap-3 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              <Mail className="w-4 h-4" />
              用户名
            </label>

            {editingUsername ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    ref={usernameInputRef}
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="输入用户名"
                    className="flex-1 px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 glass"
                    style={{
                      borderColor: "var(--brand-start)",
                      color: "var(--foreground)",
                      "--tw-ring-color": "var(--brand-start)",
                    } as React.CSSProperties}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUsername(false);
                      setFormData((prev) => ({ ...prev, username: user.username || "" }));
                    }}
                    className="px-4 py-3 rounded-lg border font-medium transition-colors hover:bg-[var(--muted)]"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="px-4 py-3 rounded-lg glass" style={{ color: "var(--foreground)" }}>
                  {user.username}
                </div>
                <button
                  type="button"
                  onClick={startEditUsername}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium border transition-colors hover:bg-[var(--muted)]"
                  style={{
                    borderColor: "var(--brand-start)",
                    color: "var(--brand-start)",
                  }}
                >
                  <Edit3 className="w-4 h-4" />
                  修改
                </button>
              </div>
            )}

            <p className="text-xs mt-3" style={{ color: "var(--muted-foreground)" }}>
              用户名用于登录，可随时修改
            </p>
          </div>

          {/* Nickname */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <label className="flex items-center gap-3 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              <User className="w-4 h-4" />
              显示名称
              <span className="text-xs px-2 py-0.5 rounded glass" style={{ color: "var(--muted-foreground)" }}>
                选填
              </span>
            </label>
            <input
              type="text"
              value={formData.nickname}
              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
              maxLength={30}
              placeholder="不填则显示用户名"
              className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 glass"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                "--tw-ring-color": "var(--brand-start)",
              } as React.CSSProperties}
            />
            <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
              在个人页面和社区中显示的名称，不影响登录
            </p>
          </div>

          {/* Birthday */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <label className="flex items-center gap-3 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              <CalendarIcon className="w-4 h-4" />
              生日
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal px-4 py-3 rounded-lg",
                    !formData.birthday && "text-muted-foreground"
                  )}
                  style={{ borderColor: "var(--border)", color: formData.birthday ? "var(--foreground)" : "var(--muted-foreground)" }}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formData.birthday ? format(new Date(formData.birthday), "yyyy-MM-dd") : <span>选择生日</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={(() => {
                    if (!formData.birthday) return undefined;
                    const displayDate = new Date(formData.birthday);
                    displayDate.setDate(displayDate.getDate() - 1);
                    return displayDate;
                  })()}
                  onSelect={(date) => {
                    if (date) {
                      const correctedDate = new Date(date);
                      correctedDate.setDate(correctedDate.getDate() + 1);
                      setFormData({ ...formData, birthday: correctedDate.toISOString().split("T")[0] });
                    } else {
                      setFormData({ ...formData, birthday: "" });
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Location */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <label className="flex items-center gap-3 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              <MapPin className="w-4 h-4" />
              所在地
            </label>
            <LocationCascader
              value={formData.location}
              onChange={(newLocation) => setFormData({ ...formData, location: newLocation })}
            />
          </div>

          {/* Signature */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <label className="flex items-center gap-3 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              <FileText className="w-4 h-4" />
              个性签名
            </label>
            <input
              type="text"
              value={formData.signature}
              onChange={(e) => setFormData({ ...formData, signature: e.target.value })}
              maxLength={100}
              placeholder="一句话介绍自己"
              className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 glass"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                "--tw-ring-color": "var(--brand-start)",
              } as React.CSSProperties}
            />
            <p className="text-xs mt-2 text-right" style={{ color: "var(--muted-foreground)" }}>
              {formData.signature.length}/100
            </p>
          </div>

          {/* Bio */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <label className="flex items-center gap-3 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              <FileText className="w-4 h-4" />
              个人简介
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              maxLength={500}
              rows={4}
              placeholder="详细介绍一下自己..."
              className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 resize-none glass"
              style={{
                borderColor: "var(--border)",
                color: "var(--foreground)",
                "--tw-ring-color": "var(--brand-start)",
              } as React.CSSProperties}
            />
            <p className="text-xs mt-2 text-right" style={{ color: "var(--muted-foreground)" }}>
              {formData.bio.length}/500
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
