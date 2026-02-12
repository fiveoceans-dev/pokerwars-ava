"use client";

import React, { useState } from "react";
import Image from "next/image";
import Avatar from "./Avatar";
import Button from "./Button";
import TournamentDetailsModal, {
  TournamentItem,
} from "./TournamentDetailsModal";
import { formatNumber } from "~~/utils/format";

export type TournamentCardProps = TournamentItem;

export default function TournamentCard(props: TournamentCardProps) {
  const [open, setOpen] = useState(false);
  const totalPrize = props.totalPrize ?? props.price * props.registered;
  const NextImage = Image as any;

  return (
    <div className="max-w-[10rem] w-full">
      <div className="relative w-full aspect-[63/88] overflow-hidden rounded-lg bg-base-300 border border-border">
        <NextImage
          src={props.image}
          alt={props.title}
          fill
          sizes="10rem"
          className="object-cover"
        />
      </div>
      <div className="mt-2 p-2 bg-primary/10 rounded-md border border-primary text-background">
        <div className="flex items-center gap-2 mb-1">
          <Avatar src={props.creatorAvatar} alt={props.creatorName} size={24} />
          <span className="text-xs font-semibold truncate">
            {props.creatorName}
          </span>
        </div>
        <p className="text-xs mb-1">{props.date}</p>
        <p className="text-xs mb-1">Price: {formatNumber(props.price)} HYPE</p>
        <p className="text-xs mb-1">Registered: {formatNumber(props.registered)}</p>
        <p className="text-xs mb-2">
          Prize: {formatNumber(totalPrize, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} HYPE
        </p>
        <Button className="w-full" onClick={() => setOpen(true)}>
          More Details
        </Button>
      </div>
      {open && (
        <TournamentDetailsModal
          item={{ ...props, totalPrize }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
