"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface GenericModalProps {
  modalId: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export default function GenericModal({
  modalId,
  open,
  onClose,
  children,
  className,
}: GenericModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) {
    return null;
  }

  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      className="fixed inset-0 z-[9999] grid place-items-center bg-black/80 backdrop-blur-sm px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`relative w-full max-w-md p-6 mx-auto rounded-[32px] border border-white/10 bg-[#1e1e1e] text-white shadow-[0_20px_60px_rgba(0,0,0,0.8)] ${className ?? ""}`}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
