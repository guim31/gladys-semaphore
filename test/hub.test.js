import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import {
  BASE,
  CONFIG,
  TOKEN,
  createClock,
  createDevices,
  createWorld,
  idsOf,
  sampleSemaphore,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

test('one device per allowed template found, nothing else, nothing polled by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Update servers', 'Nightly backup', 'Renew certificates'],
  );
  assert.ok(devices.every((device) => device.should_poll === false));
  assert.equal(devices[0].external_id, idsOf(world, 'Update servers').device);
  assert.deepEqual(devices[2].params, [
    { name: 'TEMPLATE_ID', value: '3' },
    { name: 'PROJECT_ID', value: '2' },
    { name: 'PROJECT', value: 'Cloud' },
  ]);
  // No command: running Ansible is never a switch.
  assert.ok(devices.every((device) => device.features.every((f) => f.read_only === true)));
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('nothing is followed nor proposed without an allow-list', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, templates: '' } });
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.equal(world.fake.connectionStatus.connected, true);
  // Only the projects were read: no template list for nothing.
  assert.deepEqual(
    world.semaphore.requests.map((r) => new URL(r.url).pathname),
    ['/api/projects'],
  );
});

test('the states of an added device: status, success, running, last run, duration', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const ok = idsOf(world, 'Update servers');
  const broken = idsOf(world, 'Nightly backup');
  const fresh = idsOf(world, 'Renew certificates');
  assert.equal(world.fake.lastState(ok.feature('status')), 'Succeeded');
  assert.equal(world.fake.lastState(ok.feature('succeeded')), 1);
  assert.equal(world.fake.lastState(ok.feature('running')), 0);
  assert.equal(world.fake.lastState(ok.feature('duration')), 34.5);
  assert.match(world.fake.lastState(ok.feature('last_run')), /^19\/10,? \d\d:\d\d$/);
  assert.equal(world.fake.lastState(broken.feature('status')), 'Failed');
  assert.equal(world.fake.lastState(broken.feature('succeeded')), 0);
  assert.equal(world.fake.lastState(fresh.feature('status')), 'Never run');
  assert.equal(world.fake.lastState(fresh.feature('succeeded')), undefined);

  // A task starts: running, the last success and duration stay.
  const task = world.semaphore.addTask('Update servers', { status: 'running' });
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(ok.feature('status')), 'Running');
  assert.equal(world.fake.lastState(ok.feature('running')), 1);
  assert.equal(world.fake.lastState(ok.feature('succeeded')), 1);
  assert.equal(world.fake.lastState(ok.feature('duration')), 34.5);
  world.semaphore.finish(task, 'error', 8000);
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(ok.feature('status')), 'Failed');
  assert.equal(world.fake.lastState(ok.feature('running')), 0);
  assert.equal(world.fake.lastState(ok.feature('succeeded')), 0);
  assert.equal(world.fake.lastState(ok.feature('duration')), 8);
});

test('the end of a task fires its trigger once, never for the past', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read announces nothing');

  const task = world.semaphore.addTask('Nightly backup', { status: 'running' });
  await world.hub.pollNow();
  assert.equal(world.fake.sceneEvents.length, 0, 'running: nothing yet');
  world.semaphore.finish(task, 'success', 61_000);
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.SUCCEEDED), [
    {
      key: TRIGGERS.SUCCEEDED,
      data: {
        device: idsOf(world, 'Nightly backup').device,
        template: 'Nightly backup',
        project: 'Home lab',
        task_id: task.id,
        duration: 61,
      },
    },
  ]);

  // Started and failed between two reads: still seen.
  world.semaphore.addTask('Renew certificates', { status: 'error', durationMs: 3000 });
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.FAILED).length, 1);
  assert.equal(events(world, TRIGGERS.FAILED)[0].data.template, 'Renew certificates');

  // A stopped task is neither; a template outside the list fires nothing.
  world.semaphore.addTask('Update servers', { status: 'stopped' });
  world.semaphore.addTask('Reboot everything', { status: 'error' });
  await world.hub.pollNow();
  assert.equal(world.fake.sceneEvents.length, 2);
});

test('a task that ended during a restart is announced once, from /data', async (t) => {
  const first = await createWorld();
  await first.app.stop();
  const task = first.semaphore.addTask('Update servers', { status: 'error' });
  const second = await createWorld({ semaphore: first.semaphore, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second, TRIGGERS.FAILED).map((e) => e.data.task_id),
    [task.id],
  );
  await second.app.stop();
  const third = await createWorld({ semaphore: first.semaphore, dataDir: first.dataDir });
  t.after(() => third.app.stop());
  assert.equal(third.fake.sceneEvents.length, 0, 'never twice');
  const saved = JSON.parse(await readFile(`${first.dataDir}/semaphore-state.json`, 'utf8'));
  assert.equal(saved.url, BASE);
  assert.equal(JSON.stringify(saved).includes(TOKEN), false, 'no secret in /data');
});

