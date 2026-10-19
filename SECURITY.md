# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **Semaphore API token**, stored by Gladys in the integration
  configuration (never written to `/data`, never logged); it is only sent, in
  the `Authorization` header, to the configured address, and redirects are not
  followed so it never reaches another host. It acts with the rights of its
  user;
- **running templates**: only the templates whose numbers are in the
  allow-list of the configuration can be run or stopped, checked again at
  every command (scene action or widget button); the list is empty by default.
  Widget buttons ask for a confirmation; the devices carry no command;
- the **extra variables** typed in scenes: sent to Semaphore with the task,
  never logged nor stored;
- the **output of the tasks** (Ansible logs, which may hold secrets) is never
  read; only the status, the dates and the duration of a task are;
- `/data/semaphore-state.json`: the last task seen for each allowed template
  (number, status, dates) and the address of Semaphore;
- network: HTTP(S) requests to the Semaphore address, nothing else; no port is
  opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Semaphore UI itself.
