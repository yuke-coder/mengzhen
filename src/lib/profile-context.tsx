"use client";

import { createContext, useContext, useState, ReactNode } from "react";

interface ProfileContextValue {
  saving: boolean;
  setSaving: (saving: boolean) => void;
  submitHandler: (() => void) | null;
  setSubmitHandler: (handler: (() => void) | null) => void;
  cancelHandler: (() => void) | null;
  setCancelHandler: (handler: (() => void) | null) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [saving, setSaving] = useState(false);
  const [submitHandler, setSubmitHandler] = useState<(() => void) | null>(null);
  const [cancelHandler, setCancelHandler] = useState<(() => void) | null>(null);

  return (
    <ProfileContext.Provider value={{ saving, setSaving, submitHandler, setSubmitHandler, cancelHandler, setCancelHandler }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
