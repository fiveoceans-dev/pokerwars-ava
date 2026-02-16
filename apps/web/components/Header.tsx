"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const LinkComponent = Link as any;
import { usePathname } from "next/navigation";
import { useWalletGameSync } from "~~/hooks/useWalletGameSync";
import { useBalances } from "~~/hooks/useBalances";
import { useWallet } from "~~/components/providers/WalletProvider";
import { formatWalletLabel } from "~~/components/providers/WalletProvider";
import { useActiveStatus } from "~~/hooks/useActiveStatus";
import { formatNumber } from "~~/utils/format";
import { useLanguageStore, languageLabels, Language } from "~~/stores/useLanguageStore";
import { translations } from "~~/constants/translations";

type HeaderMenuLink = {
  key: string;
  href: string;
};

const shuffleChars = (target: string, intensity = 0.5) => {
  const pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ$";
  return target
    .split("")
    .map((ch) => {
      if (ch === " ") return ch;
      if (Math.random() > intensity) return ch;
      return pool[Math.floor(Math.random() * pool.length)];
    })
    .join("");
};

const NAV_ANIM_COOKIE = "nav_free_shuffle_at";
const NAV_ANIM_DURATION_MS = 5 * 60 * 1000;
const NAV_ANIM_INTERVAL_MS = 30 * 1000;
const NAV_ANIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getCookieValue = (name: string) => {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${escapeRegExp(name)}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : "";
};

