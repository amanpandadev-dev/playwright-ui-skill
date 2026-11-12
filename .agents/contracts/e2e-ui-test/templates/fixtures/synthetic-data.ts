// Deterministic synthetic test data. Dependency-free and domain-neutral:
// specialize builders per application in the generated data module; keep this file generic.
//
// Rules this module enforces by construction:
// - one committed seed per lane (setup-decisions.json lanes[].data.seed) plus the worker namespace, so values
//   are reproducible and parallel workers never collide;
// - obviously synthetic values: e-mail addresses use the reserved example.test domain, names and text carry
//   the namespace, and nothing resembles production personal data;
// - every created record is registered for teardown, removed in reverse creation order.
// Runtime only: it creates nothing by itself; seeding happens when a developer runs the tests.

export type Random = {
  next(): number; // [0, 1)
  int(min: number, max: number): number; // inclusive
  pick<T>(values: readonly T[]): T;
  bool(probability?: number): boolean;
};

// Mulberry32: small, fast and stable across Node versions, so a seed means the same data everywhere.
export function createRandom(seed: number, namespace = ''): Random {
  let state = (seed ^ hash(namespace)) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: values => {
      if (!values.length) throw new Error('pick() needs at least one value');
      return values[Math.floor(next() * values.length)];
    },
    bool: (probability = 0.5) => next() < probability,
  };
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const SYNTHETIC_EMAIL_DOMAIN = 'example.test';

export function syntheticEmail(namespace: string, label: string): string {
  const local = `${label}.${namespace}`.toLowerCase().replace(/[^a-z0-9.-]/g, '-').slice(0, 64);
  return `${local}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

const GIVEN = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley', 'Harper', 'Jordan', 'Kendall', 'Morgan', 'Parker', 'Quinn', 'Riley', 'Rowan', 'Sage', 'Taylor'];
const FAMILY = ['Testwood', 'Samplefield', 'Mockridge', 'Fixtureton', 'Seedhill', 'Stubbs', 'Draftley', 'Proofmore'];

export function syntheticPerson(random: Random, namespace: string, label = 'person') {
  const given = random.pick(GIVEN);
  const family = random.pick(FAMILY);
  return { givenName: given, familyName: family, displayName: `${given} ${family} (${namespace})`, email: syntheticEmail(namespace, `${label}-${given}`) };
}

// Text of an exact length, for boundary variants such as "19, 20, 2000 and 2001 characters".
export function textOfLength(random: Random, length: number, prefix = ''): string {
  if (length < 0) throw new Error('length must be non-negative');
  const words = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
  let out = prefix;
  while (out.length < length) out += `${out.length ? ' ' : ''}${random.pick(words)}`;
  return out.slice(0, length);
}

// Boundary lengths for an inclusive [min, max] rule: just below, at and above each bound.
export function boundaryLengths(min: number, max: number): number[] {
  return [...new Set([Math.max(0, min - 1), min, max, max + 1])];
}

// Dates relative to a fixed epoch, never "now", so assertions do not drift.
export const SYNTHETIC_EPOCH = Date.UTC(2030, 0, 1);
export function syntheticDate(offsetDays: number): Date {
  return new Date(SYNTHETIC_EPOCH + offsetDays * 86_400_000);
}

export function withNamespace(value: string, namespace: string): string {
  return `${value} [${namespace}]`;
}

// Teardown in reverse creation order; every cleanup runs even when an earlier one fails.
export class TeardownRegistry {
  private readonly steps: { label: string; run: () => Promise<void> }[] = [];

  register(label: string, run: () => Promise<void>): void {
    this.steps.push({ label, run });
  }

  get size(): number {
    return this.steps.length;
  }

  async runAll(): Promise<void> {
    const failures: string[] = [];
    while (this.steps.length) {
      const step = this.steps.pop()!;
      try {
        await step.run();
      } catch (error) {
        failures.push(`${step.label}: ${(error as Error).message}`);
      }
    }
    if (failures.length) throw new Error(`Test data cleanup failed for ${failures.length} record(s): ${failures.join('; ')}`);
  }
}
