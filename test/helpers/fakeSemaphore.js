// -----------------------------------------------------------------------------
// An in-memory Semaphore UI, behind the `request` seam of
// src/semaphore/client.js: the REST API as Semaphore 2.19.17 answers it
// (test/fixtures/semaphore hold the real answers this mimics: `last_task` on
// a template once it has run, 201 with a "waiting" task on a run, 204 on a
// stop, 404 for an unknown project or template, 400 for an unknown task).
// -----------------------------------------------------------------------------

export const BASE = 'http://192.0.2.10:3000';
export const TOKEN = 'semaphore_test_token';

const json = (status, value) => ({ status, body: JSON.stringify(value) });
const empty = (status) => ({ status, body: '' });
const iso = (time) => new Date(time).toISOString();

export class FakeSemaphore {
  constructor() {
    this.projects = [];
    this.templates = [];
    this.tasks = [];
    this.nextTask = 1;
    this.requests = [];
    this.down = null; // an error code: every request fails
    this.status = null; // an HTTP status: every request answers it
    this.time = Date.UTC(2026, 9, 19, 9, 0, 0);
    this.request = this.request.bind(this);
  }

  addProject(id, name) {
    this.projects.push({ id, name, created: iso(this.time), type: '' });
  }

  addTemplate(id, projectId, name) {
    this.templates.push({
      id,
      project_id: projectId,
      inventory_id: 1,
      repository_id: 1,
      environment_id: 1,
      name,
      playbook: `${name.toLowerCase().replace(/\W+/g, '-')}.yml`,
      app: 'ansible',
      tasks: 0,
    });
  }

  template(name) {
    return this.templates.find((template) => template.name === name);
  }

  /** A task of a template, as Semaphore stores it (newest last). */
  addTask(name, { status = 'running', durationMs = 5000, environment } = {}) {
    const template = this.template(name);
    this.time += 60_000;
    const task = {
      id: this.nextTask++,
      template_id: template.id,
      project_id: template.project_id,
      status,
      playbook: '',
      user_id: 1,
      created: iso(this.time),
      limit: '',
    };
    if (environment) {
      task.environment = environment;
    }
    if (status !== 'waiting') {
      task.start = iso(this.time + 1000);
    }
    if (['success', 'error', 'stopped'].includes(status)) {
      task.end = iso(this.time + 1000 + durationMs);
    }
    this.tasks.push(task);
    return task;
  }

  finish(task, status = 'success', durationMs = 5000) {
    task.status = status;
    task.start ??= iso(Date.parse(task.created) + 1000);
    task.end = iso(Date.parse(task.start) + durationMs);
  }

  lastTaskOf(template) {
    const tasks = this.tasks.filter((task) => task.template_id === template.id);
    return tasks[tasks.length - 1];
  }

  async request(url, { method = 'GET', headers = {}, body } = {}) {
    this.requests.push({ url, method, headers, body });
    if (this.down) {
      throw Object.assign(new Error('fetch failed'), { cause: { code: this.down } });
    }
    if (this.status) {
      return empty(this.status);
    }
    if (headers.authorization !== `Bearer ${TOKEN}`) {
      return empty(401);
    }
    const path = new URL(url).pathname;
    if (method === 'GET' && path === '/api/projects') {
      return json(200, this.projects);
    }
    let match = path.match(/^\/api\/project\/(\d+)\/templates$/);
    if (method === 'GET' && match) {
      const projectId = Number(match[1]);
      if (!this.projects.some((project) => project.id === projectId)) {
        return empty(404);
      }
      return json(
        200,
        this.templates
          .filter((template) => template.project_id === projectId)
          .map((template) => {
            const last = this.lastTaskOf(template);
            return last
              ? { ...template, last_task: { ...last, tpl_alias: template.name } }
              : template;
          }),
      );
    }
    match = path.match(/^\/api\/project\/(\d+)\/tasks$/);
    if (method === 'POST' && match) {
      const request = JSON.parse(body);
      const template = this.templates.find(
        (t) => t.id === request.template_id && t.project_id === Number(match[1]),
      );
      if (!template) {
        return empty(404);
      }
      const task = this.addTask(template.name, {
        status: 'waiting',
        environment: request.environment,
      });
      return json(201, { ...task, secret: '{}' });
    }
    match = path.match(/^\/api\/project\/(\d+)\/tasks\/(\d+)(\/stop)?$/);
    if (match) {
      const task = this.tasks.find(
        (t) => t.id === Number(match[2]) && t.project_id === Number(match[1]),
      );
      if (!task) {
        return empty(400);
      }
      if (method === 'POST' && match[3]) {
        if (!['success', 'error', 'stopped'].includes(task.status)) {
          this.finish(task, 'stopped');
        }
        return empty(204);
      }
      if (method === 'GET' && !match[3]) {
        return json(200, task);
      }
    }
    return empty(404);
  }
}

/** Two projects, three templates, a success and a failure already. */
export function sampleSemaphore() {
  const semaphore = new FakeSemaphore();
  semaphore.addProject(1, 'Home lab');
  semaphore.addProject(2, 'Cloud');
  semaphore.addTemplate(1, 1, 'Update servers');
  semaphore.addTemplate(2, 1, 'Nightly backup');
  semaphore.addTemplate(3, 2, 'Renew certificates');
  semaphore.addTemplate(4, 2, 'Reboot everything');
  semaphore.addTask('Update servers', { status: 'success', durationMs: 34_500 });
  semaphore.addTask('Nightly backup', { status: 'error', durationMs: 12_000 });
  return semaphore;
}
