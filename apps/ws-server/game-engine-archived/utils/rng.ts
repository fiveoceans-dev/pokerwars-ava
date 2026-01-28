export interface RNG {
  next(): number;
}

class DefaultRNG implements RNG {
  next(): number {
    return Math.random();
  }
}

let current: RNG = new DefaultRNG();

export function setRNG(rng: RNG) {
  current = rng;
}

export function random(): number {
  return current.next();
}

export function randomInt(max: number): number {
  return Math.floor(random() * max);
}

export type { RNG as RandomGenerator };

/** Create a deterministic RNG from a string seed */
export function seededRNG(seed: string): RNG {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return {
    next() {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    },
  };
}
