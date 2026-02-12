"use client";

import { use } from "react";
import PlayTableContainer from "../../components/PlayTableContainer";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ tableId: string }>;
}

export default function DynamicTablePage({ params }: PageProps) {
  const { tableId } = use(params);
  
  if (!tableId) return notFound();

  const decodedId = decodeURIComponent(tableId);
  
  // Only handle patterns we recognize as poker tables to avoid hijacking other potential routes
  const isPokerTable = 
    decodedId.startsWith('cash-') || 
    decodedId.startsWith('stt-') || 
    decodedId.startsWith('sng-') || 
    decodedId.startsWith('mtt-') || 
    decodedId === 'demo' ||
    // Also support UUID-like patterns if we have dynamic tables
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedId);

  if (!isPokerTable) {
    // This allows Next.js to continue searching for other routes or show its default 404
    return notFound();
  }

  const effectiveTableId = decodedId === 'demo' ? 'cash-3a1b' : decodedId;

  return <PlayTableContainer tableId={effectiveTableId} />;
}
