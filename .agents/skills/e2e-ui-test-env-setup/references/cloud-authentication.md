# Cloud Authentication Scaffolding

Generate provider-specific authentication helpers only after the developer confirms the cloud target,
endpoints, identity provider, and flow. The helpers acquire short-lived tokens only during a later
manual test run; this skill never authenticates or creates a token itself.

## Common security contract

Collect non-secret metadata only:

- identity provider and chosen flow;
- tenant/project/account/region identifiers as applicable;
- public client/application IDs;
- issuer, audience/resource, scopes, redirect URI, and test roles/personas;
- environment-variable names or secret-store references for credentials.

Never request or commit passwords, client-secret values, certificate private keys, service-account key
JSON, refresh/access/ID tokens, cookies, or storage state. Prefer workload identity, managed identity,
developer credentials, or secret-manager injection over long-lived static secrets. Never implement the
resource-owner-password/ROPC grant.

Token helpers must:

- acquire tokens only at future manual runtime;
- request the least-privilege audience/scopes required by the confirmed journeys;
- keep tokens in memory and never print token values or authorization headers;
- use expiry metadata and reacquire rather than committing a cache;
- skip with a precise reason when required environment variables or manual auth state are absent;
- attach bearer tokens only to the confirmed API origins.

## Azure and Microsoft Entra ID

For an Azure execution target, use this section for identity selection and then follow
[azure-setup.md](azure-setup.md) for concrete config, project, session, fixture, suite, and handoff
integration.

Ask for:

- Entra tenant ID or tenant domain;
- SPA/client application ID for UI sign-in, when applicable;
- API application ID URI or exposed scope/audience;
- selected user-delegated or application identity flow;
- required app roles/groups/personas;
- redirect URI and Conditional Access/MFA constraints;
- whether API access should use `DefaultAzureCredential`, managed/workload identity, certificate, or a
  client secret supplied later through the environment.

Recommended generated variables:

```text
E2E_ENTRA_TENANT_ID=
E2E_ENTRA_CLIENT_ID=
E2E_ENTRA_API_SCOPE=
E2E_ENTRA_CLIENT_SECRET=
E2E_ENTRA_CLIENT_CERTIFICATE_PATH=
E2E_AUTH_PERSONA=
E2E_AUTH_STATE_DIR=.auth/azure
```

Generate only variables needed by the selected flow. For SPA/user journeys, preserve the application's
Entra redirect and use its authorization-code-with-PKCE behavior; scaffold a manual Playwright auth
setup/storage-state flow when interactive sign-in or MFA is required. Do not automate usernames,
passwords, MFA, or Conditional Access challenges.

Inspect the application's cache location before claiming that Playwright storage state is sufficient.
Cookies and `localStorage` use normal storage state. MSAL `sessionStorage` requires an additional
ignored session snapshot restored for the confirmed application origin before app code runs. Keep one
artifact set per evidenced persona and validate the application's access-profile response after manual
sign-in. Never generate ROPC/password authentication.

For API application identity, use `@azure/identity` only when required. Generate a fixture using the
explicitly selected credential, such as `DefaultAzureCredential` or `ClientSecretCredential`, and call
`getToken()` at future manual runtime for the confirmed scope. Do not put a client secret in browser
code or use a confidential credential for SPA-origin token acquisition. Do not assume an application
token satisfies user group/app-role authorization; require evidence from requirements or source.

## AWS

Ask whether authentication uses Amazon Cognito user pools, IAM Identity Center, ALB/OIDC, API Gateway
authorizers, or a custom provider. For Cognito collect region, user-pool domain, app-client ID, callback
URL, scopes, and selected authorization-code-with-PKCE or client-credentials flow.

Use authorization code with PKCE for public/browser clients. Use client credentials only for an
explicit machine-to-machine API persona and keep the client secret in a runtime environment variable or
secret manager. Never embed AWS access keys or Cognito client secrets in browser tests or examples.

## GCP

Ask whether authentication uses Identity Platform, Identity-Aware Proxy (IAP), Google OIDC, workforce
identity, or a custom provider. Collect project ID, provider/client ID, IAP audience/client ID when
applicable, scopes, callback URL, and test principal type.

For IAP-protected programmatic API access, generate a runtime ID-token helper only for the confirmed
audience. Prefer Application Default Credentials, workload identity, or service-account impersonation;
do not create or commit service-account key files. Note that IAP user-account programmatic access has
provider limitations, so require the developer to confirm whether the journey uses a browser session or
a service identity.

## Other OIDC/OAuth providers

Collect issuer/discovery URL, authorization and token endpoints when discovery is unavailable, public
client ID, audience, scopes, redirect URI, and flow. Prefer authorization code with PKCE for browser
clients. Use an established provider SDK or standards library rather than handcrafted token exchange.

## Generated artifacts

In explicit setup mode, create only the selected provider's artifacts:

- target/environment resolver and safe `.env.e2e.example`;
- auth fixture/token provider;
- optional manual auth-setup project and ignored storage-state path;
- role/persona mapping grounded in requirements;
- manual prerequisites and variable documentation.

Do not generate all provider SDKs or helpers. In incremental mode, reuse existing auth artifacts without
modification; a provider/flow change requires a separate setup request.

## Primary provider references

- [Microsoft identity platform authorization code flow with PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Azure Identity client library for JavaScript](https://learn.microsoft.com/en-us/javascript/api/overview/azure/identity-readme)
- [Amazon Cognito authorization endpoint and PKCE](https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html)
- [Amazon Cognito token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html)
- [Google Cloud IAP programmatic authentication](https://cloud.google.com/iap/docs/authentication-howto)
- [Google Cloud Identity Platform OIDC sign-in](https://cloud.google.com/identity-platform/docs/web/oidc)
