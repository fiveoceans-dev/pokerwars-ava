"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx, type ClassValue } from "clsx";

function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface ModalProps {
  modalId: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Core Modal Window component.
 * Provides the backdrop, centering, and the main container.
 */
export function Modal({
  modalId,
  open,
  onClose,
  children,
  className,
}: ModalProps) {
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
        className={cn(
          "relative w-full max-w-md p-6 mx-auto rounded-[32px] border border-white/10 bg-[#1e1e1e] text-white shadow-[0_20px_60px_rgba(0,0,0,0.8)]",
          className
        )}
        onClick={handleContentClick}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

/**
 * Modal Header label (e.g., "BUY IN", "CONFIRM").
 */
export function ModalLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] uppercase tracking-[0.4em] text-white/50 mb-4", className)}>
      {children}
    </div>
  );
}

/**
 * Modal Title section.
 */
export function ModalHeader({ 
  title, 
  subtitle, 
  className 
}: { 
  title: ReactNode; 
  subtitle?: ReactNode; 
  className?: string 
}) {
  return (
    <div className={cn("space-y-1 mb-4", className)}>
      <p className="text-white font-medium text-base">{title}</p>
      {subtitle && (
        <p className="text-xs text-white/50 uppercase tracking-wide">
          {subtitle}
        </p>
      )}
    </div>
  );
}

/**
 * Horizontal separator.
 */
export function ModalRule() {
  return <div className="rule" aria-hidden="true" />;
}

/**
 * Modal Footer for buttons.
 */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-end gap-2 text-xs pt-2", className)}>
      {children}
    </div>
  );
}

/**
 * Main content wrapper with default spacing.
 */
export function ModalContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("space-y-4 text-sm text-white/80", className)}>{children}</div>;
}