const setCookieValue = (name: string, value: string, maxAgeSeconds: number) => {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}`;
};

const AnimatedNavLabel = () => {
  const { language } = useLanguageStore();
  const t = translations[language];
  const [text, setText] = useState(t.free);
  
  useEffect(() => {
    let mounted = true;
    let stage = 0;
    let shuffleTimer: number | undefined;
    let holdTimer: number | undefined;
    const targets = [t.free_coins, t.free_coins];
    const lastPlayedRaw = getCookieValue(NAV_ANIM_COOKIE);
    const lastPlayed = lastPlayedRaw ? Number.parseInt(lastPlayedRaw, 10) : 0;
    if (lastPlayed && !Number.isNaN(lastPlayed)) {
      if (Date.now() - lastPlayed < NAV_ANIM_COOLDOWN_MS) {
        return;
      }
    }

    const runShuffle = (nextTarget: string) => {
      let steps = 0;
      const totalSteps = 12;
      const tick = () => {
        if (!mounted) return;
        steps += 1;
        const intensity = Math.max(0.1, 1 - steps / totalSteps);
        setText(shuffleChars(nextTarget, intensity));
        if (steps < totalSteps) {
          shuffleTimer = window.setTimeout(tick, 45);
        } else {
          setText(nextTarget);
        }
      };
      tick();
    };

    const cycle = () => {
      if (!mounted) return;
      stage = (stage + 1) % targets.length;
      const nextTarget = targets[stage];
      runShuffle(nextTarget);
      holdTimer = window.setTimeout(cycle, NAV_ANIM_INTERVAL_MS);
    };

    const stopTimer = window.setTimeout(() => {
      setCookieValue(NAV_ANIM_COOKIE, String(Date.now()), Math.floor(NAV_ANIM_COOLDOWN_MS / 1000));
      if (holdTimer) window.clearTimeout(holdTimer);
      if (shuffleTimer) window.clearTimeout(shuffleTimer);
    }, NAV_ANIM_DURATION_MS);

    holdTimer = window.setTimeout(cycle, NAV_ANIM_INTERVAL_MS);
    return () => {
      mounted = false;
      if (shuffleTimer) window.clearTimeout(shuffleTimer);
      if (holdTimer) window.clearTimeout(holdTimer);
      window.clearTimeout(stopTimer);
    };
  }, [t.free_coins]);

  return <span aria-hidden="true">{text}</span>;
};

export const menuLinks: HeaderMenuLink[] = [
  { key: "home", href: "/" },
  { key: "cash", href: "/cash" },
  { key: "sng", href: "/sng" },
  { key: "mtt", href: "/mtt" },
  { key: "learn", href: "/learn" },
  { key: "free", href: "/free" },
];

export const HeaderMenuLinks = () => {
  const pathname = usePathname();
  const activeStatus = useActiveStatus();
  const { language } = useLanguageStore();
  const t = translations[language];

  return (
    <>
      {menuLinks.map(({ key, href }) => {
        const isActive =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);
        const showDot =
          (key === "cash" && activeStatus.cashActive) ||
          (key === "sng" && activeStatus.sngActive) ||
          (key === "mtt" && activeStatus.mttActive);
        const label = t[key] || key;
        return (
          <li key={href}>
            <LinkComponent
              href={href}
              className={`tbtn tbtn-tight nav-btn ${isActive ? "nav-active" : ""}`}
            >
              <span className="inline-flex items-center gap-2">
                {key === "free" ? <AnimatedNavLabel /> : label}
                {showDot ? (
                  <span
                    className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.7)]"
                    aria-label="active table"
                  />
                ) : null}
              </span>
            </LinkComponent>
          </li>
        );
      })}
    </>
  );
};

const LanguageSwitcher = () => {
  const { language, setLanguage } = useLanguageStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="dropdown relative" ref={containerRef}>
      <button
        type="button"
        className="tbtn tbtn-tight nav-btn w-[60px]"
        onClick={() => setIsOpen(!isOpen)}
      >
        {languageLabels[language]}
      </button>
      {isOpen && (
        <ul className="nav-list menu menu-compact dropdown-content mt-3 p-2 pl-0 w-24 bg-black border border-white/10 right-0 z-[60] shadow-2xl">
          {(Object.keys(languageLabels) as Language[]).map((lang) => (
            <li key={lang}>
              <button
                type="button"
                className={`tbtn tbtn-tight nav-btn w-full text-left ${language === lang ? "nav-active" : ""}`}
                onClick={() => {
                  setLanguage(lang);
                  setIsOpen(false);
                }}
              >
                {languageLabels[lang]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const { balances, hydrated, walletForBalance } = useBalances();
  const { status, address } = useWallet();
  const { language } = useLanguageStore();
  const t = translations[language];

  const isWalletConnected = status === "connected";
  const showBalances = hydrated && Boolean(walletForBalance);
  const coinsDisplay = showBalances ? formatNumber(balances.coins) : "—";
  const ticketXDisplay = showBalances ? formatNumber(balances.tickets.ticket_x) : "—";
  const ticketYDisplay = showBalances ? formatNumber(balances.tickets.ticket_y) : "—";
  const ticketZDisplay = showBalances ? formatNumber(balances.tickets.ticket_z) : "—";
  const navControlClass = "tbtn tbtn-tight nav-btn";
  const groupGap = "gap-[5px]";
  const addressLabel = useMemo(
    () => (address ? formatWalletLabel(address) : "0xdemo...ef33"),
    [address],
  );
  const pathname = usePathname();

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

  return (
    <header className="topbar relative">
      <div
        className="topbar-inner content-wrap py-2 flex items-center whitespace-nowrap"
      >
        {/* Left cluster: brand + nav links */} 
        <div className={`flex items-center ${groupGap}`}>
          <LinkComponent
            href="/"
            className="text-white text-[var(--btn-font-size)] tracking-[var(--btn-letter)] uppercase font-semibold leading-none mr-2"
          >
            {appName}
          </LinkComponent>
          
          <ul className="nav-list hidden lg:flex items-center">
            <HeaderMenuLinks />
          </ul>

          <div
            className="dropdown relative lg:hidden"
            ref={burgerMenuRef}
          >
            <button
              type="button"
              className={navControlClass}
              aria-haspopup="menu"
              aria-expanded={isDrawerOpen}
              onClick={() => setIsDrawerOpen((prev) => !prev)}
            >
              {t.menu}
            </button>
            {isDrawerOpen && (
              <ul
                tabIndex={0}
                className="nav-list menu menu-compact dropdown-content mt-3 p-2 w-52 bg-black border border-white/10 left-0 z-50 shadow-2xl"
                onClick={() => setIsDrawerOpen(false)}
              >
                <HeaderMenuLinks />
              </ul>
            )}
          </div>
        </div>

        {/* Right cluster: balances + wallet (Desktop) */} 
        <div
          className="hidden sm:flex items-center justify-end text-white/70 ml-auto"
        >
          <div className="flex items-center gap-1">
            <LinkComponent href="/account" className="tbtn tbtn-tight nav-btn">
              {t.coins} {coinsDisplay}
            </LinkComponent>
            <LinkComponent href="/account" className="tbtn tbtn-tight nav-btn">
              {t.tickets} X:{ticketXDisplay} Y:{ticketYDisplay} Z:{ticketZDisplay}
            </LinkComponent>
          </div>

          <div className="dropdown relative" ref={walletMenuRef}>
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
                {t.connect_wallet}
              </button>
            )}
            {isWalletConnected && isWalletMenuOpen && (
              <ul
                tabIndex={0}
                className="nav-list menu menu-compact dropdown-content mt-3 p-2 pl-0 w-52 bg-black border border-white/10 right-0 z-50 shadow-2xl"
                onClick={() => setIsWalletMenuOpen(false)}
              >
                <li>
                  <LinkComponent href="/account" className="tbtn tbtn-tight nav-btn">
                    {t.account}
                  </LinkComponent>
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
                    {t.disconnect}
                  </button>
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Mobile right cluster (Balances only, wallet inside Menu) */} 
        <div className="flex sm:hidden items-center gap-1 text-white/70 ml-auto mr-2">
          <div className="dropdown relative" ref={accountMenuRef}>
            <button
              type="button"
              className={navControlClass}
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              onClick={() => setIsAccountMenuOpen((prev) => !prev)}
            >
              {t.account}
            </button>
            {isAccountMenuOpen && (
              <ul
                tabIndex={0}
                className="nav-list menu menu-compact dropdown-content mt-3 p-2 pl-0 w-60 bg-black border border-white/10 right-0 z-50 shadow-2xl"
                onClick={() => setIsAccountMenuOpen(false)}
              >
                {isWalletConnected && (
                  <li>
                    <LinkComponent href="/account" className="tbtn tbtn-tight nav-btn">
                      {addressLabel}
                    </LinkComponent>
                  </li>
                )}
                <li>
                  <LinkComponent href="/account" className="tbtn tbtn-tight nav-btn">
                    {t.coins} {coinsDisplay}
                  </LinkComponent>
                </li>
                <li>
                  <LinkComponent href="/account" className="tbtn tbtn-tight nav-btn">
                    {t.tickets} X:{ticketXDisplay} Y:{ticketYDisplay} Z:{ticketZDisplay}
                  </LinkComponent>
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
                      {t.disconnect}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="tbtn tbtn-tight nav-btn"
                      onClick={() => {
                        window.dispatchEvent(new Event("open-wallet-connect"));
                      }}
                    >
                      {t.connect_wallet}
                    </button>
                  )}
                </li>
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Far right: language switcher positioned way outside main column */}
      <div className="absolute right-4 lg:right-10 top-1/2 -translate-y-1/2 flex items-center z-[60]">
        <LanguageSwitcher />
      </div>
    </header>
  );
};
