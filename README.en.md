# CertRelay

[简体中文](README.md) · [English](README.en.md)

Lightweight SSL/TLS certificate management and distribution for your own servers.

One central server issues, renews, and manages certificates. Agents download only the certificates they are authorized to use. Cloudflare / Alibaba Cloud DNS credentials stay on the central server, instead of being copied to every small machine.

> This is an early-stage project. Core behavior has automated tests, but the installer has not completed end-to-end validation on a fresh Linux/systemd system. It is not a universally verified, one-command production deployment.

## Features

- Let's Encrypt issuance through ACME DNS-01, with Cloudflare and Alibaba Cloud DNS support.
- A certificate covering both the apex and its first-level wildcard, such as `example.com` and `*.example.com`.
- Scheduled renewal on the server and periodic updates on agents.
- Per-agent certificate authorization and revocable agent identities.
- Enrollment links and verification codes that expire after ten minutes and permit one successful enrollment.
- Configuration checks, Nginx reload, and local TLS verification after installation; rollback is attempted if activation fails.
- A Chinese-language web console for DNS credentials, certificates, agents, and distribution records.
- Built-in Node.js modules, with no runtime npm dependencies, database, or Docker requirement.

Agents run as scheduled jobs and exit after synchronization. Memory use and compatibility on 512MB ARM devices have not been measured; support for all older devices is not guaranteed.

## How it works

```text
Cloudflare / Alibaba Cloud DNS
          ↑ DNS-01 validation
CertRelay server: issue → renew → encrypted storage
          ↓ HTTPS, per-agent authorization
CertRelay agent: pull → install → reload Nginx → verify
```

DNS credentials remain on the central server. Agents serving HTTPS must still hold the certificate private key. Enrollment establishes possession of an agent token, not an uncloneable hardware identity.

## Version status

As of November 3, 2026:

| Source | Version | Status |
| --- | --- | --- |
| Public npm | `0.3.0` | Published; includes server, agent, and installer commands |
| This repository | `0.3.1` | Development version; not published to npm; adds unified password and path commands |

Updating this repository does not upgrade deployed servers. Do not rerun the installer over an existing production deployment as an upgrade strategy.

## Requirements

- **Node.js 20 or newer** and npm. Choose a supported Node.js version compatible with your operating system and architecture.
- Production issuance and installation target **Linux + systemd**.
- Server: a domain, a working HTTPS endpoint, access to ACME/DNS APIs, and an executable acme.sh installation with its required shell, curl, openssl, and other tools.
- Agent: HTTPS access to the server, a prepared Nginx/application site, and appropriate configuration-check, reload, and TLS-probe settings.
- DNS credentials with the required permissions. Select the provider that actually hosts your DNS, not your server provider.

The npm package does not install Node.js, Nginx, or acme.sh, and does not configure DNS, application proxies, or initial HTTPS bootstrapping.

## Installation and first use

### 1. Install the published CLI

```bash
npm install -g certrelay@0.3.0
certrelay --help
```

A single package contains both server and agent code. Run only the role needed on each machine. Installing production services requires root or sudo.

Inspect the installation plan first:

```bash
certrelay install-server --public-url https://certs.example.com --dry-run
certrelay install-agent --dry-run
```

Dry-run does not install or start services. Read the [installation guide](docs/INSTALL.md) before actual installation, especially the initial HTTPS and existing-deployment limitations. Supporting guides are currently in Chinese.

### 2. Configure the server

1. Install and start the service, choose an administrator password, and prepare HTTPS for the console.
2. Set an ACME email under Settings and add a Cloudflare Token or Alibaba Cloud AccessKey under DNS Credentials.
3. Add an apex domain such as `example.com` under Certificates, with automatic renewal enabled.
4. Staging can be used to check configuration. Turn staging off and successfully issue a production certificate before distribution.
5. Create an agent invitation and select the certificates that agent may download.

### 3. Enroll and synchronize an agent

On a new agent whose service and configuration have already been prepared by the installer:

```bash
certrelay-agent enroll --identity /etc/certrelay-agent/identity.json
```

Paste the invitation link and enter the verification code when prompted. The CLI has no preconfigured server address: it saves the address and identity only after a validated exchange. Existing agents do not need to enroll again.

If installation and enrollment were separate steps, enable the timer:

```bash
systemctl enable --now certrelay-agent.timer
systemctl start certrelay-agent.service
journalctl -u certrelay-agent.service -n 30 --no-pager
```

Confirm production issuance, authorization, and an `installed` or `verified` result. An online agent is not proof that its certificate has been installed.

### 4. Configure Nginx

After successful synchronization, the default files are:

```text
/etc/certrelay-certs/example.com/current/fullchain.pem
/etc/certrelay-certs/example.com/current/privkey.pem
```

