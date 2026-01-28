"use client";

import { useState } from "react";
import Image from "next/image";
import { buyNft } from "~~/services/nft";
import { PopularNftCard } from "./ui/PopularNftCard";
import {
  trendingItems,
  tournaments,
  formatCurrency,
  formatPokerBonus,
  type Tournament,
} from "~~/data/tournaments";

type SortKey = keyof Tournament;

export default function TrendingTournamentsSection() {
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: "asc" | "desc";
  } | null>(null);

  const sorted = [...tournaments].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const aVal = a[key];
    const bVal = b[key];
    let comparison = 0;
    if (typeof aVal === "number" && typeof bVal === "number") {
      comparison = aVal - bVal;
    } else {
      comparison = String(aVal).localeCompare(String(bVal));
    }
    return direction === "asc" ? comparison : -comparison;
  });

  const applySort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  };

  return (
    <section id="trending-tournaments" className="py-8 text-gray-900 dark:text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-12">
        <h2 className="text-3xl md:text-4xl font-extrabold text-center mb-10">
          <span className="text-accent">MTT</span>
        </h2>

        <div className="overflow-auto rounded-lg border border-gray-300 dark:border-gray-700">
          <table className="min-w-full text-xs sm:text-sm table-auto">
            <thead className="bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400 uppercase text-[10px] sm:text-xs">
              <tr>
                <th className="px-2 py-1 cursor-pointer" onClick={() => applySort("nft")}>NFT</th>
                <th className="px-2 py-1 cursor-pointer" onClick={() => applySort("name")}>Tournament</th>
                <th className="px-2 py-1 cursor-pointer" onClick={() => applySort("game")}>Game</th>
                <th className="px-2 py-1 cursor-pointer" onClick={() => applySort("date")}>Date</th>
                <th className="px-2 py-1 cursor-pointer" onClick={() => applySort("creator")}>Creator</th>
                <th className="px-2 py-1 text-center cursor-pointer" onClick={() => applySort("prize")}>PRIZES</th>
                <th className="px-2 py-1 text-center cursor-pointer" onClick={() => applySort("creatorShare")}>CREATOR</th>
                <th className="px-2 py-1 text-center cursor-pointer" onClick={() => applySort("protocolFee")}>PROTOCOL</th>
                <th className="px-2 py-1 text-center cursor-pointer" onClick={() => applySort("bonus")}>BONUS $POKER</th>
                <th className="px-2 py-1 text-center cursor-pointer" onClick={() => applySort("sold")}>Sold</th>
                <th className="px-2 py-1 text-center cursor-pointer" onClick={() => applySort("buyIn")}>Buy-In</th>
                <th className="px-2 py-1 text-center">Buy</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-black divide-y divide-gray-200 dark:divide-gray-800">
              {sorted.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition">
                  <td className="px-2 py-1">
                    <Image
                      src={t.nft}
                      alt={t.name}
                      width={48}
                      height={48}
                      className="w-12 h-12 object-cover rounded"
                      unoptimized
                    />
                  </td>
                  <td className="px-2 py-1">{t.name}</td>
                  <td className="px-2 py-1">{t.game}</td>
                  <td className="px-2 py-1">{t.date}</td>
                  <td className="px-2 py-1">
                    <span>{t.creator}</span>
                  </td>
                  <td className="px-2 py-1 text-center text-accent">
                    <div>{t.prize}%</div>
                    <div className="text-xs opacity-75">{formatCurrency((t.supply * t.buyIn * t.prize) / 100)}</div>
                  </td>
                  <td className="px-2 py-1 text-center text-blue-400">
                    <div>{t.creatorShare}%</div>
                    <div className="text-xs opacity-75">{formatCurrency((t.supply * t.buyIn * t.creatorShare) / 100)}</div>
                  </td>
                  <td className="px-2 py-1 text-center text-red-400">
                    <div>{t.protocolFee}%</div>
                    <div className="text-xs opacity-75">{formatCurrency((t.supply * t.buyIn * t.protocolFee) / 100)}</div>
                  </td>
                  <td className="px-2 py-1 text-center text-accent">
                    <div className="font-bold">{formatPokerBonus(t.bonus)}</div>
                    <div className="text-xs opacity-75">$POKER</div>
                  </td>
                  <td className="px-2 py-1 text-orange-500 text-center">0/{t.supply}</td>
                  <td className="px-2 py-1 text-green-500 text-center">
                    <div><span className="text-xs opacity-75">$</span>{t.buyIn}</div>
                  </td>
                  <td className="px-2 py-1 text-center">
                    <button
                      disabled
                      className="px-2 py-1 bg-gray-400 text-gray-600 font-semibold rounded transition-all duration-200 cursor-not-allowed text-xs"
                    >
                      Coming Soon
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
