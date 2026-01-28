"use client";

const sections = [
  {
    title: "What Is a Range?",
    body:
      "A range is the set of hands someone could have given their position and actions. It's more accurate than guessing a single hand.",
  },
  {
    title: "Start Broad, Then Narrow",
    body:
      "Preflop ranges are widest. Each bet or raise narrows possibilities. By the river, ranges can be very tight.",
  },
  {
    title: "Think in Buckets",
    body:
      "Group hands into categories: strong value, medium value, draws, and bluffs. Decide which buckets take which actions.",
  },
  {
    title: "Position Matters",
    body:
      "Ranges are tighter out of position and wider in late position. Use this to interpret bets and size decisions.",
  },
];

export default function HandRangePage() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Hand Range</h1>
          <a href="/learn" className="tbtn text-xs font-semibold">
            Back to Learn
          </a>
        </div>
        <div className="rule" aria-hidden="true" />
        <div className="space-y-8 text-sm text-white/70">
          {sections.map((section) => (
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
