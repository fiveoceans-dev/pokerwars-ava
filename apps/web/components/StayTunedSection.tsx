export default function StayTunedSection() {
  return (
    <section id="community" className="relative py-12 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/40 to-black/80 -z-10" />
      <div className="content-wrap">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl md:text-3xl">Follow the Signal</h2>
          <span className="text-[11px] uppercase tracking-[0.4em] text-white/50">
            Community
          </span>
        </div>
        <div className="rule" aria-hidden="true" />
        <p className="text-sm text-white/70 max-w-2xl">
          Get drops, product updates, and tournament announcements. Minimal noise.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            href="http://twitter.com/pokerwarsxyz"
            target="_blank"
            rel="noopener noreferrer"
            className="tbtn"
          >
            Twitter
          </a>
        </div>
      </div>
    </section>
  );
}
