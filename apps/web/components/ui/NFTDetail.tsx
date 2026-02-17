"use client";
import Image from "next/image";
import { useState } from "react";
import Button from "./Button";

const tabs = ["Overview", "Bids", "History"];

export function NFTDetail() {
  const [active, setActive] = useState("Overview");

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      <div className="md:col-span-6">
        <div className="relative w-full aspect-square overflow-hidden rounded-lg bg-base-300">
          <Image
            src="/nft.png"
            alt="NFT"
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
      <div className="md:col-span-6 space-y-6">
        <div className="flex gap-4 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setActive(t)}
              className={`pb-2 text-sm font-semibold transition-colors ${
                active === t
                  ? "text-accent border-b-2 border-accent"
                  : "text-background"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {active === "Overview" && (
          <div className="text-background space-y-2">
            <p>Creator: 0x1234...abcd</p>
            <p>Owner: 0xabcd...1234</p>
            <p>Royalties: 5%</p>
            <p>Chain: Hyperliquid</p>
            <p>Token ID: #1</p>
            <p>Properties: Legendary</p>
          </div>
        )}
        {active === "Bids" && (
          <div className="text-background">
            <p className="caption">No bids yet.</p>
          </div>
        )}
        {active === "History" && (
          <div className="text-background">
            <p className="caption">No history available.</p>
          </div>
        )}
        <div className="flex gap-4 pt-4">
          <Button>Buy Now</Button>
          <Button variant="secondary">Place Bid</Button>
          <Button variant="ghost">Make Offer</Button>
        </div>
      </div>
    </div>
  );
}

export default NFTDetail;
