"use client";

import { useLanguageStore } from "~~/stores/useLanguageStore";
import { learnTranslations } from "~~/constants/learnTranslations";

export default function LearnPage() {
  const { language } = useLanguageStore();
  const t = learnTranslations[language];

  const lessons = [
    t.poker_basics,
    t.basic_strategy,
    t.player_types,
    t.hand_range,
    t.tournament,
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
            {lessons.map((lesson, index) => (
              <a key={lesson.title} href={`#lesson-${index + 1}`} className="tbtn text-xs font-semibold">
                {lesson.title}
              </a>
            ))}
          </nav>

          <div className="flex-1 space-y-10 text-sm text-white/70">
            {lessons.map((lesson, lessonIndex) => (
              <article key={lesson.title} id={`lesson-${lessonIndex + 1}`} className="space-y-3">
                <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                  Lesson {String(lessonIndex + 1).padStart(2, "0")}
                </div>
                <h2 className="text-xl text-white">{lesson.title}</h2>
                <p>
                  {lesson.description}
                </p>
                {lesson.sections && lesson.sections.map((section: any, sectionIndex: number) => (
                  <div key={sectionIndex} className="space-y-2">
                    {section.title && <h3 className="text-lg font-semibold text-white/90">{section.title}</h3>}
                    {section.body && <p>{section.body}</p>}
                    {section.bullets && (
                      <ul className="list-disc list-inside pl-4">
                        {section.bullets.map((bullet: string, bulletIndex: number) => (
                          <li key={bulletIndex}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {lessonIndex < lessons.length - 1 && <div className="rule" aria-hidden="true" />}
              </article>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

