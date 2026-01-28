export interface Highlight {
  id: number;
  title: string;
  description: string;
  image: string;
  type: 'community' | 'gameplay' | 'tournament' | 'feature';
  date?: string;
  link?: string;
}

// Highlights removed; keep an empty list until new assets are ready
export const highlights: Highlight[] = [];

// Utility functions for highlights
export const getHighlightsByType = (_type: Highlight['type']): Highlight[] => {
  return [];
};

export const getRecentHighlights = (_count: number = 9): Highlight[] => {
  return [];
};

export const getHighlightById = (_id: number): Highlight | undefined => {
  return undefined;
};

// Export for easy access to different types
export const communityHighlights: Highlight[] = [];
export const gameplayHighlights: Highlight[] = [];
export const tournamentHighlights: Highlight[] = [];
export const featureHighlights: Highlight[] = [];
