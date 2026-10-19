// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Run a template": runs a template of the allow-list, with optional extra
// variables, and optionally waits for its end (up to `waitMs` of the hub
// timings, within the 120 s the core grants a scene action) so the next actions know whether it
// succeeded. A longer task goes on in Semaphore: the "task succeeded / failed"
// triggers report its end.
//
// "Stop the running task": stops the task under way of a template of the
// allow-list, if any.
//
// The template is chosen among the devices of the integration (added in
// Gladys), and checked against the allow-list again here: a device whose
// template was removed from the list can no longer run anything.
// -----------------------------------------------------------------------------

import { durationOf, isRunning, statusOf } from './devices.js';
import { ACTION_TEXT, ERROR_TEXT, STATUS_TEXT, pick } from './texts.js';

/**
 * The extra variables typed in the scene: a JSON object (scene values already
 * replaced by Gladys), nothing when empty.
 * @returns {object|null} null when empty
 * @throws when it is not a JSON object
 */
export function variablesOf(raw, language) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(pick(ACTION_TEXT.badVariables, language));
  }
  return value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The outputs of "Run a template", for a task as last seen. */
function outputsOf(task, language) {
  const finished = Boolean(task) && !isRunning(task);
  return {
    task_id: task.id,
    finished,
    success: task.status === 'success',
    status: pick(STATUS_TEXT[statusOf(task)], language),
    duration: durationOf(task) ?? 0,
  };
}

export const SCENE_ACTIONS = {
  async run_template(hub, { fields = {} }) {
    const { waitMs, waitStepMs: stepMs } = hub.timings;
    // Counted from the start of the action: the run and its read are on the
    // same budget as the wait (the core cuts the action at its timeout).
    const deadline = Date.now() + waitMs;
    const language = hub.config.language;
    const template = await hub.templateOf(fields.device);
    const variables = variablesOf(fields.variables, language);
    if (Date.now() >= deadline) {
      // Semaphore was too slow to answer: better not run than run twice
      // (the core would report a timeout, and the scene could be run again).
      throw new Error(pick(ERROR_TEXT.timeout, language));
    }
    let task = await hub.run(template, variables);
    if (fields.wait === true || fields.wait === 'true') {
      while (isRunning(task) && Date.now() + stepMs <= deadline) {
        await sleep(stepMs);
        try {
          task = await hub.task(template, task.id);
        } catch {
          break; // the task goes on in Semaphore: "not finished" is the truth we know
        }
      }
      if (!isRunning(task)) {
        // The states and the triggers follow at once, without holding the scene.
        hub.pollNow().catch(() => {});
      }
    }
    return outputsOf(task, language);
  },

  async stop_task(hub, { fields = {} }) {
    const template = await hub.templateOf(fields.device);
    const task = await hub.stopTask(template);
    return { stopped: task !== null, task_id: task?.id ?? 0 };
  },
};
