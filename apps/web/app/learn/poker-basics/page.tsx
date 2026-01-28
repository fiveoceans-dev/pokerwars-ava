"use client";

const sections: Array<{ title: string; body: string; bullets?: string[] }> = [
  {
    title: "What is Texas Hold'em?",
    body:
      "Texas Hold'em is a community-card poker game. Each player receives two private hole cards, and five community cards are dealt face up. You make your best five-card hand using any combination of your two hole cards and the five community cards.",
  },
  {
    title: "Hand Flow (One Full Hand)",
    body:
      "A hand moves through four betting rounds: preflop (after hole cards), flop (three community cards), turn (fourth card), and river (fifth card). Each round continues until all active players have matched the current bet. If everyone checks or folds, the hand ends.",
    bullets: [
      "Preflop: hole cards dealt, blinds posted, first betting round.",
      "Flop: three community cards dealt, betting round.",
      "Turn: fourth community card, betting round.",
      "River: fifth community card, final betting round.",
    ],
  },
  {
    title: "Actions You Can Take",
    body:
      "On your turn you can fold, check (if no bet is in front of you), call (match the bet), bet (start the action), or raise (increase the bet). Your options depend on the current bet and your stack.",
    bullets: [
      "Fold: give up your hand and lose what you’ve already put in.",
      "Check: pass the action when no bet is required.",
      "Call: match the current bet to stay in.",
      "Bet: place the first bet on a street.",
      "Raise: increase the bet size; others must call or fold.",
    ],
  },
  {
    title: "Blinds, Antes, and Position",
    body:
      "Blinds force action and create the pot. The dealer button rotates each hand; the player left of the button posts the small blind, the next posts the big blind. Acting later (closer to the button) is stronger because you see opponents act first. Some games add antes, small forced bets from everyone.",
  },
  {
    title: "Hand Rankings (Strongest → Weakest)",
    body:
      "Royal flush, straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, high card. If two players have the same hand rank, the highest card in the hand breaks the tie (kickers).",
    bullets: [
      "Flush vs. straight: a flush is any five cards of the same suit; a straight is five in sequence.",
      "Full house: three of a kind + a pair.",
      "Kickers: extra cards that break ties when hand ranks match.",
    ],
  },
  {
    title: "Showdown and Winning the Pot",
    body:
      "If more than one player remains after the river, the hand goes to showdown. Players reveal their cards, and the best five-card hand wins. You can also win without showdown by betting and getting everyone to fold.",
  },
  {
    title: "Quick Tips for Your First Sessions",
    body:
      "Play tighter from early position, avoid big bluffs at low stakes, and focus on simple value betting. Watch how opponents play and take notes—most mistakes come from playing too many weak hands.",
  },
];

export default function PokerBasicsPage() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Poker Basics</h1>
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
