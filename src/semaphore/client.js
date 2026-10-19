// -----------------------------------------------------------------------------
// Semaphore UI client: the REST API of a self-hosted Semaphore, authenticated
// by an API token of a user (`Authorization: Bearer`).
//
//   GET  /api/projects                          projects the user belongs to
//   GET  /api/project/<p>/templates             templates, each with its
//                                               `last_task` once it has run
//   POST /api/project/<p>/tasks                 run a template (`template_id`,
//                                               optional `environment`: extra
//                                               variables as a JSON string)
//   GET  /api/project/<p>/tasks/<t>             one task
//   POST /api/project/<p>/tasks/<t>/stop        stop a task (204, even when
//                                               it is already over)
//
// Checked on Semaphore 2.19.17 (test/fixtures/semaphore hold its answers).
// Task statuses: waiting, starting, waiting_confirmation, confirmed,
// running, stopping, then success, error, stopped or rejected.
//
// What is never read nor kept: the output of the tasks (the Ansible logs may
// carry secrets) and the `environment` of a task (its extra variables).
// Redirects are not followed: the token would be sent to wherever the address
// points (an http:// address redirected to https:// is reported instead).
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TIMEOUT: 'timeout', // no answer in time
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // token refused (or missing)
  FORBIDDEN: 'forbidden', // the user lacks a permission in the project
  NOT_SEMAPHORE: 'not_semaphore', // something answers, not the Semaphore API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  NOT_FOUND: 'not_found', // the template or the task no longer exists
  REFUSED: 'refused', // Semaphore refused a command, with its reason
  HTTP: 'http', // any other HTTP error
});

export class SemaphoreError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status, reason }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'SemaphoreError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// A project list or a template list stays far below this (the 256 MB of the
// sandbox too).
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

async function readCapped(response, max) {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > max) {
    await response.body?.cancel();
    throw Object.assign(new Error('Response too large'), { code: 'TOO_LARGE' });
  }
  if (!response.body) {
    return '';
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > max) {
      throw Object.assign(new Error('Response too large'), { code: 'TOO_LARGE' });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Semaphore
 * (test/helpers/fakeSemaphore.js).
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(
  url,
  { method = 'GET', headers = {}, body, timeoutMs = 10_000, maxBytes = MAX_BODY_BYTES } = {},
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: await readCapped(response, maxBytes) };
}

export const RUNNING_STATUSES = new Set([
  'waiting',
  'starting',
  'waiting_confirmation',
  'confirmed',
  'running',
  'stopping',
]);
export const FINISHED_STATUSES = new Set(['success', 'error', 'stopped', 'rejected']);

const dateOf = (value) => {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(time) && time > 0 ? time : null;
};

const positiveId = (value) => (Number.isInteger(value) && value > 0 ? value : null);

const nameOf = (value, fallback) =>
  (typeof value === 'string' && value.trim().slice(0, 255)) || fallback;

/**
 * One task, normalized: only what the integration shows. Never the
 * environment, the playbook arguments nor the user.
 */
export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = positiveId(raw.id);
  const templateId = positiveId(raw.template_id);
  const projectId = positiveId(raw.project_id);
  if (!id || !templateId || !projectId) {
    return null;
  }
  // A status this version does not know (a newer Semaphore) is neither
  // running nor finished: no fast polling nor waiting forever on it.
  const status =
    RUNNING_STATUSES.has(raw.status) || FINISHED_STATUSES.has(raw.status) ? raw.status : 'unknown';
  return {
    id,
    templateId,
    projectId,
    status,
    created: dateOf(raw.created),
    start: dateOf(raw.start),
    end: FINISHED_STATUSES.has(status) ? dateOf(raw.end) : null,
  };
}

export function normalizeProject(raw) {
  const id = positiveId(raw?.id);
  return id ? { id, name: nameOf(raw.name, `#${id}`) } : null;
}

export function normalizeTemplate(raw) {
  const id = positiveId(raw?.id);
  const projectId = positiveId(raw?.project_id);
  if (!id || !projectId) {
    return null;
  }
  const last = normalizeTask(raw.last_task);
  return {
    id,
    projectId,
    name: nameOf(raw.name, `#${id}`),
    app: typeof raw.app === 'string' ? raw.app.slice(0, 40) : '',
    lastTask: last && last.templateId === id ? last : null,
  };
}

const parse = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

