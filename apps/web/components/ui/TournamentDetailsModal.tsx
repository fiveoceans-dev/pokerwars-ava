"use client";

import React from "react";
import Image from "next/image";
import Avatar from "./Avatar";
import Button from "./Button";
import { calculatePrizeDistribution } from "../../utils/prizeDistribution";

export type TournamentItem = {
  title: string;
  image: string;
  creatorAvatar: string;
  creatorName: string;
  date: string;
  price: number;
  registered: number;
  /**
   * Optionally include the total prize. If omitted, it will be derived from
   * `price` and `registered` values.
   */
  totalPrize?: number;
};

type ModalProps = {
  item: TournamentItem;
  onClose: () => void;
};

export default function TournamentDetailsModal({ item, onClose }: ModalProps) {
  const totalPrize = item.totalPrize ?? item.price * item.registered;
  const distribution = calculatePrizeDistribution(item.price, item.registered);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-primary p-4 rounded-md w-96 max-w-full space-y-4 relative">
        <button
          aria-label="Close"
          className="absolute top-2 right-2 text-background"
          onClick={onClose}
        >
          ✕
        </button>
        <div className="relative w-full aspect-[63/88] overflow-hidden rounded-md border border-border">
          <Image
            src={item.image}
            alt={item.title}
            fill
            sizes="(min-width: 768px) 24rem, 90vw"
            className="object-cover"
          />
        </div>
        <div className="text-background space-y-1">
          <div className="flex items-center gap-2">
            <Avatar src={item.creatorAvatar} alt={item.creatorName} size={32} />
            <span className="font-semibold">{item.creatorName}</span>
          </div>
          <p>{item.date}</p>
          <p>Price: {item.price} HYPE</p>
          <p>Registered: {item.registered}</p>
          <p>Total Prize: {totalPrize.toFixed(2)} HYPE</p>
        </div>
        <div className="text-background">
          <h4 className="font-semibold mb-1">Prize Distribution</h4>
          <ul className="text-sm max-h-32 overflow-y-auto space-y-1">
            {distribution.map((p, i) => (
              <li key={i}>
                Place {i + 1}: {p.toFixed(2)} HYPE
              </li>
            ))}
          </ul>
        </div>
        <div className="text-background">
          <h4 className="font-semibold mb-1">Refund Policy</h4>
          <p className="text-sm">
            Refunds are available up until the tournament start time.
          </p>
        </div>
        <div className="pt-2 flex justify-end">
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
