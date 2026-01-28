import React from "react";

export default function MissionStatementSection() {
  return (
    <section className="py-10">
      <div className="content-wrap">
        <div className="whitespace-nowrap overflow-hidden">
          <div className="animate-marquee inline-block text-sm text-white/80">
            <span className="mx-8">
              Solving fraud in online poker, much like Bitcoin solved fraud in banking.
            </span>
            <span className="mx-8">
              Solving fraud in online poker, much like Bitcoin solved fraud in banking.
            </span>
            <span className="mx-8">
              Solving fraud in online poker, much like Bitcoin solved fraud in banking.
            </span>
            <span className="mx-8">
              Solving fraud in online poker, much like Bitcoin solved fraud in banking.
            </span>
          </div>
        </div>
        <div className="mt-6 flex justify-center">
          <img
            src="/pokerwars_logo.svg"
            alt="PokerWars Logo"
            className="w-32 h-32 rounded-lg"
          />
        </div>
      </div>
    </section>
  );
}
