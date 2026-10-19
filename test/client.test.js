// -----------------------------------------------------------------------------
// The Semaphore client against the real answers of Semaphore UI 2.19.17
// (test/fixtures/semaphore), and its errors by kind.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ERROR_KINDS,
  SemaphoreClient,
  SemaphoreError,
  normalizeTask,
  normalizeTemplate,
} from '../src/semaphore/client.js';

const fixture = async (name) =>
  readFile(new URL(`./fixtures/semaphore/${name}.json`, import.meta.url), 'utf8');

function clientAnswering(answer) {
  const requests = [];
  const client = new SemaphoreClient({
    url: 'http://192.0.2.10:3000',
    token: 'secret-token',
    request: async (url, options) => {
      requests.push({ url, ...options });
      return typeof answer === 'function' ? answer(url, options) : answer;
    },
  });
  return { client, requests };
}

test('projects and templates, with their last task, from the real answers', async () => {
  const { client, requests } = clientAnswering(async (url) => ({
    status: 200,
    body: await fixture(url.endsWith('/projects') ? 'projects' : 'templates'),
  }));
  assert.deepEqual(await client.projects(), [{ id: 1, name: 'Home lab' }]);
  const templates = await client.templates(1);
  assert.deepEqual(
    templates.map((t) => [t.id, t.name, t.lastTask?.status]),
    [
      [2, 'Broken playbook', 'error'],
      [3, 'Long job', 'stopped'],
      [1, 'Update servers', 'success'],
    ],
  );
  assert.equal(requests[0].headers.authorization, 'Bearer secret-token');
  assert.equal(requests[1].url, 'http://192.0.2.10:3000/api/project/1/templates');
});

test('a task keeps its status and dates, never its variables', async () => {
  const running = normalizeTask(JSON.parse(await fixture('task-running')));
  assert.equal(running.status, 'running');
  assert.equal(running.end, null);
  assert.equal('environment' in running, false);
  const success = normalizeTask(JSON.parse(await fixture('task-success')));
  assert.equal(success.status, 'success');
  assert.ok(success.end > success.start);
  const created = normalizeTask(JSON.parse(await fixture('task-created')));
  assert.equal(created.status, 'waiting');
  assert.equal(created.start, null);
  assert.equal(normalizeTask({ id: 'x' }), null);
  assert.equal(
    normalizeTask({ id: 1, template_id: 1, project_id: 1, status: '??' }).status,
    'waiting',
  );
  // A last task of another template is not taken.
  assert.equal(
    normalizeTemplate({ id: 1, project_id: 1, last_task: { id: 3, template_id: 2, project_id: 1 } })
      .lastTask,
    null,
  );
});

test('run: template id and extra variables as a JSON string', async () => {
  const { client, requests } = clientAnswering({
    status: 201,
    body: await fixture('task-created'),
  });
  const task = await client.run(1, 1, { delay: 20 });
  assert.equal(task.id, 5);
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].body), { template_id: 1, environment: '{"delay":20}' });
  await client.run(1, 1, {});
  assert.deepEqual(JSON.parse(requests[1].body), { template_id: 1 });
});

test('errors by kind, without the token', async () => {
  const cases = [
    [{ status: 401, body: '' }, ERROR_KINDS.AUTH],
    [{ status: 403, body: '' }, ERROR_KINDS.FORBIDDEN],
    [{ status: 302, body: '' }, ERROR_KINDS.REDIRECT],
    [{ status: 404, body: '' }, ERROR_KINDS.NOT_SEMAPHORE],
    [{ status: 500, body: '' }, ERROR_KINDS.HTTP],
    [{ status: 200, body: '<html>' }, ERROR_KINDS.NOT_SEMAPHORE],
    [{ status: 200, body: '{}' }, ERROR_KINDS.NOT_SEMAPHORE],
  ];
  for (const [answer, kind] of cases) {
    const { client } = clientAnswering(answer);
    await assert.rejects(client.projects(), (err) => {
      assert.ok(err instanceof SemaphoreError);
      assert.equal(err.kind, kind, JSON.stringify(answer));
      assert.equal(err.message.includes('secret-token'), false);
      return true;
    });
  }
  // Commands: an unknown template (404) or task (400, empty body), a refusal.
  await assert.rejects(clientAnswering({ status: 404, body: '' }).client.run(1, 99), {
    kind: ERROR_KINDS.NOT_FOUND,
  });
  await assert.rejects(clientAnswering({ status: 400, body: '' }).client.task(1, 999), {
    kind: ERROR_KINDS.NOT_FOUND,
  });
  await assert.rejects(
    clientAnswering({ status: 400, body: '{"error":"Template is not runnable"}' }).client.run(1, 1),
    { kind: ERROR_KINDS.REFUSED, reason: 'Template is not runnable' },
  );
  const network = new SemaphoreClient({
    url: 'http://192.0.2.10:3000',
    token: 't',
    request: async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    },
  });
  await assert.rejects(network.projects(), { kind: ERROR_KINDS.UNREACHABLE });
});
