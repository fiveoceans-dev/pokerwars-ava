export interface LearnSection {
  title: string;
  body: string;
  bullets?: string[];
}

export interface LearnArticle {
  id: string;
  key: string;
  anchor: string;
  href: string;
}

export const learnArticles: LearnArticle[] = [
  { id: "lesson_01", key: "poker_basics", anchor: "poker-basics", href: "/learn/poker-basics" },
  { id: "lesson_02", key: "basic_strategy", anchor: "basic-strategy", href: "/learn/basic-strategy" },
  { id: "lesson_03", key: "player_types", anchor: "player-types", href: "/learn/player-types" },
  { id: "lesson_04", key: "hand_range", anchor: "hand-range", href: "/learn/hand-range" },
  { id: "lesson_05", key: "tournament", anchor: "tournament", href: "/learn/tournament" },
];
