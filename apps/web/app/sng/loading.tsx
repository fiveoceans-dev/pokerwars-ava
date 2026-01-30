export default function Loading() {
  return (
    <main className="min-h-screen pb-16 pt-10">
      <div className="content-wrap space-y-6">
        <div className="h-6 w-28 bg-white/10 animate-pulse" />
        <div className="rule" aria-hidden="true" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-6 bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    </main>
  );
}
