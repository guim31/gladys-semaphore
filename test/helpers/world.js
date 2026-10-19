// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Semaphore, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs unless asked: the tests read Semaphore with
// `world.hub.pollNow()`. (From guim31/gladys-n8n.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { templateIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { BASE, FakeSemaphore, TOKEN, sampleSemaphore } from './fakeSemaphore.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 19, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: BASE, api_token: TOKEN, templates: '1, 2, 3', language: 'en' };

export async function createWorld({
  clock = createClock(),
  semaphore = sampleSemaphore(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-semaphore-')),
  timings = { waitStepMs: 5, commandReadMs: 50 },
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: semaphore.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, semaphore, app, hub: app.hub, clock, dataDir };
}

/** External ids of the device of a template of the fake, by name. */
export const idsOf = (world, name) => templateIds(world.gladys, world.semaphore.template(name).id);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { BASE, FakeSemaphore, TOKEN, sampleSemaphore };
