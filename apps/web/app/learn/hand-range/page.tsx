"use client";

import { useLanguageStore } from "~~/stores/useLanguageStore";
import { learnTranslations } from "~~/constants/learnTranslations";

export default function HandRangePage() {
  const { language } = useLanguageStore();
  const t = learnTranslations[language].hand_range;
  const lt = learnTranslations[language];

  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">{t.title}</h1>
          <a href="/learn" className="tbtn text-xs font-semibold">
            {lt.back_to_learn}
          </a>
        </div>
        <div className="rule" aria-hidden="true" />
        <div className="space-y-8 text-sm text-white/70">
          {(t.sections as any[]).map((section) => (
            <section key={section.title} className="space-y-2">
              <h2 className="text-lg text-white">{section.title}</h2>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
