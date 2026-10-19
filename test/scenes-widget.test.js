import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { variablesOf } from '../src/scenes.js';
import { CONFIG, createDevices, createWorld, idsOf, sampleSemaphore } from './helpers/world.js';

const posts = (world) =>
  world.semaphore.requests.filter((r) => r.method === 'POST').map((r) => new URL(r.url).pathname);

async function captureLogs(t, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines.join('');
}

test('"Run a template": an allowed template, its task as outputs', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('run_template', {
    device: idsOf(world, 'Nightly backup').device,
  });
  assert.equal(ack.success, true, ack.error);
  const task = world.semaphore.tasks.at(-1);
  assert.deepEqual(ack.data.outputs, {
    task_id: task.id,
    finished: false,
    success: false,
    status: 'Waiting',
    duration: 0,
  });
  assert.deepEqual(posts(world), ['/api/project/1/tasks']);
  assert.deepEqual(JSON.parse(world.semaphore.requests.find((r) => r.method === 'POST').body), {
    template_id: 2,
  });
});

test('"Run a template": extra variables go to Semaphore, never to the logs', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const logs = await captureLogs(t, async () => {
    const ack = await world.fake.sceneAction('run_template', {
      device: idsOf(world, 'Update servers').device,
      variables: '{"host": "web1", "password": "hunter2-secret"}',
    });
    assert.equal(ack.success, true, ack.error);
  });
  assert.equal(
    world.semaphore.tasks.at(-1).environment,
    '{"host":"web1","password":"hunter2-secret"}',
  );
  assert.equal(logs.includes('hunter2-secret'), false);
  assert.match(logs, /Update servers: task \d+ started from Gladys/);

  for (const bad of ['[1, 2]', 'host=web1', '"text"']) {
    const ack = await world.fake.sceneAction('run_template', {
      device: idsOf(world, 'Update servers').device,
      variables: bad,
    });
    assert.equal(ack.success, false, bad);
    assert.match(ack.error, /JSON object/);
  }
  assert.equal(posts(world).length, 1, 'nothing run with variables not understood');
  assert.equal(variablesOf('  ', 'en'), null);
});

test('"Run a template" refuses a template outside the allow-list, whatever asks', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, templates: '1' } });
  t.after(() => world.app.stop());
  for (const device of [
    world.gladys.externalIds('template', '4').device,
    world.gladys.externalIds('template', '2').device,
    'semaphore-other:template:1',
    '',
  ]) {
    const ack = await world.fake.sceneAction('run_template', { device });
    assert.equal(ack.success, false, device);
    assert.match(ack.error, /not in the allowed list/);
  }
  const widget = await world.fake.widgetAction(WIDGET_KEY, 'run_4', { template: 4 }, {});
  assert.equal(widget.success, false);
  const stop = await world.fake.sceneAction('stop_task', {
    device: world.gladys.externalIds('template', '4').device,
  });
  assert.equal(stop.success, false);
  assert.deepEqual(posts(world), [], 'nothing reached Semaphore');
});

test('"Run a template" can wait for the end, and the trigger follows', async (t) => {
  const semaphore = sampleSemaphore();
  const request = semaphore.request;
  let reads = 0;
  semaphore.request = async (url, options) => {
    const answer = await request(url, options);
    if (/\/tasks\/\d+$/.test(new URL(url).pathname) && ++reads === 2) {
      semaphore.finish(semaphore.tasks.at(-1), 'error', 7000);
    }
    return answer;
  };
  const world = await createWorld({ semaphore });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('run_template', {
    device: idsOf(world, 'Update servers').device,
    wait: true,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    task_id: semaphore.tasks.at(-1).id,
    finished: true,
    success: false,
    status: 'Failed',
    duration: 7,
  });
  await world.hub.polling; // the read that follows, not awaited by the scene
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => event.key),
    ['task_failed'],
  );
});

