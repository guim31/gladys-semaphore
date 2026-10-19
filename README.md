# Semaphore UI for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that runs the templates of a self-hosted [Semaphore UI](https://semaphoreui.com/)
(Ansible, Terraform/OpenTofu, scripts) from Gladys scenes and follows their
result.

- **An allow-list**: only the templates whose numbers you type in the
  configuration are followed and can be run. Empty by default: nothing runs
  until you choose.
- **One device per allowed template**: status of the last task (succeeded,
  failed, running…), last task succeeded, running, last run and its duration.
  No command on the device: no voice assistant nor misplaced tap runs Ansible.
- **Scene triggers**: a Semaphore task succeeds, a Semaphore task fails
  (template, project, task number, duration) — for tasks started from Gladys,
  Semaphore, a schedule or anything else.
- **Scene actions**: run an allowed template, with optional extra variables,
  and optionally wait for its end (90 s at most) to use its result; stop the
  running task of a template.
- **Dashboard widget**: last status of the allowed templates, failing ones
  first, with a Run (or Stop) button for each, confirmed before it is sent.
- The output of the tasks is never read: only their status and duration.
- Texts in English, French, German and Spanish.

Tested against a real Semaphore UI 2.19.17 (Docker, SQLite): API token,
project, local repository of playbooks, templates that succeed, fail and run
long, tasks run, waited for and stopped from the integration. Not tested yet
on a real Gladys instance: feedback welcome on
[the issues](https://github.com/guim31/gladys-semaphore/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- Semaphore UI 2.x reachable from the Gladys machine, and an API token of a
  user allowed to run the templates (role "Task Runner" or more).

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-semaphore`. Then open its configuration,
enter the address of Semaphore and the API token, click **Test the
connection** to list the templates with their numbers, type the numbers of
the templates Gladys may run, and add them from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

At the chosen interval (one minute by default; every 5 seconds while a task
of an allowed template runs) the container reads the REST API of Semaphore:
the projects, then the templates of the projects holding an allowed template,
each with its last task. It publishes the states of the devices added to
Gladys when they change and fires "task succeeded" or "task failed" once per
finished task. The last task of each template is kept in `/data`, so a task
that ended during a restart is announced once. Every command checks the
allow-list again. Redirects are not followed, so the token never reaches
another host.

## Limits

- One Semaphore instance per configuration.
- Only the last task of each template is read: two tasks of the same template
  ending between two readings fire one trigger.
- Waiting for the end of a task lasts 90 s at most (a scene action of Gladys
  is cut at 120 s); the triggers report the end of longer tasks.
- Terraform confirmations, task output and templates themselves are managed
  in Semaphore, not from Gladys.
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the
Semaphore API.

## Credits

- [Semaphore UI](https://github.com/semaphoreui/semaphore) by Denis Gukov and
  contributors (MIT): this integration only talks to its REST API; the answers
  in `test/fixtures/semaphore` come from its Docker image. The cover shows its
  logo,
  [`web/public/favicon.svg`](https://github.com/semaphoreui/semaphore/blob/develop/web/public/favicon.svg)
  of its repository (MIT).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of [gladys-n8n](https://github.com/guim31/gladys-n8n).

Not affiliated with Semaphore UI or its authors.

## License

Apache-2.0, see [LICENSE](LICENSE).
