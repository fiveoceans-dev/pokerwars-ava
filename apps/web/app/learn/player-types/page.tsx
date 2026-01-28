"use client";

const sections = [
  {
    title: "Tight-Passive",
    body:
      "Plays few hands and rarely raises. Value bet thinner and avoid bluffing; they usually have it when they show aggression.",
  },
  {
    title: "Tight-Aggressive",
    body:
      "Selective but assertive. Respect their raises, but fight back in position with strong hands and well-timed 3-bets.",
  },
  {
    title: "Loose-Passive",
    body:
      "Calls too much and chases. Bet bigger for value and reduce fancy bluffs—make them pay to see cards.",
  },
  {
    title: "Loose-Aggressive",
    body:
      "Applies pressure and plays many hands. Trap with strong holdings and use position to call down lighter when ranges are wide.",
  },
];

export default function PlayerTypesPage() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Player Types</h1>
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
