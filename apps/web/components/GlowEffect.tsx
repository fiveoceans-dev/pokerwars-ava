import React from "react";

interface GlowEffectProps {
  isActive: boolean;
  children: React.ReactNode;
}

export function GlowEffect({ isActive, children }: GlowEffectProps) {
  if (!isActive) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Original content */}
      <div className="relative z-10">
        {children}
      </div>
      
      {/* Neon green glow effect */}
      <div className="absolute inset-0 rounded shadow-neon animate-pulse pointer-events-none" />
    </div>
  );
}