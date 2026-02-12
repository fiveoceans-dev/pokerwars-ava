"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PlayTableContainer from "../../components/PlayTableContainer";

function PlayPageInner() {
  const searchParams = useSearchParams();
  const tableId = searchParams.get("table");

  return <PlayTableContainer tableId={tableId} />;
}

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayPageInner />
    </Suspense>
  );
}