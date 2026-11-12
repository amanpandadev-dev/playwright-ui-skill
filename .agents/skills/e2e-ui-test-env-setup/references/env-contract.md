# Environment Contract

Use an established environment-loading convention when it meets this contract. Otherwise, load
`.env.e2e` at the top of Playwright configuration with `dotenv.config({ path, override: false })` or an
equivalent guarded loader. A missing file is not an import error, and existing process variables
always win.

Maintain a tracked `.env.e2e.example`. Ignore `.env.e2e`, `.env.e2e.local`, and other value-bearing
variants while explicitly retaining the example. Secret variables contain placeholders only.

Document variables with this table in the example comments and executable README:

| Variable | Required for | Optional/Required | Example placeholder | Consumed by | Secret |
| --- | --- | --- | --- | --- | --- |

Use repository names when established; otherwise use `E2E_TARGET`, `E2E_ENVIRONMENT`,
`E2E_BASE_URL`, `E2E_API_BASE_URL`, named `E2E_<SERVICE>_BASE_URL` values, and only the identity
variables required by the selected auth flow. `E2E_TARGET` identifies where the application is hosted,
not a managed browser provider.

## Auth state and identities

Auth state is keyed by persona: `E2E_AUTH_STATE_DIR` holds `<stateKey>.json` per identity-bearing persona.
`E2E_AUTH_STATE_PATH` is documented only as the single-persona compatibility alias. Declare
`E2E_AUTH_STATE_DIR` whenever a lane has more than one identity-bearing persona, and state in the table
how many identities the confirmed scope needs and which are approved. For application development
authentication, declare one account variable per persona (for example `E2E_DEV_ACCOUNT_<PERSONA>`) with
placeholders; roles come from `setup-decisions.json`, never from the environment.

## Static validation

- Every `process.env.<NAME>` or equivalent generated reference appears in `.env.e2e.example`.
- Every example variable has a generated config, fixture, helper, suite, or workflow consumer.
- The README and example tables match names, requiredness, consumers, and secret classification.
- The loader tolerates an absent `.env.e2e` and cannot override pre-existing process values.
- No real credential, token, cookie, auth state, or production endpoint appears in example values.
- External managed-browser variables are forbidden.
- A lane with several identity-bearing personas declares `E2E_AUTH_STATE_DIR`; `check-setup.mjs verify`
  enforces this.
