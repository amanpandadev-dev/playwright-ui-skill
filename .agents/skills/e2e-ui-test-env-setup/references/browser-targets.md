# Browser Targets

Confirm the browser during setup rather than treating a Playwright device descriptor as a brand choice.
Bundled Chromium is the fallback only when the developer accepts it or does not select another target.
An explicit browser selection becomes the primary project; add further projects only for explicitly requested
cross-browser coverage.

## Target mapping

| Developer choice | Installation/prerequisite | Config project |
| --- | --- | --- |
| Chromium/default | `npx playwright install chromium` | `Desktop Chrome` descriptor using bundled Chromium, with no branded channel |
| Microsoft Edge / Chromium Edge | Existing Microsoft Edge Stable, or explicitly authorized `npx playwright install msedge` | `Desktop Edge` with `channel: 'msedge'` |
| Google Chrome | Existing Google Chrome Stable, or explicitly authorized `npx playwright install chrome` | `Desktop Chrome` with `channel: 'chrome'` |
| Firefox | `npx playwright install firefox` | `Desktop Firefox` |
| Playwright WebKit | `npx playwright install webkit` | Playwright's patched WebKit build using the `Desktop Safari` device descriptor; not branded Safari |

`Desktop Chrome` without a channel is a device descriptor for bundled Chromium; it does not mean Google Chrome.
Likewise, Microsoft Edge is Chromium-based but is a distinct branded browser channel. Never translate an Edge
request into `Desktop Chrome`, `channel: 'chrome'`, or a project named Chrome.

## Microsoft Edge opt-in

When the developer selects Edge as the browser target, generate this primary project:

```ts
{
  name: 'Microsoft Edge',
  use: { ...devices['Desktop Edge'], channel: 'msedge' },
}
```

For a separate Azure lane in a brownfield repository, preserve the local project and use
`Microsoft Edge - Azure` for the isolated Azure project while retaining the same `Desktop Edge` and
`msedge` mapping. This is coexistence, not cross-browser expansion; do not add Chrome or bundled
Chromium to the Azure lane unless explicitly requested.

- Add `test:e2e:edge` with `playwright test --project="Microsoft Edge"` for unambiguous manual CLI use.
- Do not add bundled Chromium or Google Chrome unless the developer explicitly requests cross-browser coverage.
- If cross-browser coverage is requested, preserve every confirmed project; array order does not choose the active
  VS Code Test Explorer profile.
- Tell VS Code users to select the `Microsoft Edge` testing profile in the Playwright extension. Do not claim that
  config project order makes Edge the selected profile.
- Record that Edge respects enterprise browser policies, which can affect automated execution.

Playwright does not install branded Microsoft Edge by default. First inspect normal system locations without launching
the browser. `npx playwright install msedge` can install into the operating system's global browser location and may
replace an existing Edge installation, so run it only after explicit developer authorization. Otherwise document Edge
as a manual prerequisite.

## Installation examples

Bundled Chromium fallback:

```powershell
npx playwright install chromium
```

Explicit cross-browser engines:

```powershell
npx playwright install chromium firefox webkit
```

Explicitly authorized Microsoft Edge installation:

```powershell
npx playwright install msedge
```

Browser installation downloads binaries but must not launch a browser or execute a suite. Never verify installation
by launching Edge, Chrome, Chromium, or any other browser.

## Configuration checks

- Confirm project names, device descriptors, channels, manual scripts, documentation, and installed prerequisites agree.
- Confirm an Edge-only request has no implicit Chromium or Google Chrome project.
- Confirm the manual handoff explains how to select the `Microsoft Edge` testing profile in VS Code.
- Do not infer mobile, branded-browser, or cross-browser coverage from a general request for Playwright.
- Use the developer's exact stable/beta/dev/canary channel only when explicitly requested; otherwise use Stable.

Primary reference: [Playwright browsers](https://playwright.dev/docs/browsers).
