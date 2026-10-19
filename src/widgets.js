// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `semaphore`.
//
// The use case: from the wall tablet, see whether the last runs went well and
// start one of the allowed templates (a backup, an update) without opening
// Semaphore. So the widget shows one row per followed template — the failing
// ones first, then the running ones — with the status of its last task, when
// it started and how long it took, then one button per template: "Run", or
// "Stop" while a task runs. Every such button asks for a confirmation first
// (`confirm`): a tap runs Ansible on machines.
//
// Every allowed template by default, or the ones chosen in the widget
// settings (devices added to Gladys). The figures are sent as values, not
// bound to device features: the widget works before the devices are added.
//
// Budget (8 components, 2 texts): one text when Semaphore does not answer,
// one status list, three run/stop buttons, a Refresh button (the core
// keeps four buttons at most).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { durationOf, isRunning, statusOf } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  STATUS_TEXT,
  formatTime,
  pick,
} from './texts.js';

export const ACTIONS = Object.freeze({ REFRESH: 'refresh', RUN: 'run', STOP: 'stop' });

export const MAX_ROWS = 10;
// The core keeps 4 buttons per widget: three templates and Refresh.
export const MAX_BUTTONS = 3;

export const TEXT = {
  empty: {
    en: 'No template allowed: add template ids in the configuration of the integration.',
    fr: "Aucun modèle autorisé : ajoutez des numéros de modèles dans la configuration de l'intégration.",
    de: 'Keine Vorlage erlaubt: Trage Vorlagennummern in der Konfiguration der Integration ein.',
    es: 'Ninguna plantilla permitida: añada números de plantillas en la configuración de la integración.',
  },
  run: { en: 'Run', fr: 'Lancer', de: 'Starten', es: 'Lanzar' },
  stop: { en: 'Stop', fr: 'Arrêter', de: 'Stoppen', es: 'Detener' },
  more: { en: 'Others', fr: 'Autres', de: 'Weitere', es: 'Otros' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Semaphore read again.',
    fr: 'Semaphore relu.',
    de: 'Semaphore neu gelesen.',
    es: 'Semaphore leído de nuevo.',
  },
};

// Row order: what needs attention first.
const rank = (template) => {
  const status = statusOf(template.lastTask);
  if (status === 'error' || status === 'rejected') {
    return 0;
  }
  return isRunning(template.lastTask) ? 1 : 2;
};

const ROW_STYLE = {
  success: { icon: 'check-circle', color: WIDGET_COLORS.SUCCESS },
  error: { icon: 'x-circle', color: WIDGET_COLORS.DANGER },
  rejected: { icon: 'x-circle', color: WIDGET_COLORS.DANGER },
  stopped: { icon: 'slash', color: WIDGET_COLORS.NEUTRAL },
  never: { icon: 'circle', color: WIDGET_COLORS.NEUTRAL },
};
const RUNNING_STYLE = { icon: 'play-circle', color: WIDGET_COLORS.INFO };

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** The templates the widget shows: the chosen devices, or every followed one. */
export function selectTemplates(hub, settings) {
  const chosen = [settings?.templates ?? []].flat().filter((id) => typeof id === 'string' && id);
  const all = [...hub.templates.values()];
  if (chosen.length === 0) {
    return all;
  }
  const ids = new Set(chosen);
  return all.filter((template) => ids.has(hub.externalIdOf(template)));
}

export function sortTemplates(templates) {
  return [...templates].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function rowValue(template, language) {
  const last = template.lastTask;
  const parts = [pick(STATUS_TEXT[statusOf(last)], language)];
  const started = last?.start ?? last?.created;
  if (started) {
    parts.push(formatTime(started, language));
  }
  const duration = durationOf(last);
  if (duration !== null) {
    parts.push(duration < 60 ? `${Math.round(duration)} s` : `${Math.round(duration / 60)} min`);
  }
  return parts.join(' · ');
}

async function get(hub, { settings, language = 'en' }) {
  const status = hub.connectionStatus();
  if (!hub.client) {
    return message(status.message ?? CONNECTION_TEXT.noToken, language);
  }
  if (hub.config.allowed.length === 0) {
    return message(TEXT.empty, language);
  }
  const templates = sortTemplates(selectTemplates(hub, settings));
  const components = [];
  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }

  if (templates.length > 0) {
    const shown = templates.length > MAX_ROWS ? templates.slice(0, MAX_ROWS - 1) : templates;
    const items = shown.map((template) => ({
      label: fit(template.name, 40),
      value: fit(rowValue(template, language), 40),
      ...(isRunning(template.lastTask) ? RUNNING_STYLE : ROW_STYLE[statusOf(template.lastTask)]),
    }));
    if (templates.length > shown.length) {
      items.push({
        label: pick(TEXT.more, language),
        value: `+${templates.length - shown.length}`,
        icon: 'more-horizontal',
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    components.push({ type: 'status', items });
  }

  // One button per template (the first three of the list): Stop while a task
  // runs, Run otherwise. The template id travels in the params; the key is
  // unique (the core drops a button whose key is taken).
  if (!hub.error) {
    for (const template of templates.slice(0, MAX_BUTTONS)) {
      const running = isRunning(template.lastTask);
      const verb = running ? ACTIONS.STOP : ACTIONS.RUN;
      components.push({
        type: 'button',
        label: fit(`${pick(TEXT[verb], language)} ${template.name}`, 24),
        icon: running ? 'square' : 'play',
        style: running ? 'danger' : 'secondary',
        action: { key: `${verb}_${template.id}`, params: { template: template.id }, confirm: true },
      });
    }
  }

  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.REFRESH },
  });

  // A task running moves: refresh sooner.
  const moving = hub.error || templates.some((template) => isRunning(template.lastTask));
  return { ttl_seconds: moving ? 10 : 60, components };
}

async function action(hub, { actionKey, params = {} }) {
  if (actionKey === ACTIONS.REFRESH) {
    await hub.pollNow();
    return { message: hub.error ? ERROR_TEXT[hub.error.kind] : TEXT.refreshed };
  }
  const match = /^(run|stop)_(\d{1,9})$/.exec(actionKey ?? '');
  const id = Number(params.template);
  if (!match || Number(match[2]) !== id) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  // The allow-list is checked again here: the content may predate a change.
  const template = await hub.templateOf(id);
  if (match[1] === ACTIONS.RUN) {
    await hub.run(template);
    return { message: ACTION_TEXT.launched };
  }
  const stopped = await hub.stopTask(template);
  return { message: stopped ? ACTION_TEXT.stopRequested : ACTION_TEXT.nothingRunning };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
