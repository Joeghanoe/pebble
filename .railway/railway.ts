// Pebble's Railway project, as code.
//
// Four resources: `proxy` (oauth2-proxy, the only one with a public domain), `web`
// (nginx serving the SPA), `api` (FastAPI) and `postgres`. Applied by a human with
// `railway config plan` / `apply`; nothing here is read at deploy time.
// `.railway/README.md` is the runbook.
//
// This mirrors the WHOLE project on purpose: `railway config plan` reconciles the file
// against the live environment, so a resource missing here reads as "delete it".

import { defineRailway, github, image, postgres, preserve, project, service } from "railway/iac";

const SOURCE = { repo: "Joeghanoe/pebble", branch: "main" } as const;

// Secrets are set in the Railway dashboard and never appear in git. `preserve()`
// declares that a variable exists and must not be deleted, without naming its value.
const preserveAll = (...names: string[]): Record<string, ReturnType<typeof preserve>> =>
  Object.fromEntries(names.map((name) => [name, preserve()]));

// Ceilings, not reservations: Railway bills per minute of actual use. A cap bounds the
// blast radius of a runaway process; it saves no baseline spend.
const GB = 1024 ** 3;
const limits = (cpu: number, memoryGB: number) => ({
  limitOverride: { containers: { cpu, memoryBytes: memoryGB * GB } },
});

const REGION = { "europe-west4-drams3a": 1 } as const;

// Inputs each image is built from. Railway rebuilds a GitHub-sourced service on every
// push unless told which paths matter, so keep these lists honest when a Dockerfile
// grows a COPY.
const WATCH = {
  api: ["fastapi/app/**", "fastapi/pyproject.toml", "fastapi/uv.lock", "fastapi/alembic.ini", "infra/api.Dockerfile", ".dockerignore"],
  web: ["frontend/**", "!frontend/node_modules/**", "infra/web.Dockerfile", "infra/web.nginx.conf.template", ".dockerignore"],
};

export default defineRailway(() => {
  // Railway's managed Postgres, not a bare `postgres:17` image. That is what gets the
  // dashboard's data explorer (the service's Data tab), managed backups and the
  // connect string — worth more here than the ability to pin the image ourselves.
  //
  // Capitalised because that is what Railway's Postgres template names the service, and
  // the name is what `${{Postgres.DATABASE_URL}}` resolves against. A service cannot be
  // renamed after it deploys, so the file matches the project rather than the reverse.
  const db = postgres("Postgres");

  // Serves the built SPA. No public domain: it is only reachable through the proxy.
  const web = service("web", {
    source: github(SOURCE.repo, { branch: SOURCE.branch, checkSuites: false }),
    build: { builder: "DOCKERFILE", dockerfilePath: "infra/web.Dockerfile", watchPatterns: WATCH.web },
    healthcheck: "/",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5, ...limits(1, 0.5) },
    replicas: REGION,
    env: { PORT: "8080" },
  });

  // FastAPI. No public domain either: it trusts the identity header oauth2-proxy sets,
  // so it must never be reachable from anywhere else. Give it a public domain and
  // anyone can forge X-Forwarded-Email. See fastapi/app/core/identity.py.
  const api = service("api", {
    source: github(SOURCE.repo, { branch: SOURCE.branch, checkSuites: false }),
    build: { builder: "DOCKERFILE", dockerfilePath: "infra/api.Dockerfile", watchPatterns: WATCH.api },
    // Served by app.serve on a dual-stack socket. A v6-only listener (which is what
    // `uvicorn --host ::` gives you) passes private-network traffic and fails this
    // probe, so the deploy looks healthy in the logs and never goes live.
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5, ...limits(1, 1) },
    replicas: REGION,
    env: {
      PORT: "8080",
      DATABASE_URL: db.env.DATABASE_URL,
      // The API runs Alembic migrations on startup. It is the only writer of the schema.
      MIGRATE_ON_STARTUP: "true",
      // Second gate. Pebble is single-tenant: the proxy decides who gets a session and
      // this decides whose session the API will serve, so widening one does not by
      // itself hand over the portfolio. Deliberately a code change rather than a
      // dashboard click — who can read the ledger is worth reviewing.
      ALLOWED_EMAILS: "joeghanoe@gmail.com",
      REQUIRE_PROXY_IDENTITY: "true",
      // Optional. Lifts CoinGecko's anonymous rate limit for crypto prices; Stooq,
      // Yahoo and Frankfurter need no key. Without it price refreshes still work and
      // just get throttled harder.
      ...preserveAll("COINGECKO_API_KEY"),
    },
  });

  // oauth2-proxy in front of everything. Google OIDC; forwards `X-Forwarded-Email`
  // upstream. `/api/*` goes to the API, everything else to the SPA. Give THIS service
  // the public domain and put that domain in OAUTH2_PROXY_REDIRECT_URL
  // (https://<domain>/oauth2/callback).
  const proxy = service("proxy", {
    source: image("quay.io/oauth2-proxy/oauth2-proxy:v7.14.2"),
    healthcheck: "/ping",
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 5, ...limits(1, 0.5) },
    replicas: REGION,
    env: {
      OAUTH2_PROXY_PROVIDER: "google",
      // Dual-stack bind: Railway's private network and public edge both reach it.
      OAUTH2_PROXY_HTTP_ADDRESS: "[::]:8080",
      OAUTH2_PROXY_REVERSE_PROXY: "true",
      OAUTH2_PROXY_UPSTREAMS: `http://\${{web.RAILWAY_PRIVATE_DOMAIN}}:8080/,http://\${{api.RAILWAY_PRIVATE_DOMAIN}}:8080/api/`,
      // pass-user-headers is what reaches the API (X-Forwarded-Email etc.).
      // set-xauthrequest would only add response headers for the browser and is
      // deliberately off.
      OAUTH2_PROXY_PASS_USER_HEADERS: "true",
      OAUTH2_PROXY_PASS_ACCESS_TOKEN: "false",
      // Never set prefer-email-to-user here: it moves the email into X-Forwarded-User
      // and drops X-Forwarded-Email, which is the header the API keys identity on.
      OAUTH2_PROXY_SKIP_PROVIDER_BUTTON: "true",
      OAUTH2_PROXY_COOKIE_SECURE: "true",
      OAUTH2_PROXY_COOKIE_SAMESITE: "lax",
      // A phone should not have to sign in every week just to check a balance.
      OAUTH2_PROXY_COOKIE_EXPIRE: "720h",
      OAUTH2_PROXY_COOKIE_REFRESH: "1h",
      // Any Google account may obtain a SESSION here; `ALLOWED_EMAILS` on the api is
      // what decides whose session is served. oauth2-proxy can restrict to a list of
      // addresses only through `--authenticated-emails-file`, and there is no file to
      // mount into a stock image, so `*` is the honest setting rather than a
      // domain that would read as a restriction while admitting every gmail user.
      //
      // Narrow the first gate in Google Cloud Console instead: leave the OAuth consent
      // screen in Testing with your address as the only test user, and Google refuses
      // everyone else before oauth2-proxy is ever asked. See README.md.
      OAUTH2_PROXY_EMAIL_DOMAINS: "*",
      ...preserveAll(
        "OAUTH2_PROXY_CLIENT_ID",
        "OAUTH2_PROXY_CLIENT_SECRET",
        "OAUTH2_PROXY_COOKIE_SECRET",
        "OAUTH2_PROXY_REDIRECT_URL",
      ),
    },
  });

  return project("Pebble", { resources: [db, web, api, proxy] });
});