Replace `example.com` with the certificate's apex domain, without `*.`. Internationalized domains use the `xn--` ASCII form. Custom paths are determined by the agent's `/etc/certrelay-agent/config.json`.

Nginx configuration:

```nginx
ssl_certificate /etc/certrelay-certs/example.com/current/fullchain.pem;
ssl_certificate_key /etc/certrelay-certs/example.com/current/privkey.pem;
```

Initial installation needs HTTPS bootstrapping: do not point Nginx at files that do not exist yet. Use an existing certificate or a suitable bootstrap site to complete the first installation and transition. The installer does not manage application-site configuration.

After the first successful verification, renewal and synchronization can run automatically while Nginx keeps the same `current` paths. New domains still require a certificate record, agent authorization, and site configuration.

## Administrator password and keys

You choose the console password: **14–1024 characters**, with no mandatory random symbols. Agent tokens, DNS credentials, and certificate private keys are not console passwords. They do not need to be memorized and should not be shortened.

- Know your password? Use Settings → Change Administrator Password in the console.
- Forgot it? Stop the service on the central server, reset the password, and restart.
- A password change does not replace certificates, DNS credentials, or agent identities.

After installing the repository's 0.3.1 CLI, you can use the following unified command. It is not available in npm 0.3.0:

```bash
systemctl stop certrelay
certrelay reset-password --data-dir /var/lib/certrelay
systemctl start certrelay
```

npm 0.3.0 already has separate `certrelay-init` and `certrelay-reset-password` commands. For the older version, explicitly select the existing data directory and run as the service user; see the [beginner guide](docs/BEGINNER.md).

Version 0.3.1 also lets you inspect paths on the relevant agent:

```bash
certrelay paths --domain example.com
```

This prints paths derived from configuration, not private keys. It does not confirm that the files have been installed.

## Security and maintenance

- The server stores certificates, DNS credentials, and related data encrypted in its state file. The default production directory is `/var/lib/certrelay`; source development defaults to `./data`.
- Back up `master.key` and `state.json` together, using encrypted backups. A password reset cannot recover a lost master key.
- Protect agent `identity.json` files and certificate private keys. Never commit them to Git or expose them in a web directory.
- Use HTTPS in production and keep certificate verification enabled. Grant DNS credentials only the permissions needed for issuance.
- Agents check roughly every 30 minutes by default. This is polling, not real-time push, and agents do not wait until a certificate expires.
- DNS/API failures, expired credentials, disk problems, and Nginx errors still need attention. Automated renewal does not replace backups, health checks, or troubleshooting.

## Run from source and test

This is a local development example, not a production deployment procedure. No initial `npm install` is needed because there are no runtime dependencies:

```bash
git clone https://github.com/Lyeifal/CertRelay.git
cd CertRelay
export CERTRELAY_DATA_DIR="$PWD/data"
export CERTRELAY_PUBLIC_URL="http://127.0.0.1:4173"
export CERTRELAY_ALLOW_LOCAL_HTTP=1
node scripts/certrelay.mjs init-admin
npm start
```

Open `http://127.0.0.1:4173`. Keep development data separate from production. Real ACME issuance still requires Linux and external tools.

```bash
npm run check
npm test
```

Optional real-API + DOM tests: `npm run verify:live-ui`. Supply jsdom separately or point `JSDOM_MODULE` at its entry module. Tests use temporary data and do not access real DNS accounts.

The legacy `npm run preview` prototype has no production authentication and must not be exposed publicly. Passing tests does not mean fresh Linux installations, real public ACME issuance, or every ARM device have been validated.

## Automated npm publishing

`.github/workflows/publish.yml` validates and tests a stable GitHub Release before publishing through npm Trusted Publishing. Ordinary pushes do not publish, and no long-lived npm token is needed.

First create a GitHub environment named `npm` and configure the npm trusted publisher: owner `Lyeifal`, repository `CertRelay`, workflow `publish.yml`, environment `npm`, with `npm publish` allowed. See the [publishing guide](docs/PUBLISHING.md) (Chinese). Adding the workflow does not validate the first real OIDC publication or upgrade deployed servers.

## Documentation

The supporting guides currently use Chinese:

- [Beginner guide](docs/BEGINNER.md): passwords, paths, enrollment, Nginx, and troubleshooting.
- [Installation guide](docs/INSTALL.md): prerequisites, version differences, and installer limitations.
- [Enrollment protocol](docs/ENROLLMENT.md): one-time invitations, tokens, and identity boundaries.
- [Documentation index](docs/README.md).

The public repository excludes personal server inventories, credentials, runtime state, deployment backups, and diagnostic data.
