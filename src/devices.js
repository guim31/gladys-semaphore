// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab: one per template of the
// allow-list (the configuration), identified by its template id. Nothing is
// proposed for a template that is not allowed.
//
//   status     text/text         status of the last task: "Succeeded",
//                                "Failed", "Running"… (configuration language)
//   succeeded  input/binary      1 when the last finished task succeeded
//                                (input/binary is green at 1)
//   running    input/binary      1 while a task of the template runs
//   last_run   text/text         start of the last task, day/month hh:mm
//   duration   duration/decimal  of the last finished task, in seconds
//
// No command: running Ansible on machines is not a switch a voice assistant
// or a misplaced tap should reach. A template is run from a scene action or
// from the widget button (which asks for confirmation).
//
// Published with should_poll: false: the integration reads Semaphore on its
// own timer (src/hub.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { FINISHED_STATUSES, RUNNING_STATUSES } from './semaphore/client.js';
import { STATUS_TEXT, formatTime, pick } from './texts.js';

export const TEMPLATE_TYPE = 'template';
export const MODEL = 'Semaphore UI';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  STATUS: 'status',
  SUCCEEDED: 'succeeded',
  RUNNING: 'running',
  LAST_RUN: 'last_run',
  DURATION: 'duration',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.STATUS]: 'Last task',
    [FEATURE_KEYS.SUCCEEDED]: 'Last task succeeded',
    [FEATURE_KEYS.RUNNING]: 'Running',
    [FEATURE_KEYS.LAST_RUN]: 'Last run',
    [FEATURE_KEYS.DURATION]: 'Last task duration',
  },
  fr: {
    [FEATURE_KEYS.STATUS]: 'Dernière tâche',
    [FEATURE_KEYS.SUCCEEDED]: 'Dernière tâche réussie',
    [FEATURE_KEYS.RUNNING]: 'En cours',
    [FEATURE_KEYS.LAST_RUN]: 'Dernier lancement',
    [FEATURE_KEYS.DURATION]: 'Durée de la dernière tâche',
  },
  de: {
    [FEATURE_KEYS.STATUS]: 'Letzte Aufgabe',
    [FEATURE_KEYS.SUCCEEDED]: 'Letzte Aufgabe erfolgreich',
    [FEATURE_KEYS.RUNNING]: 'Läuft',
    [FEATURE_KEYS.LAST_RUN]: 'Letzter Start',
    [FEATURE_KEYS.DURATION]: 'Dauer der letzten Aufgabe',
  },
  es: {
    [FEATURE_KEYS.STATUS]: 'Última tarea',
    [FEATURE_KEYS.SUCCEEDED]: 'Última tarea correcta',
    [FEATURE_KEYS.RUNNING]: 'En ejecución',
    [FEATURE_KEYS.LAST_RUN]: 'Último inicio',
    [FEATURE_KEYS.DURATION]: 'Duración de la última tarea',
  },
};

// Display bound of the duration (the core never applies it on write).
export const MAX_DURATION_S = 7 * 24 * 3600;

export const isRunning = (task) => Boolean(task && RUNNING_STATUSES.has(task.status));

/** Duration of a finished task in seconds (0.1 s), null when unknown. */
export function durationOf(task) {
  if (!task || !FINISHED_STATUSES.has(task.status) || task.start === null || task.end === null) {
    return null;
  }
  const seconds = (task.end - task.start) / 1000;
  return seconds >= 0 ? Math.round(seconds * 10) / 10 : null;
}

export const statusOf = (task) => (task ? task.status : 'never');

export const templateIds = (gladys, id) => gladys.externalIds(TEMPLATE_TYPE, String(id));

/** The template id of a device external id, null when it is not a template of ours. */
export function parseTemplateId(gladys, externalId) {
  const prefix = templateIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^[1-9]\d{0,8}$/.test(id) ? Number(id) : null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

const binary = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY, {
    keep_history: true,
    min: 0,
    max: 1,
  });

/**
 * The discovery payload of a template.
 * @param {object} template normalized (src/semaphore/client.js)
 * @param {string} [projectName]
 * @param {string} [language]
 */
export function buildTemplateDevice(gladys, template, projectName = '', language = 'en') {
  const ids = templateIds(gladys, template.id);
  const names = NAMES[language] ?? NAMES.en;
  const params = [
    { name: 'TEMPLATE_ID', value: String(template.id) },
    { name: 'PROJECT_ID', value: String(template.projectId) },
  ];
  if (projectName) {
    params.push({ name: 'PROJECT', value: projectName.slice(0, 255) });
  }
  return {
    name: template.name,
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params,
    features: [
      text(names[FEATURE_KEYS.STATUS], ids.feature(FEATURE_KEYS.STATUS)),
      binary(names[FEATURE_KEYS.SUCCEEDED], ids.feature(FEATURE_KEYS.SUCCEEDED)),
      binary(names[FEATURE_KEYS.RUNNING], ids.feature(FEATURE_KEYS.RUNNING)),
      text(names[FEATURE_KEYS.LAST_RUN], ids.feature(FEATURE_KEYS.LAST_RUN)),
      sensor(
        names[FEATURE_KEYS.DURATION],
        ids.feature(FEATURE_KEYS.DURATION),
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
        { unit: DEVICE_FEATURE_UNITS.SECONDS, keep_history: true, min: 0, max: MAX_DURATION_S },
      ),
    ],
  };
}

/**
 * The value of every feature of a template: `{ device_feature_external_id,
 * state|text }`, nothing for a value that is not known.
 * @param {object} template with `lastTask` (the last task) and `lastFinished`
 *   (the last finished one, for the success and the duration)
 */
export function templateValues(gladys, template, language) {
  const ids = templateIds(gladys, template.id);
  const last = template.lastTask;
  const finished = template.lastFinished;
  const values = [
    { key: FEATURE_KEYS.STATUS, text: pick(STATUS_TEXT[statusOf(last)], language) },
    { key: FEATURE_KEYS.RUNNING, state: isRunning(last) ? 1 : 0 },
  ];
  if (finished) {
    values.push({ key: FEATURE_KEYS.SUCCEEDED, state: finished.status === 'success' ? 1 : 0 });
  }
  const started = last?.start ?? last?.created;
  if (started) {
    values.push({ key: FEATURE_KEYS.LAST_RUN, text: formatTime(started, language) });
  }
  const duration = durationOf(finished);
  if (duration !== null) {
    values.push({ key: FEATURE_KEYS.DURATION, state: duration });
  }
  return values.map(({ key, ...value }) => ({
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}
