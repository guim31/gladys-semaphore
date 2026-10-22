# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.0] - 2026-10-19

### Added

- One device per allowed Semaphore UI template: status of the last task,
  last task succeeded, running, last run and duration of the last task.
- An allow-list of template numbers in the configuration: nothing can be run
  from Gladys until a template is in it.
- Scene triggers: a Semaphore task succeeds, a Semaphore task fails (template,
  project, task number, duration), for tasks started from anywhere.
- Scene actions: run an allowed template, with optional extra variables, and
  optionally wait for its end (90 s at most); stop the running task of a
  template.
- Dashboard widget: last status of the allowed templates, failing ones first,
  with a confirmed Run / Stop button for each.
- "Test the connection" lists every template the token sees, with its number.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-semaphore/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-semaphore/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/guim31/gladys-semaphore/releases/tag/v1.0.0
