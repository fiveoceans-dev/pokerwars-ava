"use client";

const sections: Array<{ title: string; body: string; bullets?: string[] }> = [
  {
    title: "Play Tight From Early Position",
    body:
      "Your default strategy should be selective. Early position is the hardest seat because you act first after the flop. Choose stronger hands early and open up slightly as you move closer to the button.",
    bullets: [
      "Early position: premium pairs, strong aces, strong broadways.",
      "Middle position: add suited aces and more broadways.",
      "Late position: widen to include suited connectors and more speculative hands.",
    ],
  },
  {
    title: "Value Bet First, Bluff Second",
    body:
      "Most profit at lower and mid stakes comes from clear value bets. When you have a hand likely ahead of your opponent’s range, bet for value. Bluff only when the story makes sense and the board favors your range.",
    bullets: [
      "Bet bigger when the board is wet and draws are present.",
      "Bet smaller on dry boards when you want calls from weaker hands.",
      "Bluff less against players who don’t fold.",
    ],
  },
  {
    title: "Use Position to Control Pot Size",
    body:
      "Position is power. Acting last lets you see how opponents behave before you decide. You can take free cards, keep pots small with marginal hands, or apply pressure when opponents show weakness.",
  },
  {
    title: "Have a Simple Preflop Plan",
    body:
      "Avoid limping. Open-raise or fold. If someone raises, decide whether to 3-bet or fold based on your hand strength and position. Keep your range consistent so opponents can’t read you easily.",
    bullets: [
      "Open-raise to isolate and take initiative.",
      "3-bet for value with strong hands; bluff 3-bet sparingly.",
      "Fold marginal hands out of position to avoid tough spots.",
    ],
  },
  {
    title: "Think in Ranges, Not Single Hands",
    body:
      "Assign your opponent a range based on their position, bet sizing, and past actions. Then compare your hand to that range instead of guessing one exact hand.",
  },
  {
    title: "Plan One Street Ahead",
    body:
      "Before you bet or call, think about what you’ll do on the next card. If a turn card could freeze you or force a fold, you may be better off taking a different line now.",
  },
  {
    title: "Avoid Common Leaks",
    body:
      "Most beginners lose chips by playing too many hands, calling too often, and ignoring position. A disciplined fold saves far more chips than a hopeful call.",
    bullets: [
      "Don’t chase weak draws without the right price.",
      "Respect big bets on the river—they’re usually value.",
      "Stay calm after losing a hand; avoid tilt decisions.",
    ],
  },
];

export default function BasicStrategyPage() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Basic Strategy</h1>
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
              {section.bullets ? (
                <ul className="list-disc pl-5 space-y-1 text-white/70">
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
