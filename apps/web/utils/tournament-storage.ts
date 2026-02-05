const IDS_KEY = "pokerwars:registered-tournaments";
const META_KEY = "pokerwars:registered-tournaments-meta";
const META_EVENT = "tournament-meta-updated";

export type TournamentMeta = {
  registeredAt: number;
  tableId?: string;
};

export type TournamentMetaMap = Record<string, TournamentMeta>;

const notify = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(META_EVENT));
};

export const getRegisteredIds = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = window.localStorage.getItem(IDS_KEY);
    if (!stored) return new Set();
    return new Set(JSON.parse(stored) as string[]);
  } catch {
    return new Set();
  }
};

export const getRegisteredMeta = (): TournamentMetaMap => {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(META_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as TournamentMetaMap;
  } catch {
    return {};
  }
};

const setRegisteredIds = (ids: Set<string>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDS_KEY, JSON.stringify([...ids]));
};

const setRegisteredMeta = (meta: TournamentMetaMap) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(META_KEY, JSON.stringify(meta));
};

export const registerTournament = (tournamentId: string) => {
  const ids = getRegisteredIds();
  ids.add(tournamentId);
  setRegisteredIds(ids);
  const meta = getRegisteredMeta();
  meta[tournamentId] = meta[tournamentId] || { registeredAt: Date.now() };
  setRegisteredMeta(meta);
  notify();
};

export const replaceRegisteredTournaments = (ids: string[]) => {
  const unique = Array.from(new Set(ids));
  setRegisteredIds(new Set(unique));
  const meta = getRegisteredMeta();
  const nextMeta: TournamentMetaMap = {};
  unique.forEach((id) => {
    nextMeta[id] = meta[id] || { registeredAt: Date.now() };
  });
  setRegisteredMeta(nextMeta);
  notify();
};

export const unregisterTournament = (tournamentId: string) => {
  const ids = getRegisteredIds();
  ids.delete(tournamentId);
  setRegisteredIds(ids);
  const meta = getRegisteredMeta();
  delete meta[tournamentId];
  setRegisteredMeta(meta);
  notify();
};

export const rememberTournamentTable = (tournamentId: string, tableId: string) => {
  const meta = getRegisteredMeta();
  const prev = meta[tournamentId];
  meta[tournamentId] = {
    registeredAt: prev?.registeredAt ?? Date.now(),
    tableId,
  };
  setRegisteredMeta(meta);
  notify();
};

export const subscribeTournamentMeta = (handler: () => void) => {
  if (typeof window === "undefined") return () => {};
  const onStorage = (evt: StorageEvent) => {
    if (!evt.key) return;
    if (evt.key === IDS_KEY || evt.key === META_KEY) {
      handler();
    }
  };
  const onEvent = () => handler();
  window.addEventListener("storage", onStorage);
  window.addEventListener(META_EVENT, onEvent);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(META_EVENT, onEvent);
  };
};
