"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { LocationCascader, planetValueToText, planetTextToValue, countryValueToText, countryTextToValue } from "@/components/location-cascader";
import { useProfile } from "@/lib/profile-context";
import { useNonBlockingToast } from "@/components/non-blocking-toast";
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
  const { saving, setSaving, snapshot, setSnapshot, isDirty, setIsDirty } = useProfile();
  const { showToast, dismissAll } = useNonBlockingToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);
  const originalDataRef = useRef<ProfileFormData | null>(null); // 保存原始数据用于 dirty 检测
  const hasUndoneRef = useRef(false); // 撤销标记，用于阻止跳转
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [formData, setFormData] = useState<ProfileFormData>({
    username: "",
    nickname: "",
    gender: "",
    birthday: "",
    location: { planet: "", country: "", province: "", city: "", district: "" },
    signature: "",
    bio: "",
  });

  // 深度比较两个表单数据是否相同
  const isFormDirty = useCallback((a: ProfileFormData | null, b: ProfileFormData): boolean => {
    if (!a) return false;
    return JSON.stringify(a) !== JSON.stringify(b);
  }, []);

  // 用户编辑时自动关闭弹窗并更新 dirty 状态
  const updateFormData = useCallback((value: ProfileFormData | ((prev: ProfileFormData) => ProfileFormData)) => {
    dismissAll();
    if (typeof value === 'function') {
      const updater = value as (prev: ProfileFormData) => ProfileFormData;
      setFormData((prev) => {
        const next = updater(prev);
        setIsDirty(isFormDirty(originalDataRef.current, next));
        return next;
      });
    } else {
      setIsDirty(isFormDirty(originalDataRef.current, value));
      setFormData(value);
    }
  }, [dismissAll, setIsDirty, isFormDirty]);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [loading, user, router]);

  // 加载个人资料
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/profile", {
          credentials: "include",
        });
        const data = await res.json();
        if (data.success) {
          // 解析 location 字符串为对象
          const locationObj: LocationValue = { planet: "", country: "", province: "", city: "", district: "" };
          if (data.profile.location) {
            const parts = data.profile.location.split('/');
            if (parts.length >= 1) locationObj.planet = planetTextToValue(parts[0]) || parts[0];
            if (parts.length >= 2) locationObj.country = countryTextToValue(parts[1]) || parts[1];
            if (parts.length >= 3) locationObj.province = parts[2] || "";
            if (parts.length >= 4) locationObj.city = parts[3] || "";
            if (parts.length >= 5) locationObj.district = parts[4] || "";
          }
          const initialData: ProfileFormData = {
            username: data.profile.username || "",
            nickname: data.profile.nickname || data.profile.username || "",
            gender: data.profile.gender || "",
            birthday: data.profile.birthday || "",
            location: locationObj,
            signature: data.profile.signature || "",
            bio: data.profile.bio || "",
          };
          originalDataRef.current = initialData; // 保存原始数据
          setFormData(initialData);
          setIsDirty(false); // 初始状态没有编辑痕迹
        }
      } catch (error) {
        console.error("加载资料失败:", error);
      }
    };

    if (user) {
      loadProfile();
    }
  }, [user, setIsDirty]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // 验证文件类型
    if (!file.type.startsWith("image/")) {
      showToast({ message: "请选择图片文件" });
      return;
    }

    // 验证文件大小（最大 5MB）
    if (file.size > 5 * 1024 * 1024) {
      showToast({ message: "图片大小不能超过 5MB" });
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
        // 使用带时间戳的 URL 防止缓存
        const timestamp = Date.now();
        const newAvatarUrl = `${data.avatar_url}?t=${timestamp}`;
        updateUser({ avatar_url: newAvatarUrl });
        showToast({ message: "头像上传成功" });
      } else {
        showToast({ message: data.error || "上传失败" });
      }
    } catch {
      showToast({ message: "上传失败，请重试" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const defaultAvatars = {
    male: "/avatars/default-male.png",
    female: "/avatars/default-female.png",
    secret: "/avatars/default-secret.png",
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
        showToast({ message: "头像已重置" });
      }
    } catch {
      showToast({ message: "重置失败" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user) return;

    // 保存编辑前数据快照（用于撤销）
    const currentSnapshot = JSON.parse(JSON.stringify(formData));
    setSnapshot(currentSnapshot);
    hasUndoneRef.current = false; // 重置撤销标记

    setSaving(true);
    try {
      // 将 location 对象转换为字符串格式
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
        // 更新原始数据基准为刚保存的新状态
        const newOriginal: ProfileFormData = {
          username: data.profile.username || "",
          nickname: data.profile.nickname || "",
          gender: data.profile.gender || "",
          birthday: data.profile.birthday || "",
          location: formData.location,
          signature: data.profile.signature || "",
          bio: data.profile.bio || "",
        };
        originalDataRef.current = newOriginal;
        setIsDirty(false);

        // 先完成数据更新
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

        // 注册撤销操作
        const undoAction = () => {
          hasUndoneRef.current = true; // 标记：已撤销，不跳转
          const undoLoc = currentSnapshot.location;
          const undoSubmitData = {
            ...currentSnapshot,
            location: undoLoc.planet || undoLoc.country || undoLoc.province || undoLoc.city || undoLoc.district
              ? [undoLoc.planet ? planetValueToText(undoLoc.planet) : '', undoLoc.country ? countryValueToText(undoLoc.country) : '', undoLoc.province, undoLoc.city, undoLoc.district].filter(Boolean).join('/')
              : undefined,
          };
          fetch("/api/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(undoSubmitData),
          }).then((undoRes) => undoRes.json()).then((undoData) => {
            if (undoData.success) {
              // 撤销后，原始数据基准也回滚
              originalDataRef.current = currentSnapshot;
              setFormData(currentSnapshot);
              setIsDirty(false);
              updateUser({
                username: undoData.profile.username,
                nickname: undoData.profile.nickname,
                avatar_url: undoData.profile.avatar_url,
                gender: undoData.profile.gender || null,
                birthday: undoData.profile.birthday || null,
                location: undoData.profile.location || null,
                signature: undoData.profile.signature || null,
                bio: undoData.profile.bio || null,
              });
              showToast({ message: "已撤销修改" });
            }
          });
        };

        // 显示非阻塞弹窗，2秒后自动跳转，撤销则留在页面
        showToast({
          message: data.message || "资料更新成功",
          undoAction,
          undoLabel: "撤销",
          onAutoClose: () => {
            if (!hasUndoneRef.current) {
              router.back();
            }
          },
        });
      } else {
        showToast({ message: data.error || "更新失败" });
      }
    } catch {
      showToast({ message: "更新失败，请重试" });
    } finally {
      setSaving(false);
    }
  };

  const startEditUsername = () => {
    setEditingUsername(true);
    setTimeout(() => usernameInputRef.current?.focus(), 0);
  };

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
        <form id="profile-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar & Gender Section */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <div className="flex items-center gap-6">
              {/* Avatar Preview - Clickable */}
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
                {/* Hover Overlay */}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Gender Selection */}
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
                      onClick={() => updateFormData({ ...formData, gender: option.value as ProfileFormData["gender"] })}
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
                    onChange={(e) => updateFormData({ ...formData, username: e.target.value })}
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
                      updateFormData((prev) => ({ ...prev, username: user.username || "" }));
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

          {/* Nickname (Unified with username, deprecated) */}
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
              onChange={(e) => updateFormData({ ...formData, nickname: e.target.value })}
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
                    // 修复日期显示偏移问题：减一天
                    const displayDate = new Date(formData.birthday);
                    displayDate.setDate(displayDate.getDate() - 1);
                    return displayDate;
                  })()}
                  onSelect={(date) => {
                    if (date) {
                      // 修复日期偏移问题：加一天
                      const correctedDate = new Date(date);
                      correctedDate.setDate(correctedDate.getDate() + 1);
                      updateFormData({ ...formData, birthday: correctedDate.toISOString().split("T")[0] });
                    } else {
                      updateFormData({ ...formData, birthday: "" });
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
              onChange={(newLocation) => updateFormData({ ...formData, location: newLocation })}
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
              onChange={(e) => updateFormData({ ...formData, signature: e.target.value })}
              maxLength={100}
              placeholder="一句话介绍自己"
              className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 glass"
              style={{
                
                borderColor: "var(--border)",
                color: "var(--foreground)",
                "--tw-ring-color": "var(--brand-start)",
              } as React.CSSProperties}
            />
          </div>

          {/* Bio */}
          <div className="p-6 rounded-xl border glass border-border/50">
            <label className="flex items-center gap-3 text-sm font-medium mb-3" style={{ color: "var(--muted-foreground)" }}>
              <FileText className="w-4 h-4" />
              个人简介
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => updateFormData({ ...formData, bio: e.target.value })}
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
