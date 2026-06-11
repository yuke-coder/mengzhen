"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface ProfileContextValue {
  saving: boolean;
  setSaving: (saving: boolean) => void;
  snapshot: unknown | null;
  setSnapshot: (data: unknown) => void;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<unknown | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  return (
    <ProfileContext.Provider value={{ saving, setSaving, snapshot, setSnapshot, isDirty, setIsDirty }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
