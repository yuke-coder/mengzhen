"use client";

import dynamic from "next/dynamic";

const DynamicBackground = dynamic(() => import("@/components/dynamic-background"), {
  ssr: false,
  loading: () => <div className="fixed inset-0 z-0" />,
});

const RippleEffect = dynamic(() => import("@/components/RippleEffect"), {
  ssr: false,
});

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 overflow-hidden z-0 pointer-events-none">
        <DynamicBackground />
      </div>
      {children}
      <RippleEffect />
    </>
  );
}
