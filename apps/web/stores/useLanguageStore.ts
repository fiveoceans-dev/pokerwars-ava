import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Language = "en" | "ko" | "ja" | "zh";

interface LanguageState {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: "en",
      setLanguage: (language: Language) => set({ language }),
    }),
    {
      name: "language-storage",
    },
  ),
);

export const languageLabels: Record<Language, string> = {
  en: "ENG",
  ko: "KOR",
  ja: "JPN",
  zh: "CHI",
};
