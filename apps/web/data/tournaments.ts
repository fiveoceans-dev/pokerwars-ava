export interface PopularNftCardProps {
  id: number;
  title: string;
  image: string;
  buyIn: string;
  status: string;
  gameType: string;
  dateTime: string;
  tournamentType: string;
  registered: number;
  maxRegistered: number;
  prize: string;
}

export interface Tournament {
  id: number;
  name: string;
  creator: string;
  creatorAvatar: string;
  game: string;
  buyIn: number;
  sold: number;
  prize: number;
  creatorShare: number;
  protocolFee: number;
  date: string;
  supply: number;
  nft: string;
  bonus: number;
}

// NFT carousel items - synchronized with tournament data
export const trendingItems: PopularNftCardProps[] = [
  {
    id: 0,
    title: `PokerWars #0`,
    image: `/nfts/nft0.png`,
    buyIn: `$25`,
    status: "Coming Soon",
    gameType: "No-Limit Texas Hold'em",
    dateTime: `[2025.10.03 21:00 GMT]`,
    tournamentType: "Tournament",
    registered: 0,
    maxRegistered: 1000,
    prize: "$20,000",
  },
  {
    id: 1,
    title: `PokerWars #1`,
    image: `/nfts/nft1.png`,
    buyIn: `$50`,
    status: "Coming Soon",
    gameType: "No-Limit Texas Hold'em",
    dateTime: `[2025.10.10 21:00 GMT]`,
    tournamentType: "Tournament",
    registered: 0,
    maxRegistered: 1000,
    prize: "$40,000",
  },
  {
    id: 2,
    title: `PokerWars #2`,
    image: `/nfts/nft2.png`,
    buyIn: `$100`,
    status: "Coming Soon",
    gameType: "No-Limit Texas Hold'em",
    dateTime: `[2025.10.17 21:00 GMT]`,
    tournamentType: "Tournament",
    registered: 0,
    maxRegistered: 1000,
    prize: "$80,000",
  },
  {
    id: 3,
    title: `PokerWars #3`,
    image: `/nfts/nft3.png`,
    buyIn: `$100`,
    status: "Coming Soon",
    gameType: "No-Limit Texas Hold'em",
    dateTime: `[2025.10.24 21:00 GMT]`,
    tournamentType: "Tournament",
    registered: 0,
    maxRegistered: 5000,
    prize: "$400,000",
  },
  {
    id: 4,
    title: `PokerWars #4`,
    image: `/nfts/nft4.png`,
    buyIn: `$500`,
    status: "Coming Soon",
    gameType: "No-Limit Texas Hold'em",
    dateTime: `[2025.10.31 21:00 GMT]`,
    tournamentType: "Tournament",
    registered: 0,
    maxRegistered: 10000,
    prize: "$4,000,000",
  },
  {
    id: 5,
    title: `PokerWars #5`,
    image: `/nfts/nft5.png`,
    buyIn: `$500`,
    status: "Coming Soon",
    gameType: "No-Limit Texas Hold'em",
    dateTime: `[2025.11.07 21:00 GMT]`,
    tournamentType: "Tournament",
    registered: 0,
    maxRegistered: 5000,
    prize: "$2,000,000",
  },
  {
    id: 6,
    title: `PokerWars #6`,
    image: `/nfts/nft6.png`,
    buyIn: `$1000`,
    status: "Coming Soon",
    gameType: "No-Limit Texas Hold'em",
    dateTime: `[2025.12.30 21:00 GMT]`,
    tournamentType: "Grand Finale",
    registered: 0,
    maxRegistered: 2000,
    prize: "$1,600,000",
  },
];

// Tournament table data - synchronized with NFT carousel
export const baseTournaments: Omit<Tournament, "nft">[] = [
  {
    id: 1,
    name: "Weekly Tournament #1",
    game: "NLTH",
    date: "2025-10-03",
    creatorAvatar: "https://placehold.co/320x320.png?text=NFT",
    creator: "PokerWars",
    prize: 80,
    creatorShare: 10,
    protocolFee: 10,
    sold: 0,
    supply: 1000,
    buyIn: 25,
    bonus: 15000,
  },
  {
    id: 2,
    name: "Weekly Tournament #2",
    game: "NLTH",
    date: "2025-10-10",
    creatorAvatar: "https://placehold.co/320x320.png?text=NFT",
    creator: "PokerWars",
    prize: 80,
    creatorShare: 10,
    protocolFee: 10,
    sold: 0,
    supply: 1000,
    buyIn: 50,
    bonus: 25000,
  },
  {
    id: 3,
    name: "Weekly Tournament #3",
    game: "NLTH",
    date: "2025-10-17",
    creatorAvatar: "https://placehold.co/320x320.png?text=NFT",
    creator: "PokerWars",
    prize: 80,
    creatorShare: 10,
    protocolFee: 10,
    sold: 0,
    supply: 1000,
    buyIn: 100,
    bonus: 50000,
  },
  {
    id: 4,
    name: "Monthly Tournament #1",
    game: "NLTH",
    date: "2025-10-24",
    creatorAvatar: "https://placehold.co/320x320.png?text=NFT",
    creator: "PokerWars",
    prize: 80,
    creatorShare: 10,
    protocolFee: 10,
    sold: 0,
    supply: 5000,
    buyIn: 100,
    bonus: 100000,
  },
  {
    id: 5,
    name: "High Roller Championship",
    game: "NLTH",
    date: "2025-10-31",
    creatorAvatar: "https://placehold.co/320x320.png?text=NFT",
    creator: "PokerWars",
    prize: 80,
    creatorShare: 10,
    protocolFee: 10,
    sold: 0,
    supply: 10000,
    buyIn: 500,
    bonus: 200000,
  },
  {
    id: 6,
    name: "Elite Series",
    game: "NLTH",
    date: "2025-11-07",
    creatorAvatar: "https://placehold.co/320x320.png?text=NFT",
    creator: "PokerWars",
    prize: 80,
    creatorShare: 10,
    protocolFee: 10,
    sold: 0,
    supply: 5000,
    buyIn: 500,
    bonus: 150000,
  },
  {
    id: 7,
    name: "Grand Finale",
    date: "2025-12-30",
    game: "NLTH",
    creatorAvatar: "https://placehold.co/320x320.png?text=NFT",
    creator: "PokerWars",
    prize: 80,
    creatorShare: 10,
    protocolFee: 10,
    sold: 0,
    supply: 2000,
    buyIn: 1000,
    bonus: 500000,
  },
];

// Combined tournaments with NFT images
export const tournaments: Tournament[] = baseTournaments.map((t, i) => ({
  ...t,
  nft: trendingItems[i % trendingItems.length].image,
}));

// Utility functions for formatting
export const formatCurrency = (amount: number): string => {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  } else {
    return `$${amount}`;
  }
};

export const formatPokerBonus = (amount: number): string => {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  } else {
    return `${amount}`;
  }
};
