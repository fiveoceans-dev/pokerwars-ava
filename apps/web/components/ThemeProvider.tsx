"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";

export const ThemeProvider = ({ children, ...props }: ThemeProviderProps) => (
  <NextThemesProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} {...props}>
    {children}
  </NextThemesProvider>
);
