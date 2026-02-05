import type { ReactNode } from "react";
import clsx from "clsx";

interface TableFeltProps {
  className?: string;
  children?: ReactNode;
}

export default function TableFelt({ className, children }: TableFeltProps) {
  return (
    <div className={clsx("relative w-full h-full", className)}>
      {/* Table Felt/Shape */}
      <div
        className="absolute inset-0 rounded-[180px] bg-[#35654d] border-[12px] border-[#1a1d21] shadow-[inset_0_0_100px_rgba(0,0,0,0.6)]"
        style={{
          background: "radial-gradient(ellipse at center, #35654d 0%, #244635 100%)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5), inset 0 0 80px rgba(0,0,0,0.8)",
        }}
      >
        {/* Content Layer (Community Cards, Pot, etc.) */}
        {children}
      </div>
    </div>
  );
}
