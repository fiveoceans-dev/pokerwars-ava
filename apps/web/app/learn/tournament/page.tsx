"use client";

const sections = [
  {
    title: "Stack Depth Awareness",
    body:
      "Your effective stack (in big blinds) drives strategy. Deep stacks favor post-flop skill; short stacks push toward preflop decisions.",
  },
  {
    title: "Blind Pressure",
    body:
      "As blinds rise, hands that were playable become folds. Stay ahead of the curve by stealing blinds in late position.",
  },
  {
    title: "ICM and Payouts",
    body:
      "Near the money or final table, chips are worth more than usual. Avoid marginal all-ins and prioritize survival when payouts jump.",
  },
  {
    title: "Adjust to Table Dynamics",
    body:
      "Exploit tight tables with more opens; tighten up against aggressive tables. Always note stack sizes behind you.",
  },
];

export default function TournamentPage() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Tournament</h1>
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