test('"Run a template" stops waiting at the limit: the task goes on', async (t) => {
  const world = await createWorld({ timings: { waitMs: 30, waitStepMs: 10, commandReadMs: 50 } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('run_template', {
    device: idsOf(world, 'Update servers').device,
    wait: true,
  });
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.outputs.finished, false);
});

test('"Stop a Semaphore task": the running task of the template, or nothing', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const device = idsOf(world, 'Nightly backup').device;
  let ack = await world.fake.sceneAction('stop_task', { device });
  assert.deepEqual(ack.data.outputs, { stopped: false, task_id: 0 });
  assert.deepEqual(posts(world), []);

  const task = world.semaphore.addTask('Nightly backup', { status: 'running' });
  ack = await world.fake.sceneAction('stop_task', { device });
  assert.deepEqual(ack.data.outputs, { stopped: true, task_id: task.id });
  assert.deepEqual(posts(world), [`/api/project/1/tasks/${task.id}/stop`]);
  assert.equal(task.status, 'stopped');
  assert.equal(world.fake.sceneEvents.length, 0, 'a stopped task is neither success nor failure');
});

test('the scene actions answer in the language of the configuration', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, templates: '1', language: 'de' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('run_template', {
    device: world.gladys.externalIds('template', '4').device,
  });
  assert.match(ack.error, /nicht in der Liste/);
  world.semaphore.status = 403;
  const run = await world.fake.sceneAction('run_template', {
    device: idsOf(world, 'Update servers').device,
  });
  assert.equal(run.success, false);
});

test('the widget: one row and one confirmed button per template, failures first', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.semaphore.addTask('Renew certificates', { status: 'running' });
  await world.hub.pollNow();
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(ack.success, true, ack.error);
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.length <= 8);
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => row.label),
    ['Nightly backup', 'Renew certificates', 'Update servers'],
  );
  assert.match(rows[0].value, /^Failed · 19\/10,? \d\d:\d\d · 12 s$/);
  assert.match(rows[1].value, /^Running/);
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => [b.label, b.action.key, b.action.params?.template, b.action.confirm]),
    [
      ['Run Nightly backup', 'run_2', 2, true],
      ['Stop Renew certificates', 'stop_3', 3, true],
      ['Run Update servers', 'run_1', 1, true],
      ['Refresh', 'refresh', undefined, undefined],
    ],
  );
  assert.equal(content.ttl_seconds, 10, 'a task runs: refreshed sooner');
});

test('the widget buttons run and stop, the allow-list checked again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.widgetAction(WIDGET_KEY, 'run_1', { template: 1 }, {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Tâche lancée.');
  assert.deepEqual(posts(world), ['/api/project/1/tasks']);
  ack = await world.fake.widgetAction(WIDGET_KEY, 'stop_1', { template: 1 }, {});
  assert.equal(ack.data.message.en, 'Stop requested.');
  ack = await world.fake.widgetAction(WIDGET_KEY, 'stop_1', { template: 1 }, {});
  assert.equal(ack.data.message.en, 'No task of this template is running.');
  // A key and params that disagree are refused.
  ack = await world.fake.widgetAction(WIDGET_KEY, 'run_1', { template: 4 }, {});
  assert.equal(ack.success, false);
  ack = await world.fake.widgetAction(WIDGET_KEY, 'refresh', {}, {});
  assert.equal(ack.data.message.en, 'Semaphore read again.');
  // Removed from the list since the content was shown: refused.
  await world.fake.configUpdated({ ...CONFIG, templates: '2' });
  ack = await world.fake.widgetAction(WIDGET_KEY, 'run_1', { template: 1 }, {});
  assert.equal(ack.success, false);
  assert.equal(posts(world).length, 2);
});

test('the widget follows its settings, and says what to do without an allow-list', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const ack = await world.fake.widgetGet(WIDGET_KEY, {
    settings: { templates: [idsOf(world, 'Update servers').device] },
    language: 'fr',
  });
  const rows = ack.data.content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value.split(' · ')[0]]),
    [['Update servers', 'Réussi']],
  );

  const none = await createWorld({ config: { ...CONFIG, templates: '' } });
  t.after(() => none.app.stop());
  const empty = await none.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'es' });
  assert.match(empty.data.content.components[0].text, /Ninguna plantilla permitida/);

  none.semaphore.down = 'ECONNREFUSED';
  await none.fake.configUpdated({ ...CONFIG, templates: '1' });
  const down = await none.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(down.data.content.components[0].text, 'Semaphore does not answer');
  assert.deepEqual(validateWidgetContent(down.data.content), []);
});

test('the widget keeps within the four buttons the core shows', async (t) => {
  const semaphore = sampleSemaphore();
  semaphore.addTemplate(5, 2, 'Fifth');
  const world = await createWorld({ semaphore, config: { ...CONFIG, templates: '1,2,3,4,5' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.equal(buttons.length, 4);
  assert.equal(buttons.at(-1).action.key, 'refresh');
});