/** A short reason from an error answer of Semaphore (`{"error": "…"}`). */
export function reasonOf(body, max = 150) {
  const data = parse(body);
  const text = typeof data?.error === 'string' ? data.error : '';
  const line = text.split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export class SemaphoreClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} options.token API token of a user
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, token, request = httpRequest, timeoutMs = 10_000 }) {
    this.url = url;
    this.token = token;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  async call(path, { method = 'GET', body } = {}) {
    const headers = { authorization: `Bearer ${this.token}`, accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    try {
      return await this.request(`${this.url}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new SemaphoreError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      if (err.name === 'TimeoutError' || code === 23) {
        throw new SemaphoreError(ERROR_KINDS.TIMEOUT, 'No answer in time');
      }
      throw new SemaphoreError(ERROR_KINDS.UNREACHABLE, String(code ?? err.name ?? err.message));
    }
  }

  check(response, { command = false } = {}) {
    const { status } = response;
    if (status >= 200 && status < 300) {
      return;
    }
    const reason = reasonOf(response.body);
    if (status === 401) {
      throw new SemaphoreError(ERROR_KINDS.AUTH, `Token refused (HTTP ${status})`, { status });
    }
    if (status === 403) {
      throw new SemaphoreError(ERROR_KINDS.FORBIDDEN, `Forbidden (HTTP 403)`, { status, reason });
    }
    if (status >= 300 && status < 400) {
      throw new SemaphoreError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    // Semaphore answers 404 for an unknown project or template, 400 for an
    // unknown task.
    if (command && (status === 404 || (status === 400 && !reason))) {
      throw new SemaphoreError(ERROR_KINDS.NOT_FOUND, `Not found (HTTP ${status})`, { status });
    }
    if (status === 404) {
      throw new SemaphoreError(ERROR_KINDS.NOT_SEMAPHORE, 'No Semaphore API here (HTTP 404)', {
        status,
      });
    }
    if (command && status >= 400 && status < 500 && reason) {
      throw new SemaphoreError(ERROR_KINDS.REFUSED, `Refused (HTTP ${status}: ${reason})`, {
        status,
        reason,
      });
    }
    throw new SemaphoreError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
  }

  async getJson(path, options) {
    const response = await this.call(path);
    this.check(response, options);
    const data = parse(response.body);
    if (!data || typeof data !== 'object') {
      throw new SemaphoreError(ERROR_KINDS.NOT_SEMAPHORE, 'The answer is not the Semaphore API');
    }
    return data;
  }

  async list(path, normalize, options) {
    const data = await this.getJson(path, options);
    if (!Array.isArray(data)) {
      throw new SemaphoreError(ERROR_KINDS.NOT_SEMAPHORE, 'The answer is not a Semaphore list');
    }
    return data.map(normalize).filter(Boolean);
  }

  projects() {
    return this.list('/projects', normalizeProject);
  }

  /** The templates of a project, with their last task. */
  templates(projectId) {
    return this.list(`/project/${projectId}/templates`, normalizeTemplate, { command: true });
  }

  async task(projectId, taskId) {
    const task = normalizeTask(
      await this.getJson(`/project/${projectId}/tasks/${taskId}`, { command: true }),
    );
    if (!task) {
      throw new SemaphoreError(ERROR_KINDS.NOT_SEMAPHORE, 'The answer is not a Semaphore task');
    }
    return task;
  }

  /**
   * Run a template.
   * @param {number} projectId
   * @param {number} templateId
   * @param {object|null} [variables] extra variables (the task `environment`)
   * @returns {Promise<object>} the task created, normalized
   */
  async run(projectId, templateId, variables = null) {
    const body = { template_id: templateId };
    if (variables && Object.keys(variables).length > 0) {
      body.environment = JSON.stringify(variables);
    }
    const response = await this.call(`/project/${projectId}/tasks`, { method: 'POST', body });
    this.check(response, { command: true });
    const task = normalizeTask(parse(response.body));
    if (!task) {
      throw new SemaphoreError(ERROR_KINDS.NOT_SEMAPHORE, 'The answer is not a Semaphore task');
    }
    return task;
  }

  async stop(projectId, taskId) {
    const response = await this.call(`/project/${projectId}/tasks/${taskId}/stop`, {
      method: 'POST',
      body: {},
    });
    this.check(response, { command: true });
  }
}
