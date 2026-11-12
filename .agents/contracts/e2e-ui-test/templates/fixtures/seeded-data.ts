import type { APIRequestContext, APIResponse } from '@playwright/test';
import { createRandom, TeardownRegistry, type Random } from './synthetic-data';

// Seeded-data fixture for dataStrategy api-seeded. Specialize from setup-decisions.json
// lanes[].data: the create interfaces, the persona that seeds each entity, and the cleanup contract.
// Records are created through the application's own API, so validation, state transitions and audit are real.
// Wire it into the shared fixture entry point, for example:
//
//   seeded: async ({ dataNamespace }, use, testInfo) => {
//     const data = new SeededData(LANE_DATA.seed, dataNamespace, contextFor, LANE_DATA.cleanup.mode);
//     await use(data);
//     await data.cleanup();
//   },
//
// where contextFor(persona) returns that persona's API request context (for example apiAs() from
// dev-auth-token.ts, or the lane's real authentication), bound to the confirmed API origin.

export type CleanupMode = 'api-delete' | 'reset-command' | 'disposable-environment' | 'none';
export type ContextFor = (persona: string) => Promise<APIRequestContext>;

export class SeededData {
  readonly random: Random;
  private readonly teardown = new TeardownRegistry();

  constructor(
    readonly seed: number,
    readonly namespace: string,
    private readonly contextFor: ContextFor,
    private readonly cleanupMode: CleanupMode,
  ) {
    this.random = createRandom(seed, namespace);
  }

  // Creates one record through an evidenced create interface and registers its removal.
  // `remove` is required for api-delete; reset-command and disposable-environment clean up outside the test.
  async create<T>(entity: string, persona: string, request: {
    path: string;
    data: unknown;
    idOf: (body: any) => string;
    remove?: (id: string) => string; // delete path for this record, for cleanup mode api-delete
  }): Promise<T & { id: string }> {
    if (this.cleanupMode === 'none') {
      throw new Error(`No cleanup contract for this lane: creating ${entity} would leave shared data behind — keep the journey Blocked; owner: application developer`);
    }
    const api = await this.contextFor(persona);
    const response: APIResponse = await api.post(request.path, { data: request.data });
    if (!response.ok()) {
      throw new Error(`Seeding ${entity} as ${persona} failed with HTTP ${response.status()}: the create contract or test data is invalid`);
    }
    const body = await response.json();
    const id = request.idOf(body);
    if (this.cleanupMode === 'api-delete') {
      if (!request.remove) throw new Error(`Seeding ${entity} needs a delete path for cleanup mode api-delete`);
      const removePath = request.remove(id);
      this.teardown.register(`${entity} ${id}`, async () => {
        const removal = await (await this.contextFor(persona)).delete(removePath);
        if (!removal.ok() && removal.status() !== 404) throw new Error(`HTTP ${removal.status()}`);
      });
    }
    return { ...body, id };
  }

  async cleanup(): Promise<void> {
    await this.teardown.runAll();
  }
}
