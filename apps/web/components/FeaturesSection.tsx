const steps = [
  {
    title: "Fast and Easy Deposits and Withdrawals",
    description:
      "Deposit and withdraw funds quickly using credit cards or crypto wallets",
  },
  {
    title: "Fair and Transparent Gameplay",
    description:
      "With onchain randomness and verifiable game logic, players can trust the integrity of each game.",
  },
  {
    title: "Tickets & Tokens Economy",
    description:
      "Complete freedom to buy, sell, and trade tickets and $POKER tokens on secondary markets.",
  },
  {
    title: "Loyalty Rewards",
    description:
      "Earn loyalty points for every game played, redeemable for exclusive rewards and bonuses.",
  },
  {
    title: "Fair Prize Distribution",
    description: "Tournaments distribute prizes fairly: 80% prizes, 10% creator, 10% protocol.",
  },
  {
    title: "Play and Learn",
    description:
      "Access tutorials and practice games to improve your poker skills before competing for real prizes.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-12">
      <div className="content-wrap">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl md:text-3xl">Join PokerWars</h2>
        </div>
        <div className="rule" aria-hidden="true" />
        <div className="grid gap-y-10 md:gap-y-12 md:grid-cols-2">
          {steps.map(({ title, description }, index) => {
            const isLeft = index % 2 === 0;
            return (
              <div
                key={title}
                className={`space-y-2 reveal ${isLeft ? "md:col-start-1" : "md:col-start-2"}`}
              >
                <div className="text-[11px] uppercase tracking-[0.4em] text-white/50">
                  Feature {String(index + 1).padStart(2, "0")}
                </div>
                <div className="text-lg text-white">{title}</div>
                <p className="text-sm text-white/70">{description}</p>
                <div className="rule" aria-hidden="true" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
