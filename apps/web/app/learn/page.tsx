"use client";

import { useLanguageStore } from "~~/stores/useLanguageStore";
import { learnTranslations } from "~~/constants/learnTranslations";

export default function LearnPage() {
  const { language } = useLanguageStore();
  const t = learnTranslations[language];

  const lessons = [
    t.lesson_01,
    t.lesson_02,
    t.lesson_03,
    t.lesson_04,
    t.lesson_05,
  ];

  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">{t.title}</h1>
        </div>
        <div className="flex flex-col gap-10 md:flex-row">
          <nav className="w-full md:w-56 flex flex-col gap-2 text-sm">
            <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">{t.lessons}</div>
            {lessons.map((lesson) => (
              <a key={lesson.id} href={`#${lesson.anchor}`} className="tbtn text-xs font-semibold">
                {lesson.title}
              </a>
            ))}
          </nav>

          <div className="flex-1 space-y-10 text-sm text-white/70">
            {lessons.map((lesson, idx) => (
              <article key={lesson.id} id={lesson.anchor} className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                  Lesson {String(idx + 1).padStart(2, "0")}
                </div>
                <h2 className="text-xl text-white">{lesson.title}</h2>
                <p>
                  {lesson.description}
                </p>
                <a href={lesson.href} className="tbtn text-xs font-semibold">
                  {t.open_article}
                </a>
                {idx < lessons.length - 1 && <div className="rule" aria-hidden="true" />}
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