test('a template newly allowed does not announce its past', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, templates: '1' } });
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ ...CONFIG, templates: '1, 2' });
  assert.equal(world.fake.discoveredDevices.length, 2);
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('while a task runs, the container reads every 5 s by itself, then slows down', async (t) => {
  const semaphore = sampleSemaphore();
  const task = semaphore.addTask('Update servers', { status: 'running' });
  const world = await createWorld({
    semaphore,
    timers: true,
    timings: { fastMs: 20 },
  });
  t.after(() => world.app.stop());
  const reads = () =>
    semaphore.requests.filter((r) => new URL(r.url).pathname === '/api/projects').length;
  const before = reads();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.ok(reads() - before >= 3, `fast reads while running (${reads() - before})`);
  semaphore.finish(task, 'success');
  await new Promise((resolve) => setTimeout(resolve, 60));
  const after = reads();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(reads(), after, 'back to the configured interval (60 s)');
  assert.equal(events(world, TRIGGERS.SUCCEEDED).length, 1, 'seen without onPoll');
});

test('after the first read, only the projects of the followed templates are read', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, templates: '1' } });
  t.after(() => world.app.stop());
  world.semaphore.requests.length = 0;
  await world.hub.pollNow();
  assert.deepEqual(
    world.semaphore.requests.map((r) => new URL(r.url).pathname),
    ['/api/projects', '/api/project/1/templates'],
  );
});

test('a template not found is reported, and found again when it comes back', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, templates: '1, 9' } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  const report = await world.fake.action('test_connection', {});
  assert.match(report.data.message.en, /Allowed but not found: 9/);
  world.semaphore.addTemplate(9, 2, 'New one');
  await world.hub.pollNow();
  assert.equal(world.fake.discoveredDevices.length, 2);
});

test('"Test the connection" lists every template with its number, the allowed ones marked', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, templates: '2, x', language: 'fr' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  const lines = ack.data.message.fr.split('\n');
  assert.deepEqual(lines, [
    'Connecté (192.0.2.10:3000)',
    'Modèles visibles avec ce jeton :',
    '#1 Home lab : Update servers',
    '#2 Home lab : Nightly backup ✓ autorisé',
    '#3 Cloud : Renew certificates',
    '#4 Cloud : Reboot everything',
    'Incompris dans la liste : x',
  ]);
});

test('errors: token refused, Semaphore down, then back — one log line each', async (t) => {
  const clock = createClock();
  const world = await createWorld({ clock });
  t.after(() => world.app.stop());
  await createDevices(world);
  world.semaphore.down = 'ECONNREFUSED';
  const lines = await captureLogs(t, 'info', async () => {
    await world.hub.pollNow();
    clock.advance(60_000);
    await world.hub.pollNow();
  });
  assert.equal(lines.length, 1, 'one line for an outage, not one per read');
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.en, 'Semaphore does not answer');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  world.semaphore.down = null;
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');

  await world.fake.configUpdated({ ...CONFIG, api_token: 'wrong' });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /API token refused/);
});

test('the configuration is checked before anything is read', async (t) => {
  for (const [config, message] of [
    [{}, /Enter the address/],
    [{ url: 'ftp://x' }, /Address not understood/],
    [{ url: BASE }, /Paste a Semaphore API token/],
  ]) {
    const world = await createWorld({ config });
    t.after(() => world.app.stop());
    assert.equal(world.fake.connectionStatus.connected, false);
    assert.match(world.fake.connectionStatus.message.en, message);
    assert.equal(world.semaphore.requests.length, 0);
  }
});

test('a normal reading cycle writes nothing at the info level, never a token', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const lines = await captureLogs(t, 'info', async () => {
    await world.hub.pollNow();
    world.semaphore.addTask('Update servers', { status: 'running' });
    await world.hub.pollNow();
  });
  assert.deepEqual(lines, []);
  const debug = await captureLogs(t, 'debug', () => world.hub.pollNow());
  assert.equal(debug.join('\n').includes(TOKEN), false);
});

test('adding a device publishes its states and refreshes the widget', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const before = world.fake.widgetRefreshes.length;
  await createDevices(world, (device) => device.name === 'Nightly backup');
  assert.equal(world.fake.lastState(idsOf(world, 'Nightly backup').feature('status')), 'Failed');
  assert.ok(world.fake.widgetRefreshes.slice(before).includes(WIDGET_KEY));
  assert.equal(world.fake.transports.at(-1).transport, 'local');
});
