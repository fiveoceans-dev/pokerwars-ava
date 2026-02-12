import { useGameStore } from "./useGameStore";

export function useActiveStatus() {
  return useGameStore((state) => state.activeStatus);
}
