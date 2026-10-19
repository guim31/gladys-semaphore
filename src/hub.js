// -----------------------------------------------------------------------------
// The Semaphore hub: the followed templates (the allow-list of the
// configuration) read on a timer of the container, their states published
// when they change, the scene events fired when one of their tasks ends, and
// the commands (run, stop) of the scene actions and of the widget.
//
// One reading: the projects, then the templates of the projects holding a
// followed template — each template carries its last task. The interval is
// the one of the configuration (60 s by default); while a task of a followed
// template runs, every `fastMs` (5 s), so its end is seen at once.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 5 minutes, beyond the fixed list of the core scheduler, and a task
// ending must fire its trigger for a template added to Gladys or not.
//
// What was seen is kept in /data (src/store.js): the last task of each
// template, so a task that ended while the integration or Gladys restarted is
// still announced, once — and never twice.
//
// Never logged nor published: the output of a task, its extra variables.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  buildTemplateDevice,
  durationOf,
  isRunning,
  parseTemplateId,
  templateIds,
  templateValues,
} from './devices.js';
import { FINISHED_STATUSES, SemaphoreClient, SemaphoreError } from './semaphore/client.js';
import { hostOf, normalizeConfig } from './config.js';
import { ProblemLog } from './problems.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'semaphore-hub' });

export const WIDGET_KEY = 'semaphore';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  SUCCEEDED: 'task_succeeded',
  FAILED: 'task_failed',
});

export const HUB_TIMINGS = {
  // Reading interval while a task of a followed template runs.
  fastMs: 5_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A command reads Semaphore again when the last read is older.
  freshMs: 10_000,
  // A command waits that long, at most, for the read that follows it.
  commandReadMs: 8_000,
  // "Run a template" waits that long, at most, from its start, for the end
  // of the task: below the 120 s timeout of the action (manifest), with room
  // for the last read (10 s at most). Read every waitStepMs meanwhile.
  waitMs: 90_000,
  waitStepMs: 3_000,
};

const MAX_TRANSPORTS_PER_REQUEST = 100;
// Lines of the "Test the connection" report, at most.
const MAX_REPORT_LINES = 30;

const summary = (task) =>
  task
    ? {
        id: task.id,
        templateId: task.templateId,
        projectId: task.projectId,
        status: task.status,
        created: task.created,
        start: task.start,
        end: task.end,
      }
    : null;

