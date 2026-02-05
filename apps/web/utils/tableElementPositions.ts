export interface Position {
  x: string; // Left %
  y: string; // Top %
  t: string; // Transform
  r: number; // Rotation degrees (optional)
}

export interface TableLayout {
  seats: Position[];
  // Future: Add static positions for pot, community cards if they deviate from center
}

// Helper to calculate positions relative to a seat (e.g. chips, dealer button)
// moving towards the center of the table (50, 50)
export const getRelativePosition = (seatPos: Position, percentTowardsCenter: number): { x: number; y: number } => {
  const sx = parseFloat(seatPos.x);
  const sy = parseFloat(seatPos.y);
  const dx = 50 - sx;
  const dy = 50 - sy;
  return {
    x: sx + dx * percentTowardsCenter,
    y: sy + dy * percentTowardsCenter,
  };
};

// 9-Max Layout: Symmetrical Oval
// Seat 1 (index 0) starts Top Right and moves clockwise.
export const DESKTOP_LAYOUT_9: TableLayout = {
  seats: [
    { x: "70%", y: "12%", t: "-50%, -50%", r: 0 }, // Seat 1 (Top Right)
    { x: "92%", y: "35%", t: "-50%, -50%", r: 0 }, // Seat 2
    { x: "92%", y: "65%", t: "-50%, -50%", r: 0 }, // Seat 3
    { x: "75%", y: "92%", t: "-50%, -50%", r: 0 }, // Seat 4
    { x: "50%", y: "92%", t: "-50%, -50%", r: 0 }, // Seat 5 (Bottom Center)
    { x: "25%", y: "92%", t: "-50%, -50%", r: 0 }, // Seat 6
    { x: "8%", y: "65%", t: "-50%, -50%", r: 0 },  // Seat 7
    { x: "8%", y: "35%", t: "-50%, -50%", r: 0 },  // Seat 8
    { x: "30%", y: "12%", t: "-50%, -50%", r: 0 }, // Seat 9 (Top Left)
  ]
};

// Mobile 9-Max: Compressed vertically
export const MOBILE_LAYOUT_9: TableLayout = {
  seats: [
    { x: "80%", y: "10%", t: "-50%, -50%", r: 0 },
    { x: "96%", y: "32%", t: "-50%, -50%", r: 0 },
    { x: "96%", y: "60%", t: "-50%, -50%", r: 0 },
    { x: "85%", y: "85%", t: "-50%, -50%", r: 0 },
    { x: "50%", y: "95%", t: "-50%, -50%", r: 0 },
    { x: "15%", y: "85%", t: "-50%, -50%", r: 0 },
    { x: "4%", y: "60%", t: "-50%, -50%", r: 0 },
    { x: "4%", y: "32%", t: "-50%, -50%", r: 0 },
    { x: "20%", y: "10%", t: "-50%, -50%", r: 0 },
  ]
};

// 6-Max Layout: Hexagonal
export const DESKTOP_LAYOUT_6: TableLayout = {
  seats: [
    { x: "80%", y: "12%", t: "-50%, -50%", r: 0 }, // Seat 1
    { x: "95%", y: "50%", t: "-50%, -50%", r: 0 }, // Seat 2 (Right)
    { x: "80%", y: "88%", t: "-50%, -50%", r: 0 }, // Seat 3
    { x: "20%", y: "88%", t: "-50%, -50%", r: 0 }, // Seat 4
    { x: "5%", y: "50%", t: "-50%, -50%", r: 0 },  // Seat 5 (Left)
    { x: "20%", y: "12%", t: "-50%, -50%", r: 0 }, // Seat 6
  ]
};

export const MOBILE_LAYOUT_6: TableLayout = {
  seats: [
    { x: "85%", y: "15%", t: "-50%, -50%", r: 0 },
    { x: "98%", y: "50%", t: "-50%, -50%", r: 0 },
    { x: "85%", y: "85%", t: "-50%, -50%", r: 0 },
    { x: "15%", y: "85%", t: "-50%, -50%", r: 0 },
    { x: "2%", y: "50%", t: "-50%, -50%", r: 0 },
    { x: "15%", y: "15%", t: "-50%, -50%", r: 0 },
  ]
};

// Heads-Up: Top vs Bottom
export const DESKTOP_LAYOUT_2: TableLayout = {
  seats: [
    { x: "50%", y: "15%", t: "-50%, -50%", r: 0 }, // Villain
    { x: "50%", y: "85%", t: "-50%, -50%", r: 0 }, // Hero
  ]
};

export const MOBILE_LAYOUT_2: TableLayout = {
  seats: [
    { x: "50%", y: "15%", t: "-50%, -50%", r: 0 },
    { x: "50%", y: "88%", t: "-50%, -50%", r: 0 },
  ]
};

// Element Offsets (Pixels or Percentages)
export const ELEMENT_OFFSETS = {
  chips: {
    percentTowardsCenter: 0.28, // 28% from seat to center
  },
  dealerButton: {
    percentTowardsCenter: 0.20, // 20% from seat to center
  },
  cards: {
    desktop: { top: "-40px", zIndex: 0 },
    mobile: { top: "-35px", zIndex: 0 },
  }
};
