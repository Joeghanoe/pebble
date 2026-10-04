# Security

Pebble holds financial data, so please report vulnerabilities privately rather than in a
public issue: use GitHub's **Report a vulnerability** button on the repository's Security
tab. Expect an acknowledgement within a week.

## The security model, in short

Every instance is single-tenant today: one ledger, one owner, no per-row scoping. What
keeps it private is two independent gates (see `fastapi/app/core/identity.py`):

1. **oauth2-proxy** signs the caller in with an OIDC provider and forwards the verified
   address as `X-Forwarded-Email`.
2. **`ALLOWED_EMAILS`** on the api re-checks that address.

Both rely on one invariant: **the api is reachable only through the proxy.** It trusts
the identity header, so anything that can reach it directly can forge one. On Railway
the api has no public domain; in `docker-compose.prod.yml` it publishes no port. A
deployment that breaks this is misconfigured, not vulnerable, but reports that make it
easy to break by accident are welcome.

## In scope

- Bypassing either gate with the documented configuration.
- Reading or changing the ledger without a session for an allowed address.
- Injection through any API input, including the raw SQL in `fastapi/app/crud.py`.
- Secrets reaching logs, the client bundle or the repository.

## Out of scope

- Instances where the api was given a public port or domain.
- Rate limits of the upstream price providers.
