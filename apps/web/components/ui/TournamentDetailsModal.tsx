"use client";

import React from "react";
import Image from "next/image";
import Avatar from "./Avatar";
import Button from "./Button";
import { calculatePrizeDistribution } from "../../utils/prizeDistribution";
import { formatNumber } from "~~/utils/format";

import { 
  Modal, 
  ModalLabel, 
  ModalContent,
  ModalFooter
} from "./Modal";

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
  const NextImage = Image as any;
  return (
    <Modal
      modalId="tournament-details"
      open={true}
      onClose={onClose}
    >
      <ModalContent className="relative">
        <button
          aria-label="Close"
          className="absolute top-0 right-0 text-white/60 hover:text-white z-10"
          onClick={onClose}
        >
          ✕
        </button>
        <ModalLabel>Tournament Details</ModalLabel>
        
        <div className="relative w-full aspect-[63/88] overflow-hidden rounded-md border border-white/10">
          <NextImage
            src={item.image}
            alt={item.title}
            fill
            sizes="(min-width: 768px) 24rem, 90vw"
            className="object-cover"
          />
        </div>
        <div className="text-white space-y-1">
          <div className="flex items-center gap-2">
            <Avatar src={item.creatorAvatar} alt={item.creatorName} size={32} />
            <span className="font-semibold">{item.creatorName}</span>
          </div>
          <p className="text-sm opacity-80">{item.date}</p>
          <p className="text-sm">Price: {formatNumber(item.price)} HYPE</p>
          <p className="text-sm">Registered: {formatNumber(item.registered)}</p>
          <p className="text-sm font-bold">Total Prize: {formatNumber(totalPrize, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HYPE</p>
        </div>
        <div className="text-white">
          <h4 className="font-semibold mb-1">Prize Distribution</h4>
          <ul className="text-xs max-h-32 overflow-y-auto space-y-1 opacity-80">
            {distribution.map((p, i) => (
              <li key={i}>
                Place {i + 1}: {formatNumber(p, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HYPE
              </li>
            ))}
          </ul>
        </div>
        <div className="text-white">
          <h4 className="font-semibold mb-1">Refund Policy</h4>
          <p className="text-xs opacity-80">
            Refunds are available up until the tournament start time.
          </p>
        </div>
        <ModalFooter>
          <Button onClick={onClose} variant="secondary">
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
