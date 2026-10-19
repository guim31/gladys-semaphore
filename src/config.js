// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Semaphore UI instance: its address, an API token (created in the user
// menu of Semaphore, "API tokens") and the allow-list of the templates Gladys
// may run, by id. Nothing is allowed by default.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

// The port Semaphore listens on by default: added to a bare host typed without one.
export const DEFAULT_PORT = 3000;

// Templates followed and runnable, at most (one device each).
export const MAX_TEMPLATES = 50;

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  templates: '',
  poll_interval: '60',
  language: 'fr',
};

// Pages of the web interface and the API root: a URL copied from the browser
// points at one of them, the instance lives at the root (or under
// SEMAPHORE_WEB_ROOT).
const INTERFACE_PATH = /\/(project|projects|auth|api|apps|tasks|users|runners)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 3000 added), `host:port`, or a URL copied from the
 * browser (`https://semaphore.example.com/project/1/templates`). HTTP by
 * default for a bare host. A sub-path (reverse proxy) is kept.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  if (!hasScheme && !url.port) {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

/**
 * The allow-list typed by the user: template ids separated by commas, spaces
 * or semicolons (`3, 7`), `#3` accepted. Anything else is reported, never
 * guessed.
 * @returns {{ ids: number[], invalid: string[] }}
 */
export function parseTemplateIds(raw) {
  const ids = [];
  const invalid = [];
  const text = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : '';
  for (const part of text.split(/[\s,;]+/)) {
    if (!part) {
      continue;
    }
    const match = part.match(/^#?(\d{1,9})$/);
    const id = match ? Number(match[1]) : 0;
    if (id > 0) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    } else {
      invalid.push(part.slice(0, 20));
    }
  }
  return { ids: ids.slice(0, MAX_TEMPLATES), invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const pollInterval = POLL_INTERVALS.includes(String(source.poll_interval))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  const typed = text('url');
  const templates = parseTemplateIds(source.templates);
  return {
    // null: nothing typed, or not understood (see hub.connectionStatus).
    url: typed ? parseServerUrl(typed) : null,
    urlTyped: Boolean(typed),
    // A pasted token often carries a trailing space or new line.
    token: text('api_token'),
    allowed: templates.ids,
    invalidTemplates: templates.invalid,
    pollIntervalMs: Number(pollInterval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
