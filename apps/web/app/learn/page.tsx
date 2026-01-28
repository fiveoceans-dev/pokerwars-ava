"use client";

export default function LearnPage() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Learn</h1>
        </div>
        <div className="flex flex-col gap-10 md:flex-row">
          <nav className="w-full md:w-56 flex flex-col gap-2 text-sm">
            <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">Lessons</div>
            <a href="#poker-basics" className="tbtn text-xs font-semibold">
              Poker Basics
            </a>
            <a href="#basic-strategy" className="tbtn text-xs font-semibold">
              Basic Strategy
            </a>
            <a href="#player-types" className="tbtn text-xs font-semibold">
              Player Types
            </a>
            <a href="#hand-range" className="tbtn text-xs font-semibold">
              Hand Range
            </a>
            <a href="#tournament" className="tbtn text-xs font-semibold">
              Tournament
            </a>
          </nav>

          <div className="flex-1 space-y-10 text-sm text-white/70">
            <article id="poker-basics" className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                Lesson 01
              </div>
              <h2 className="text-xl text-white">Poker Basics</h2>
              <p>
                Learn the flow of Texas Hold&apos;em, the betting rounds, and how hands are built from hole cards and community cards.
              </p>
              <a href="/learn/poker-basics" className="tbtn text-xs font-semibold">
                Open Article
              </a>
              <div className="rule" aria-hidden="true" />
            </article>

            <article id="basic-strategy" className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                Lesson 02
              </div>
              <h2 className="text-xl text-white">Basic Strategy</h2>
              <p>
                Build a tight, disciplined baseline: position-first, bet for value, and minimize costly mistakes.
              </p>
              <a href="/learn/basic-strategy" className="tbtn text-xs font-semibold">
                Open Article
              </a>
              <div className="rule" aria-hidden="true" />
            </article>

            <article id="player-types" className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                Lesson 03
              </div>
              <h2 className="text-xl text-white">Player Types</h2>
              <p>
                Identify common table archetypes and adjust with simple counter-plans.
              </p>
              <a href="/learn/player-types" className="tbtn text-xs font-semibold">
                Open Article
              </a>
              <div className="rule" aria-hidden="true" />
            </article>

            <article id="hand-range" className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                Lesson 04
              </div>
              <h2 className="text-xl text-white">Hand Range</h2>
              <p>
                Think in ranges instead of single hands. Start with broad ranges and tighten as action progresses.
              </p>
              <a href="/learn/hand-range" className="tbtn text-xs font-semibold">
                Open Article
              </a>
              <div className="rule" aria-hidden="true" />
            </article>

            <article id="tournament" className="space-y-3">
              <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                Lesson 05
              </div>
              <h2 className="text-xl text-white">Tournament</h2>
              <p>
                Manage stack sizes, understand payout pressure, and adjust aggression as blinds rise.
              </p>
              <a href="/learn/tournament" className="tbtn text-xs font-semibold">
                Open Article
              </a>
            </article>
          </div>
        </div>
      </div>
    </main>
  );
}
