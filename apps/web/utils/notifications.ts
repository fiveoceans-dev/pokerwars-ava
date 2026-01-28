"use client";

import { toast, type ToastOptions } from "react-hot-toast";

const baseOptions: ToastOptions = {
  position: "bottom-right",
  duration: 5000,
  style: {
    background: "#0b0b0b",
    color: "#ededed",
    borderRadius: "0.25rem",
    border: "1px solid #2a2a2a",
    boxShadow: "none",
    padding: "10px 12px",
    fontSize: "11px",
    lineHeight: "1.4",
    width: "260px",
    minHeight: "56px",
  },
  iconTheme: {
    primary: "#ef4444",
    secondary: "#0b0b0b",
  },
};

const recentErrors = new Map<string, number>();

export function notifyError(message: string, options?: ToastOptions) {
  const trimmed = message.trim();
  if (trimmed) {
    const now = Date.now();
    const last = recentErrors.get(trimmed) ?? 0;
    if (now - last < 1500) {
      return;
    }
    recentErrors.set(trimmed, now);
  }
  toast.error(message, {
    ...baseOptions,
    style: {
      ...baseOptions.style,
      border: "1px solid #ff4d4d",
    },
    iconTheme: {
      primary: "#ff4d4d",
      secondary: "#0b0b0b",
    },
    ...options,
  });
}

export function notifySuccess(message: string, options?: ToastOptions) {
  toast.success(message, {
    ...baseOptions,
    style: {
      ...baseOptions.style,
      border: "1px solid #10b981",
    },
    iconTheme: {
      primary: "#10b981",
      secondary: "#1f2937",
    },
    ...options,
  });
}
