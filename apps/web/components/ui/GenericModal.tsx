"use client";

import { useEffect, type ReactNode } from "react";

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

  if (!open) {
    return null;
  }

  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4 py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={`relative w-full max-w-md p-6 mx-auto ${className ?? ""}`}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );
}