export class SemaphoreHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/semaphore/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeConfig({});
    this.client = null;
    this.signature = null;
    /** @type {Map<number, object>} followed templates found at the last read, by id */
    this.templates = new Map();
    /** @type {Map<number, string>} project names, by id */
    this.projects = new Map();
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = this.emptySaved();
    this.pollTimer = null;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  emptySaved() {
    // templates: template id → { last, finished } (task summaries, null:
    // none); initialized: a first read was done.
    return { templates: {}, initialized: false, url: null };
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      templates:
        saved.templates && typeof saved.templates === 'object' && !Array.isArray(saved.templates)
          ? saved.templates
          : {},
      initialized: saved.initialized === true,
      url: typeof saved.url === 'string' ? saved.url : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (previous.language !== config.language) {
      // New names for the Discovery tab, texts in the new language.
      this.discovered = null;
      this.gladys.forgetPublishedStates?.();
    }
    if (config.invalidTemplates.length > 0) {
      logger.warn(`Allowed templates: not understood: ${config.invalidTemplates.join(' ')}`);
    }
    const signature = JSON.stringify([config.url, config.token]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client =
        config.url && config.token
          ? new SemaphoreClient({ url: config.url, token: config.token, request: this.request })
          : null;
      this.templates = new Map();
      this.projects = new Map();
      this.readAt = 0;
      this.error = null;
      this.polling = null;
      // Another instance: what was learnt about the previous one is worthless.
      if (config.url && this.saved.url && this.saved.url !== config.url) {
        this.saved = this.emptySaved();
      }
      if (config.url) {
        this.saved.url = config.url;
      }
    }
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  /** Whether a task of a followed template runs: the timer reads faster. */
  busy() {
    return [...this.templates.values()].some((template) => isRunning(template.lastTask));
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    const delay = this.busy() ? this.timings.fastMs : this.config.pollIntervalMs;
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Semaphore works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, delay);
  }

  // --- Reading Semaphore -------------------------------------------------------

  /** Read the followed templates now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /**
   * Read after a command, so the states and the widget show it. Waited for
   * `commandReadMs` at most: a slow Semaphore does not turn a command that
   * succeeded into a scene action that timed out. The timer reads faster from
   * then on (a task runs).
   */
  async pollAfterCommand() {
    const read = (async () => {
      await this.polling?.catch(() => {});
      await this.pollNow();
      this.schedulePoll();
    })().catch((err) => logger.debug(`Read after a command failed: ${err.message}`));
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(resolve, this.timings.commandReadMs);
    });
    await Promise.race([read, late]);
    clearTimeout(timer);
  }

  /** Read again when the last read is older than `freshMs`. */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /**
   * Read Semaphore and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let result;
    try {
      result = await this.fetchAll(client);
    } catch (err) {
      if (!(err instanceof SemaphoreError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    return client === this.client && this.applySuccess(result);
  }

  /** The projects, and the followed templates found in them. */
  async fetchAll(client) {
    const projects = await client.projects();
    const allowed = new Set(this.config.allowed);
    const found = [];
    if (allowed.size > 0) {
      // The projects known to hold a followed template; every project while
      // one of them is still unknown (first read, a template moved or
      // deleted: it is then missing from the map, see applySuccess).
      const known = new Set(
        this.config.allowed.map((id) => this.templates.get(id)?.projectId).filter(Boolean),
      );
      const complete = known.size > 0 && this.config.allowed.every((id) => this.templates.has(id));
      for (const project of projects) {
        if (complete && !known.has(project.id)) {
          continue;
        }
        let templates;
        try {
          templates = await client.templates(project.id);
        } catch (err) {
          // A project the user cannot read (removed meanwhile): the others go on.
          if (err instanceof SemaphoreError && err.kind === 'not_found') {
            continue;
          }
          throw err;
        }
        found.push(...templates.filter((template) => allowed.has(template.id)));
      }
    }
    return { projects, found };
  }

  async applySuccess({ projects, found }) {
    let widgetChanged = this.error !== null || this.readAt === 0;
    if (this.error) {
      logger.info('Semaphore answers again');
    }
    this.error = null;
    this.readAt = this.now();
    this.projects = new Map(projects.map((project) => [project.id, project.name]));

    const missing = this.config.allowed.filter((id) => !found.some((t) => t.id === id));
    if (missing.length > 0) {
      this.problems.fail(
        'missing',
        `Allowed template(s) not found with this token: ${missing.join(', ')}`,
      );
    } else {
      this.problems.recover('missing', 'Every allowed template is found');
    }

    let dirty = false;
    const events = [];
    const next = new Map();
    for (const template of found) {
      const previous = this.templates.get(template.id);
      const known = template.id in this.saved.templates;
      const saved = this.saved.templates[template.id] ?? { last: null, finished: null };
      const last = template.lastTask;
      let finished = saved.finished;
      if (last && FINISHED_STATUSES.has(last.status) && last.id !== finished?.id) {
        // Only a task newer than the one kept (a restart of Semaphore with
        // another database is not an event).
        if (!finished || last.id > finished.id) {
          if (known && this.saved.initialized) {
            events.push({ template, task: last });
          }
          finished = summary(last);
        }
      }
      const entry = { last: summary(last), finished };
      if (!known || JSON.stringify(entry) !== JSON.stringify(saved)) {
        this.saved.templates[template.id] = entry;
        dirty = true;
      }
      if (
        !previous ||
        previous.name !== template.name ||
        previous.lastTask?.id !== last?.id ||
        previous.lastTask?.status !== last?.status
      ) {
        widgetChanged = true;
      }
      next.set(template.id, { ...template, lastFinished: finished });
    }
    if (next.size !== this.templates.size) {
      widgetChanged = true;
    }
    this.templates = next;
    // Templates no longer allowed (or deleted) are forgotten.
    for (const id of Object.keys(this.saved.templates)) {
      if (!this.config.allowed.includes(Number(id))) {
        delete this.saved.templates[id];
        dirty = true;
      }
    }
    if (!this.saved.initialized) {
      // The first read only sets what is known: no event for the past.
      this.saved.initialized = true;
      dirty = true;
    }
    // Written only when something changed: no wear of the SD card at every read.
    if (dirty) {
      this.store.save(this.saved);
    }
    await this.publishStates();
    for (const event of events) {
      await this.announce(event);
    }
    return widgetChanged;
  }

  /** Fire "a task succeeded" or "a task failed" (a stopped task is neither). */
  async announce({ template, task }) {
    const key =
      task.status === 'success'
        ? TRIGGERS.SUCCEEDED
        : task.status === 'error'
          ? TRIGGERS.FAILED
          : null;
    if (!key) {
      return;
    }
    const duration = durationOf(task);
    logger.info(
      `${template.name}: task ${task.id} ${task.status === 'success' ? 'succeeded' : 'failed'}`,
    );
    await this.fire(key, {
      device: templateIds(this.gladys, template.id).device,
      template: template.name,
      project: this.projects.get(template.projectId) ?? '',
      task_id: task.id,
      duration: duration ?? 0,
    });
  }

  async applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`Semaphore: ${err.message}`);
    }
    return wasError !== err.kind;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------

  externalIdOf(template) {
    return templateIds(this.gladys, template.id).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  discoveredDevices() {
    if (!this.client || this.readAt === 0 || this.error) {
      return null; // nothing read: keep the list Gladys has
    }
    return [...this.templates.values()]
      .sort((a, b) => a.id - b.id)
      .map((template) =>
        buildTemplateDevice(
          this.gladys,
          template,
          this.projects.get(template.projectId),
          this.config.language,
        ),
      );
  }

  /** Publish the Discovery list when it changed (a template allowed, renamed…). */
  async publishDevices({ force = false } = {}) {
    const devices = this.discoveredDevices() ?? (this.client ? null : []);
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Semaphore, publish the list again. */
  async rediscover() {
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /**
   * The user added (or updated) a device: its states sent before were dropped
   * by Gladys (the SDK forgets them: they go again).
   */
  async onDeviceCreated(device) {
    this.transports.delete(device.external_id);
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`).
   */
  async publishStates() {
    if (this.readAt === 0 || this.error) {
      return;
    }
    const states = [];
    for (const template of this.templates.values()) {
      if (this.isCreated(templateIds(this.gladys, template.id).device)) {
        states.push(...templateValues(this.gladys, template, this.config.language));
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local, or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = [];
    for (const id of this.config.allowed) {
      const externalId = templateIds(this.gladys, id).device;
      if (this.isCreated(externalId) && this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.urlTyped) {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands (scene actions, widget, report) --------------------------------

  /** Throws the reason Semaphore cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** An error of a command, in the language of the configuration. */
  commandError(err, language = this.config.language) {
    if (err instanceof SemaphoreError) {
      const text = pick(ERROR_TEXT[err.kind], language);
      return new Error(err.reason ? `${text} (${err.reason})` : text);
    }
    return err;
  }

  /**
   * The followed template of a template id or a device external id — the
   * guard of every command: a template outside the allow-list is refused,
   * whatever asks for it.
   */
  async templateOf(idOrExternalId, language = this.config.language) {
    const id =
      typeof idOrExternalId === 'number'
        ? idOrExternalId
        : parseTemplateId(this.gladys, idOrExternalId);
    if (!id || !this.config.allowed.includes(id)) {
      throw new Error(pick(ACTION_TEXT.notAllowed, language));
    }
    this.assertReadable();
    if (!this.templates.has(id)) {
      await this.refreshIfStale();
      this.assertReadable();
    }
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(pick(ACTION_TEXT.notFound, language));
    }
    return template;
  }

  /**
   * Run a followed template. The variables go to Semaphore only, never to
   * the logs.
   * @returns {Promise<object>} the task created
   */
  async run(template, variables = null, language = this.config.language) {
    let task;
    try {
      task = await this.client.run(template.projectId, template.id, variables);
    } catch (err) {
      throw this.commandError(err, language);
    }
    logger.info(`${template.name}: task ${task.id} started from Gladys`);
    // Seen running at once by the widget and the next read.
    const current = this.templates.get(template.id);
    if (current) {
      current.lastTask = task;
    }
    await this.pollAfterCommand();
    return task;
  }

  /** One task, read now (scene action waiting for the end). */
  async task(template, taskId, language = this.config.language) {
    try {
      return await this.client.task(template.projectId, taskId);
    } catch (err) {
      throw this.commandError(err, language);
    }
  }

  /**
   * Stop the running task of a followed template.
   * @returns {Promise<object|null>} the task stopped, null when none ran
   */
  async stopTask(template, language = this.config.language) {
    await this.pollNow();
    const last = this.templates.get(template.id)?.lastTask;
    if (!isRunning(last)) {
      return null;
    }
    try {
      await this.client.stop(template.projectId, last.id);
    } catch (err) {
      throw this.commandError(err, language);
    }
    logger.info(`${template.name}: task ${last.id} stop requested from Gladys`);
    await this.pollAfterCommand();
    return last;
  }

  /**
   * "Test the connection": every template the token sees, with its id, the
   * followed ones marked — the ids to copy into the allow-list.
   */
  async testConnection() {
    await this.pollNow({ publish: true });
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    let all;
    try {
      all = [];
      for (const [projectId] of this.projects) {
        try {
          all.push(...(await this.client.templates(projectId)));
        } catch (err) {
          if (!(err instanceof SemaphoreError && err.kind === 'not_found')) {
            throw err;
          }
        }
      }
    } catch (err) {
      return ERROR_TEXT[err.kind] ?? ERROR_TEXT.http;
    }
    all.sort((a, b) => a.id - b.id);
    const allowed = new Set(this.config.allowed);
    const missing = this.config.allowed.filter((id) => !all.some((t) => t.id === id));
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const lines = [`${text.ok} (${hostOf(this.config.url)})`];
      if (all.length === 0) {
        lines.push(text.none);
      } else {
        lines.push(text.visible);
        for (const template of all.slice(0, MAX_REPORT_LINES)) {
          const project = this.projects.get(template.projectId) ?? `#${template.projectId}`;
          const mark = allowed.has(template.id) ? ` ✓ ${text.allowed}` : '';
          lines.push(`#${template.id} ${labelled(project, template.name, language)}${mark}`);
        }
        if (all.length > MAX_REPORT_LINES) {
          lines.push(`… +${all.length - MAX_REPORT_LINES}`);
        }
      }
      if (missing.length > 0) {
        lines.push(text.missing(missing.join(', ')));
      }
      if (this.config.invalidTemplates.length > 0) {
        lines.push(text.invalid(this.config.invalidTemplates.join(' ')));
      }
      if (allowed.size === 0 && all.length > 0) {
        lines.push(text.nothingAllowed);
      }
      message[language] = lines.join('\n');
    }
    return message;
  }
}
