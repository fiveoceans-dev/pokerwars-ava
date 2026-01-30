"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const slides = [
  {
    id: 0,
    title: "Cash tables",
    subtitle: "Play cash games anytime, anywhere.",
    image: "/carousel/pokerwars1.png",
    href: "/cash",
    button_text: "Play",
  },
  {
    id: 1,
    title: "SNG games",
    subtitle: "Join Sit & Go tournaments and win big.",
    image: "/carousel/pokerwars1.png",
    href: "/sng",
    button_text: "Join",
  },
  {
    id: 2,
    title: "MTT tournaments",
    subtitle: "Compete in multi-table tournaments for chance to win big",
    image: "/carousel/pokerwars1.png",
    href: "/mtt",
    button_text: "Compete",
  },
  {
    id: 3,
    title: "Learn and improve",
    subtitle: "Start your poker journey with our comprehensive learning resources.",
    image: "/carousel/pokerwars1.png",
    href: "/learn",
    button_text: "Start Learning",
  },
];

/**
 * HeroSection – simple carousel inspired by Rarible's hero.
 */
export default function HeroSection() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      5000,
    );
    return () => clearInterval(id);
  }, []);

  return (
    <section id="home" className="relative w-full min-h-[70vh] md:min-h-[80vh] overflow-hidden -mt-4">
      {slides.map((s, i) => (
        <div
          key={s.id}
          className={`absolute inset-0 transition-opacity duration-[1200ms] ${
            i === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={s.image}
            alt={s.title}
            fill
            sizes="100vw"
            priority={i === index}
            className="object-cover scale-105 animate-parallax"
          />
        </div>
      ))}

      <div className="absolute inset-0 hero-overlay pointer-events-none animate-dream" />
      <div className="absolute inset-0 bg-black/55 pointer-events-none" />

      <div className="relative z-10 min-h-[70vh] md:min-h-[80vh] flex flex-col justify-center">
        <div className="content-wrap">
          <div className="max-w-2xl text-left">
            <div className="flex flex-col gap-5">
              <h1
                className="text-3xl md:text-5xl leading-tight reveal"
                style={{ animationDelay: "0.1s", minHeight: "3.75em" }}
              >
                {slides[index].title}
              </h1>
              <p className="text-sm text-white/70 reveal" style={{ animationDelay: "0.2s" }}>
                {slides[index].subtitle}
              </p>
              <div className="flex flex-wrap gap-4 text-sm reveal" style={{ animationDelay: "0.3s" }}>
                <a href={slides[index].href} className="tbtn">
                  {slides[index].button_text}
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs reveal">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={i === index ? "text-white" : "text-white/40"}
              aria-label={`Go to slide ${i + 1}`}
            >
              __
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
