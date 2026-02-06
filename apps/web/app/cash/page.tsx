"use client";

import GamesTableSection from "../../components/GamesTableSection";

export default function CashPage() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl md:text-3xl">Cash</h1>
        </div>
        <GamesTableSection />
      </div>
    </main>
  );
}
