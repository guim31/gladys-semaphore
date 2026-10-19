// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, task statuses, the "Test the connection" report,
// scene errors, dates. Four languages, the four of the Gladys interface;
// German says "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './semaphore/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Semaphore in the configuration.',
    fr: "Saisissez l'adresse de votre Semaphore dans la configuration.",
    de: 'Gib die Adresse deines Semaphore in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Semaphore en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:3000',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:3000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:3000',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:3000',
  },
  noToken: {
    en: 'Paste a Semaphore API token in the configuration (user menu → API tokens).',
    fr: "Collez un jeton d'API Semaphore dans la configuration (menu utilisateur → API tokens).",
    de: 'Füge ein Semaphore-API-Token in der Konfiguration ein (Benutzermenü → API tokens).',
    es: 'Pegue un token de API de Semaphore en la configuración (menú de usuario → API tokens).',
  },
};

// One short explanation per error kind (src/semaphore/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Semaphore does not answer',
    fr: 'Semaphore ne répond pas',
    de: 'Semaphore antwortet nicht',
    es: 'Semaphore no responde',
  },
  [ERROR_KINDS.TIMEOUT]: {
    en: 'Semaphore did not answer in time',
    fr: "Semaphore n'a pas répondu à temps",
    de: 'Semaphore hat nicht rechtzeitig geantwortet',
    es: 'Semaphore no ha respondido a tiempo',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API token refused: create a new one in Semaphore (user menu → API tokens)',
    fr: "jeton d'API refusé : créez-en un nouveau dans Semaphore (menu utilisateur → API tokens)",
    de: 'API-Token abgelehnt: Erstelle ein neues in Semaphore (Benutzermenü → API tokens)',
    es: 'token de API rechazado: cree uno nuevo en Semaphore (menú de usuario → API tokens)',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'refused by Semaphore: this user may not run tasks in the project',
    fr: "refusé par Semaphore : cet utilisateur n'a pas le droit de lancer des tâches dans le projet",
    de: 'von Semaphore abgelehnt: Dieser Benutzer darf im Projekt keine Aufgaben starten',
    es: 'rechazado por Semaphore: este usuario no puede lanzar tareas en el proyecto',
  },
  [ERROR_KINDS.NOT_SEMAPHORE]: {
    en: 'no Semaphore API at this address',
    fr: 'aucune API Semaphore à cette adresse',
    de: 'keine Semaphore-API unter dieser Adresse',
    es: 'no hay ninguna API de Semaphore en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.NOT_FOUND]: {
    en: 'this template or task no longer exists in Semaphore',
    fr: "ce modèle ou cette tâche n'existe plus dans Semaphore",
    de: 'diese Vorlage oder Aufgabe existiert in Semaphore nicht mehr',
    es: 'esta plantilla o tarea ya no existe en Semaphore',
  },
  [ERROR_KINDS.REFUSED]: {
    en: 'refused by Semaphore',
    fr: 'refusé par Semaphore',
    de: 'von Semaphore abgelehnt',
    es: 'rechazado por Semaphore',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The status of the last task of a template, in words.
export const STATUS_TEXT = {
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  starting: { en: 'Starting', fr: 'Démarrage', de: 'Startet', es: 'Iniciando' },
  waiting_confirmation: {
    en: 'To confirm',
    fr: 'À confirmer',
    de: 'Zu bestätigen',
    es: 'Por confirmar',
  },
  confirmed: { en: 'Confirmed', fr: 'Confirmé', de: 'Bestätigt', es: 'Confirmado' },
  running: { en: 'Running', fr: 'En cours', de: 'Läuft', es: 'En ejecución' },
  stopping: { en: 'Stopping', fr: 'Arrêt en cours', de: 'Wird gestoppt', es: 'Deteniéndose' },
  success: { en: 'Succeeded', fr: 'Réussi', de: 'Erfolgreich', es: 'Correcto' },
  error: { en: 'Failed', fr: 'En échec', de: 'Fehlgeschlagen', es: 'Fallido' },
  stopped: { en: 'Stopped', fr: 'Arrêté', de: 'Gestoppt', es: 'Detenido' },
  rejected: { en: 'Rejected', fr: 'Rejeté', de: 'Abgelehnt', es: 'Rechazado' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  never: { en: 'Never run', fr: 'Jamais lancé', de: 'Nie gestartet', es: 'Nunca ejecutado' },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    visible: 'Templates visible with this token:',
    none: 'No template visible with this token.',
    allowed: 'allowed',
    missing: (ids) => `Allowed but not found: ${ids}`,
    invalid: (parts) => `Not understood in the list: ${parts}`,
    nothingAllowed: 'No template allowed yet: copy ids above into the configuration.',
  },
  fr: {
    ok: 'Connecté',
    visible: 'Modèles visibles avec ce jeton :',
    none: 'Aucun modèle visible avec ce jeton.',
    allowed: 'autorisé',
    missing: (ids) => `Autorisés mais introuvables : ${ids}`,
    invalid: (parts) => `Incompris dans la liste : ${parts}`,
    nothingAllowed: 'Aucun modèle autorisé : recopiez des numéros ci-dessus dans la configuration.',
  },
  de: {
    ok: 'Verbunden',
    visible: 'Mit diesem Token sichtbare Vorlagen:',
    none: 'Mit diesem Token ist keine Vorlage sichtbar.',
    allowed: 'erlaubt',
    missing: (ids) => `Erlaubt, aber nicht gefunden: ${ids}`,
    invalid: (parts) => `In der Liste nicht verstanden: ${parts}`,
    nothingAllowed: 'Noch keine Vorlage erlaubt: Übernimm Nummern von oben in die Konfiguration.',
  },
  es: {
    ok: 'Conectado',
    visible: 'Plantillas visibles con este token:',
    none: 'Ninguna plantilla visible con este token.',
    allowed: 'permitida',
    missing: (ids) => `Permitidas pero no encontradas: ${ids}`,
    invalid: (parts) => `No entendido en la lista: ${parts}`,
    nothingAllowed:
      'Ninguna plantilla permitida todavía: copie números de arriba en la configuración.',
  },
};

// Errors of the scene actions and of the widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  notAllowed: {
    en: 'This template is not in the allowed list of the configuration.',
    fr: "Ce modèle n'est pas dans la liste des modèles autorisés de la configuration.",
    de: 'Diese Vorlage steht nicht in der Liste der erlaubten Vorlagen der Konfiguration.',
    es: 'Esta plantilla no está en la lista de plantillas permitidas de la configuración.',
  },
  notFound: {
    en: 'This template was not found in Semaphore (deleted, or not visible with the token).',
    fr: 'Ce modèle est introuvable dans Semaphore (supprimé, ou invisible avec le jeton).',
    de: 'Diese Vorlage wurde in Semaphore nicht gefunden (gelöscht oder mit dem Token nicht sichtbar).',
    es: 'No se encuentra esta plantilla en Semaphore (eliminada, o no visible con el token).',
  },
  badVariables: {
    en: 'Extra variables not understood: a JSON object is expected, e.g. {"host": "web1"}.',
    fr: 'Variables supplémentaires incomprises : un objet JSON est attendu, ex. {"host": "web1"}.',
    de: 'Zusätzliche Variablen nicht verstanden: Ein JSON-Objekt wird erwartet, z. B. {"host": "web1"}.',
    es: 'Variables adicionales no válidas: se espera un objeto JSON, p. ej. {"host": "web1"}.',
  },
  launched: {
    en: 'Task started.',
    fr: 'Tâche lancée.',
    de: 'Aufgabe gestartet.',
    es: 'Tarea iniciada.',
  },
  stopRequested: {
    en: 'Stop requested.',
    fr: 'Arrêt demandé.',
    de: 'Stopp angefordert.',
    es: 'Detención solicitada.',
  },
  nothingRunning: {
    en: 'No task of this template is running.',
    fr: "Aucune tâche de ce modèle n'est en cours.",
    de: 'Keine Aufgabe dieser Vorlage läuft.',
    es: 'Ninguna tarea de esta plantilla está en curso.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const formats = new Map();

/**
 * A date as day/month hours:minutes, in the time zone of Gladys (the
 * supervisor injects TZ): a weekly job run six days ago is not "today".
 */
export function formatTime(time, language) {
  const locale = LOCALES[language] ?? LOCALES.en;
  if (!formats.has(locale)) {
    formats.set(
      locale,
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formats.get(locale).format(new Date(time));
}

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
