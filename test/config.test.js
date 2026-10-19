import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseServerUrl, parseTemplateIds } from '../src/config.js';

test('the address: bare host, copied URL, sub-path, nothing unsafe', () => {
  assert.equal(parseServerUrl('192.0.2.10'), 'http://192.0.2.10:3000');
  assert.equal(parseServerUrl('192.0.2.10:8080'), 'http://192.0.2.10:8080');
  assert.equal(
    parseServerUrl('https://semaphore.example.com/project/1/templates/3'),
    'https://semaphore.example.com',
  );
  assert.equal(parseServerUrl('https://example.com/semaphore/'), 'https://example.com/semaphore');
  assert.equal(parseServerUrl('http://example.com/semaphore/api/'), 'http://example.com/semaphore');
  assert.equal(parseServerUrl('http://user:pass@example.com'), null);
  assert.equal(parseServerUrl('ftp://example.com'), null);
  assert.equal(parseServerUrl(''), null);
});

test('the allow-list: numbers only, anything else reported', () => {
  assert.deepEqual(parseTemplateIds('3, 7;12 #4 3'), { ids: [3, 7, 12, 4], invalid: [] });
  assert.deepEqual(parseTemplateIds('3, web, 0, -1'), { ids: [3], invalid: ['web', '0', '-1'] });
  assert.deepEqual(parseTemplateIds(''), { ids: [], invalid: [] });
  assert.deepEqual(parseTemplateIds(undefined), { ids: [], invalid: [] });
  assert.deepEqual(parseTemplateIds(5), { ids: [5], invalid: [] });
});

test('defaults: French, one minute, nothing allowed', () => {
  const config = normalizeConfig({});
  assert.equal(config.language, 'fr');
  assert.equal(config.pollIntervalMs, 60_000);
  assert.deepEqual(config.allowed, []);
  assert.equal(config.url, null);
  assert.equal(normalizeConfig({ api_token: ' abc \n' }).token, 'abc');
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 60_000);
});
