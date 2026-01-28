"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletGameSync } from "~~/hooks/useWalletGameSync";
import { WalletConnectButton } from "~~/components/WalletConnectButton";
import { useBalances } from "~~/hooks/useBalances";

type HeaderMenuLink = {
  label: string;
  href: string;
};

export const menuLinks: HeaderMenuLink[] = [
  { label: "Home", href: "/" },
  { label: "Cash", href: "/cash" },
  { label: "S&G", href: "/snr" },
  { label: "MTT", href: "/mtt" },
  { label: "Learn", href: "/learn" },
  { label: "Free", href: "/free" },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();
  return (
    <>
      {menuLinks.map(({ label, href }) => {
        const isActive = pathname === href;
        return (
          <li key={href} className="text-[11px] md:text-sm uppercase tracking-[0.22em] md:tracking-wide">
            {isActive ? (
              <span>{`> ${label} <`}</span>
            ) : (
              <Link href={href} passHref className="tbtn">
                {label}
              </Link>
            )}
          </li>
        );
      })}
    </>
  );
};

/**
 * Site header
 */
export const Header = () => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  const { error: walletSyncError } = useWalletGameSync();
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "PokerWars";
  const { balances, hydrated } = useBalances();

  return (
    <header className="topbar">
      <div className="topbar-inner content-wrap py-4">
        <div className="flex items-center gap-3">
          <div className="lg:hidden dropdown" ref={burgerMenuRef}>
            <label
              tabIndex={0}
              className="tbtn"
              onClick={() => {
                setIsDrawerOpen((prevIsOpenState) => !prevIsOpenState);
              }}
            >
              Menu
            </label>
            {isDrawerOpen && (
              <ul
                tabIndex={0}
                className="menu menu-compact dropdown-content mt-3 p-2 w-52 bg-black/80 border border-white/10"
                onClick={() => {
                  setIsDrawerOpen(false);
                }}
              >
                <HeaderMenuLinks />
              </ul>
            )}
          </div>
          <Link href="/" passHref className="text-sm uppercase tracking-[0.32em] text-white font-normal">
            {appName}
          </Link>
          <ul className="hidden lg:flex nav">
            <HeaderMenuLinks />
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] md:text-xs text-white/70">
          <Link href="/account" className="tbtn text-[10px] md:text-xs">
            COINS {hydrated ? balances.coins : "—"}
          </Link>
          <Link href="/account" className="tbtn text-[10px] md:text-xs">
            TICKETS X:{hydrated ? balances.tickets.ticket_x : "—"} Y:{hydrated ? balances.tickets.ticket_y : "—"} Z:{hydrated ? balances.tickets.ticket_z : "—"}
          </Link>
          <WalletConnectButton />
          {walletSyncError && (
            <span className="text-xs text-red-400 max-w-xs">{walletSyncError}</span>
          )}
        </div>
      </div>
    </header>
  );
};
