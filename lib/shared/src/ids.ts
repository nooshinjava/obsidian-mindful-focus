/** Collision-resistant, sortable identifiers ("<time>-<random>"). */
export function createId(now: number = Date.now()): string {
  const random = new Uint32Array(2);
  globalThis.crypto.getRandomValues(random);
  return `${now.toString(36)}-${Array.from(random, (part) => part.toString(36)).join("")}`;
}

export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))];
}
