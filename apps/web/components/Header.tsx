"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWalletGameSync } from "~~/hooks/useWalletGameSync";
import { useBalances } from "~~/hooks/useBalances";
import { useWallet } from "~~/components/providers/WalletProvider";
import { formatWalletLabel } from "~~/components/providers/WalletProvider";

type HeaderMenuLink = {
  label: string;
  href: string;
};

export const menuLinks: HeaderMenuLink[] = [
  { label: "Home", href: "/" },
  { label: "Cash", href: "/cash" },
  { label: "SNG", href: "/sng" },
  { label: "MTT", href: "/mtt" },
  { label: "Learn", href: "/learn" },
  { label: "Free", href: "/free" },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();
  return (
    <>
      {menuLinks.map(({ label, href }) => {
        const isActive =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <li key={href}>
            <Link
              href={href}
              className={`tbtn tbtn-tight nav-btn ${isActive ? "nav-active" : ""}`}
            >
              {label}
            </Link>
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
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isWalletMenuOpen, setIsWalletMenuOpen] = useState(false);
  const burgerMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const { error: walletSyncError } = useWalletGameSync();
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "PokerWars";
  const { balances, hydrated } = useBalances();
  const { status, address } = useWallet();
  const isWalletConnected = status === "connected";
  const navControlClass = "tbtn tbtn-tight nav-btn";
  const groupGap = "gap-[5px]";
  const addressLabel = useMemo(
    () => (address ? formatWalletLabel(address) : "0xdemo...ef33"),
    [address],
  );
  const [compactNav, setCompactNav] = useState(false);
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const leftClusterRef = useRef<HTMLDivElement>(null);
  const rightClusterRef = useRef<HTMLDivElement>(null);
  const measureLeftRef = useRef<HTMLDivElement>(null);
  const measureRightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsDrawerOpen(false);
    setIsAccountMenuOpen(false);
    setIsWalletMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDrawerOpen(false);
        setIsAccountMenuOpen(false);
        setIsWalletMenuOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (targetNode && burgerMenuRef.current && !burgerMenuRef.current.contains(targetNode)) {
        setIsDrawerOpen(false);
      }
      if (targetNode && accountMenuRef.current && !accountMenuRef.current.contains(targetNode)) {
        setIsAccountMenuOpen(false);
      }
      if (targetNode && walletMenuRef.current && !walletMenuRef.current.contains(targetNode)) {
        setIsWalletMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useLayoutEffect(() => {
    const update = () => {
      const cw = containerRef.current?.clientWidth ?? 0;
      const lw =
        measureLeftRef.current?.scrollWidth ??
        leftClusterRef.current?.scrollWidth ??
        0;
      const rw =
        measureRightRef.current?.scrollWidth ??
        rightClusterRef.current?.scrollWidth ??
        0;
      const gap = 5;
      // Pseudo elements ([ ]) and gaps aren't included in scrollWidth; add buffer.
      const buffer = 20;
      setCompactNav(lw + rw + gap + buffer > cw);
    };
    update();
    const resizeObserver = new ResizeObserver(update);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <header className="topbar">
      <div
        ref={containerRef}
        className="topbar-inner content-wrap py-2 flex items-center whitespace-nowrap"
      >
        {/* Left cluster: brand + nav links */} 
        <div ref={leftClusterRef} className={`flex items-center ${groupGap}`}>
          <Link
            href="/"
            className="text-white text-[var(--btn-font-size)] tracking-[var(--btn-letter)] uppercase font-semibold leading-none"
          >
            {appName}
          </Link>
          {!compactNav && (
            <ul className="nav-list hidden sm:flex items-center">
              <HeaderMenuLinks />
            </ul>
          )}
          <div
            className={`dropdown ${compactNav ? "" : "sm:hidden"}`}
            ref={burgerMenuRef}
          >
            <button
              type="button"
              className={navControlClass}
              aria-haspopup="menu"
              aria-expanded={isDrawerOpen}
              onClick={() => setIsDrawerOpen((prev) => !prev)}
            >
              Menu
            </button>
            {isDrawerOpen && (
              <ul
                tabIndex={0}
                className="nav-list menu menu-compact dropdown-content mt-3 p-2 w-52 bg-black/80 border border-white/10"
                onClick={() => setIsDrawerOpen(false)}
              >
                <HeaderMenuLinks />
              </ul>
            )}
          </div>
        </div>

        {/* Right cluster: balances + wallet */} 
        <div
          ref={rightClusterRef}
          className={`${compactNav ? "hidden" : "hidden sm:flex"} items-center justify-end ${groupGap} text-white/70`}
        >
          <Link href="/account" className="tbtn tbtn-tight nav-btn">
            Coins {hydrated ? balances.coins : "—"}
          </Link>
          <Link href="/account" className="tbtn tbtn-tight nav-btn">
            Tickets X:{hydrated ? balances.tickets.ticket_x : "—"} Y:{hydrated ? balances.tickets.ticket_y : "—"} Z:{hydrated ? balances.tickets.ticket_z : "—"}
          </Link>
          <div className="dropdown" ref={walletMenuRef}>
            {isWalletConnected ? (
              <button
                type="button"
                className="tbtn tbtn-tight nav-btn max-w-[140px] truncate"
                aria-haspopup="menu"
                aria-expanded={isWalletMenuOpen}
                onClick={() => setIsWalletMenuOpen((prev) => !prev)}
              >
                {addressLabel}
              </button>
            ) : (
              <button
                type="button"
                className="tbtn tbtn-tight nav-btn"
                onClick={() => {
                  window.dispatchEvent(new Event("open-wallet-connect"));
                }}
              >
                Connect wallet
              </button>
            )}
            {isWalletConnected && isWalletMenuOpen && (
              <ul
                tabIndex={0}
                className="nav-list menu menu-compact dropdown-content mt-3 p-2 w-52 bg-black/80 border border-white/10 right-0"
                onClick={() => setIsWalletMenuOpen(false)}
              >
                <li>
                  <Link href="/account" className="tbtn tbtn-tight nav-btn">
                    Account
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    className="tbtn tbtn-tight nav-btn"
                    onClick={async () => {
                      setIsWalletMenuOpen(false);
                      window.dispatchEvent(new Event("open-wallet-disconnect"));
                    }}
                  >
                    Disconnect
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Mobile right cluster */} 
        <div className={`flex items-center ${groupGap} text-white/70 ${compactNav ? "" : "sm:hidden"}`}>
          <div className="dropdown" ref={accountMenuRef}>
            <button
              type="button"
              className={navControlClass}
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
            >
              {isWalletConnected ? addressLabel : "Account"}
            </button>
            {isAccountMenuOpen && (
              <ul
                tabIndex={0}
                className="nav-list menu menu-compact dropdown-content mt-3 p-2 w-60 bg-black/80 border border-white/10 right-0"
                onClick={() => setIsAccountMenuOpen(false)}
              >
                {isWalletConnected && (
                  <li>
                    <Link href="/account" className="tbtn tbtn-tight nav-btn">
                      {addressLabel}
                    </Link>
                  </li>
                )}
                <li>
                  <Link href="/account" className="tbtn tbtn-tight nav-btn">
                    Coins {hydrated ? balances.coins : "—"}
                  </Link>
                </li>
                <li>
                  <Link href="/account" className="tbtn tbtn-tight nav-btn">
                    Tickets X:{hydrated ? balances.tickets.ticket_x : "—"} Y:{hydrated ? balances.tickets.ticket_y : "—"} Z:{hydrated ? balances.tickets.ticket_z : "—"}
                  </Link>
                </li>
                <li>
                  {isWalletConnected ? (
                    <button
                      type="button"
                      className="tbtn tbtn-tight nav-btn"
                      onClick={async () => {
                        setIsAccountMenuOpen(false);
                        window.dispatchEvent(new Event("open-wallet-disconnect"));
                      }}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tbtn tbtn-tight nav-btn"
                      onClick={() => {
                        window.dispatchEvent(new Event("open-wallet-connect"));
                      }}
                    >
                      Connect wallet
                    </button>
                  )}
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute left-0 top-0 invisible whitespace-nowrap" aria-hidden="true">
        <div ref={measureLeftRef} className="flex items-center ">
          <span className="text-white text-[var(--btn-font-size)] tracking-[var(--btn-letter)] uppercase font-semibold leading-none">
            {appName}
          </span>
          <ul className="nav-list flex items-center ">
            <HeaderMenuLinks />
          </ul>
        </div>
        <div ref={measureRightRef} className="flex items-center  text-white/70">
          <span className="tbtn tbtn-tight nav-btn">
            Coins {hydrated ? balances.coins : "—"}
          </span>
          <span className="tbtn tbtn-tight nav-btn">
            Tickets X:{hydrated ? balances.tickets.ticket_x : "—"} Y:{hydrated ? balances.tickets.ticket_y : "—"} Z:{hydrated ? balances.tickets.ticket_z : "—"}
          </span>
          <span className="tbtn tbtn-tight nav-btn max-w-[140px] truncate">
            {isWalletConnected ? addressLabel : "Wallet"}
          </span>
        </div>
      </div>
    </header>
  );
};
