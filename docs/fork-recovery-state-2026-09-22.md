# COS recovery state вЂ” 2026-09-22

This document records the recovery evidence and P0 hotfix state established on 2026-09-22. It is intentionally sanitized for Git: do not add tunnel IDs, tokens, local usernames, or secret values here.

## Current safe operating state

- The working application is the author's installed COS 2.1.14, not either fork A/B slot.
- Working profile: `%APPDATA%\chat-on-steroids`.
- That profile was restored from the 2026-09-17 VSS snapshot, then received only the P0 companion/runtime-state hotfixes described below.
- Expected settings were verified after restore: writable workspace, configured root(s), auto-connect, worker count, prompts, and all three tunnel configuration entries were present. Secret values are deliberately not documented here.
- Do not launch a fork build against this profile. The fork must first be changed to use its own user-data directory.

## Recovery sources and what they are for

### Primary pre-fork recovery source

`%APPDATA%\chat-on-steroids.snapshot-20260917`

- Copied from Windows VSS `HarddiskVolumeShadowCopy1`, created 2026-09-17 14:56:29 local time.
- Copy result: 626 directories, 10,922 files, 763.13 MiB, 0 failures.
- `config.json` was verified as real JSON (`7B` / `{` at byte 0), not zero-filled.
- Contains the full COS profile of that date: config, secrets, plugins, skills, sessions, state, extension, Chromium/Electron storage, etc.
- This is the preferred full-profile rollback point from before the fork work.
- Treat this directory as immutable evidence. Copy from it; do not run COS directly against it or edit it.

### 2026-09-20 VSS copy

`%APPDATA%\chat-on-steroids.snapshot-20260920`

- Copied from Windows VSS `HarddiskVolumeShadowCopy4`, created 2026-09-20 18:55:03 local time.
- Copy result: 821 directories, 14,581 files, 893.99 MiB, 0 failures.
- Important: its `config.json` is 15,061 bytes of NUL (`00`) data. It is not a safe whole-profile restore source.
- Other subtrees/files can still be useful individually, especially newer `sessions\` data. Verify each file before reuse.

### Full profile immediately before the failed clean-profile experiment

`%APPDATA%\chat-on-steroids.full-backup-20260922-134747`

- This is a complete rename/capture of the then-current profile immediately before the failed clean-profile reset on 2026-09-22.
- It already contains the runtime state associated with the P0 symptoms, so do **not** restore it wholesale as a working profile.
- Its `config.json` was read successfully before the reset and contains the then-current user settings, prompts, roots and tunnel configuration.
- It is also the best source for recent COS-local session archives through 2026-09-22 before the reset.
- Use it as a selective recovery source only.

### Intermediate profiles from the recovery attempt

- `%APPDATA%\chat-on-steroids.before-rollback-20260922-141031`
- `%APPDATA%\chat-on-steroids.pre-restore-20260922-142058`

These are intermediate states created while testing/rolling back the failed clean-profile approach. Keep them until recovery is fully settled, but they are not preferred restore sources.

### VSS access links

- `C:\ShadowCopy1_COS` -> VSS snapshot from 2026-09-17.
- `C:\ShadowCopy4_COS` -> VSS snapshot from 2026-09-20.

These are only directory links into VSS. The independent copied snapshots above are the durable recovery artifacts.

## Local session/archive strategy

Do not merge runtime state wholesale.

- Sessions through 2026-09-17: use `snapshot-20260917\sessions`.
- Sessions through 2026-09-20: `snapshot-20260920\sessions` can be used selectively even though that snapshot's `config.json` is corrupt.
- Most recent pre-reset sessions through 2026-09-22: use `full-backup-20260922-134747\sessions`.
- If newer local session history is restored later, merge/copy session directories by session id; do not replace `state\` at the same time.

## P0 #1 вЂ” Chrome "started debugging this browser" banner

### Root cause evidence

Stock author COS 2.1.14 contains automatic debugger attachment:

- `extension/active-tabs.js` calls `chrome.debugger.attach(...)`.
- `extension/background.js::maintainOnce()` derives a rendering policy from `nonDiscardableConversations` and calls `activeTabs.set('policy', ...)`.
- Therefore the banner is not unique to the fork and does not by itself prove profile corruption.

### Live hotfix

Backup of the original extension files before modification:

`%APPDATA%\chat-on-steroids-p0-hotfix-backup-20260922-143254`

It contains both the packaged (`bundled`) and stable-profile (`stable`) copies of the original `background.js` and `active-tabs.js`.

Current installed hotfix:

- `background.js` is based on upstream post-release commit `4edb395`, which contains the same-document/SPA navigation fix, with automatic active-tabs construction changed to `createActiveTabs(chrome, { enabled: false })`.
- `active-tabs.js` is the fork's disabled-lease implementation from `4f20b2f`, where `enabled:false` makes automatic lease operations no-ops.
- The two files were deployed to both:
  - `%LOCALAPPDATA%\Programs\Chat On Steroids\resources\extension\`
  - `%APPDATA%\chat-on-steroids\extension\`
- `node --check` passed on all four deployed files.
- Packaged and stable text copies were verified identical.
- Chrome's unpacked companion was manually Reloaded after deployment.
- Live result: the Chrome debugging banner disappeared.

Why both locations were patched: packaged COS refreshes/materializes the stable extension from `resources\extension` on launch, so patching only `%APPDATA%\...\extension` would be overwritten on restart.

Explicit browser-control debugger ownership remains separate; the intent is to disable only automatic rendering leases.

## P0 #2 вЂ” `Unable to display this message due to an error`

Evidence before the hotfix:

- COS sometimes recorded a turn as `completed` while ChatGPT UI showed the red error placeholder.
- The placeholder itself was not recorded as an ordinary assistant message in session message files.
- `app.log` showed the live conversation being marked `was closed deliberately; activity and automatic recovery are paused until its page returns` even though the user had not closed it.
- Upstream post-release commit `4edb395` changes extension navigation handling to prove same-document/SPA transitions instead of treating them as a departed/replaced document.

After deploying the `4edb395` navigation logic and reloading the companion:

- no new `was closed deliberately` entries were observed for the current chat after the hotfix;
- several turns completed normally;
- the error has not yet been declared permanently closed: continue normal use for several turns and reopen investigation immediately if the red placeholder returns.

## Stale `Plugin unavailable` auto-open

After reloading the companion, Chrome opened ChatGPT's plugin settings on a `Plugin unavailable` page.

The URL's `plugin_asdk_app_...` and `plugin-refresh=<uuid>` values matched the `core` row in `%APPDATA%\chat-on-steroids\state\plugin-refresh.json` exactly. This proved that COS itself was reopening a stale pending plugin refresh.

Backup before changing that state:

`%APPDATA%\chat-on-steroids\state\plugin-refresh.json.backup-20260922-143643`

Current mitigation:

- all incomplete old refresh rows were changed to `manual:true`;
- an explanatory error string was stored;
- this is a supported state in `plugin-refresh.ts`: it suppresses automatic browser reopening without pretending the refresh completed successfully.

This is only suppression of stale automatic refresh. Connector/plugin registration should be revisited deliberately later if schemas actually need republishing.

## Fork/profile architecture conclusion

The current `profile-isolation` patch is conceptually correct in the manifest but its implementation is wrong for our operational goal.

Current code in `src/main/user-data.ts` pins fork builds to `chat-on-steroids`, i.e. the **same profile as the author's installation**. That is what must never happen again.

Required architecture before the fork is launched again:

- Author COS: `%APPDATA%\chat-on-steroids`
- Fork stable: `%APPDATA%\chat-on-steroids-FORK`
- A/B or risky experiments: separate disposable test-profile clones; never the author profile and ideally not the fork stable profile either.

The fork profile may initially be seeded with user-owned configuration (config/secrets/plugin installations/skills), but runtime state must not be blindly copied from a known-bad profile.

Do not run either existing A/B slot until this isolation change is implemented, built and verified.

## Git/build state at the end of this recovery pass

- `our-release` HEAD: `4f20b2f` вЂ” `fork: disable automatic debugger rendering leases`.
- Baseline release for the clean fork stack: upstream tag `v2.1.14` (`c5ab887...`).
- Upstream `main` observed after fetch on 2026-09-22: `93573d8...`.
- Existing local A/B builds remain frozen:
  - slot A: `4f20b2f`
  - slot B: `9d62d64`
- Old broken experimental stack remains preserved on backup branch `backup/our-release-broken-20260922-1d68f3f`.

The currently running application is the author installation, not A/B.

## Hard recovery rules learned today

1. Never mutate or replace the author's working profile as part of a fork experiment.
2. Always create and verify a full recovery copy before any profile migration.
3. Treat source code, packaged extension files, stable on-disk extension files, and the *live loaded Chrome extension* as four separate states. A disk edit is not live until Chrome reloads the unpacked extension.
4. Never call a P0 fixed until the symptom is confirmed absent in a live run.
5. Do not infer that a session `turn_end: completed` means ChatGPT rendered a valid assistant message.
6. Do not restore a profile wholesale merely because directory copy succeeded; validate critical files (especially `config.json`) first.
7. Keep the author's recovery snapshots immutable; selectively recover newer data from later captures.
8. Before any further fork work, fix real profile isolation first.
## Frozen working CANON

Created after the recovery/hotfix validation:

`E:\Downloads\devspace-test\backups\COS-CANON-20260922-working`

Contents:
- `program/` — full installed author COS 2.1.14 tree after the P0 companion hotfix;
- `profile/` — full working `%APPDATA%\chat-on-steroids` profile after restore + hotfix;
- `recovery-material/` — pre-hotfix extension files and plugin-refresh state rollback material;
- `CANON-MANIFEST.md` — provenance, copy counts, caveats and recovery notes.

Copy verification:
- program: 289/289 files, FAILED=0;
- profile: 11,014/11,014 files, FAILED=0;
- copied `config.json`, stable `background.js` / `active-tabs.js`, and packaged `background.js` / `active-tabs.js` were byte-for-byte equal to the working live sources immediately after capture;
- copied config parses and retains the expected working settings shape.

This CANON is the recovery reference for the currently usable author installation. Do not use it as a writable fork profile.

## Fork profile clones created from CANON

Created on 2026-09-22 from the frozen CANON profile, not from the live author profile:

- `%APPDATA%\chat-on-steroids-FORK`
- `%APPDATA%\chat-on-steroids-FORK-slot-a`
- `%APPDATA%\chat-on-steroids-FORK-slot-b`
- `%APPDATA%\chat-on-steroids-FORK-seed`

Each profile was copied in full from `E:\Downloads\devspace-test\backups\COS-CANON-20260922-working\profile`.

Verification for every profile:
- 632 directories copied;
- 11,014 files copied;
- FAILED=0;
- `config.json` parses successfully;
- `MaxWorkers=3` retained;
- `config.json`, `state\plugin-refresh.json`, `extension\background.js`, and `extension\active-tabs.js` are byte-for-byte equal to the CANON source immediately after creation.

Operational model:
- author production profile remains `%APPDATA%\chat-on-steroids` and is never used by fork builds;
- `%APPDATA%\chat-on-steroids-FORK` is the future stable fork profile;
- slot A and slot B each have their own complete profile and must not share mutable state;
- `%APPDATA%\chat-on-steroids-FORK-seed` is the common reset/baseline source for future clean A/B comparisons;
- A and B currently carry the same connector/tunnel configuration copied from CANON. This is acceptable only because A and B are never run simultaneously. A swap must fully stop one slot before the other starts.

The rebuilt fork now selects these profiles automatically at build time:
- ordinary/stable fork -> `%APPDATA%\chat-on-steroids-FORK`;
- slot A -> `%APPDATA%\chat-on-steroids-FORK-slot-a`;
- slot B -> `%APPDATA%\chat-on-steroids-FORK-slot-b`.

## Rebuilt fork baseline and slot A preparation

On 2026-09-22 the fork stack was rebuilt from the author's merged upstream snapshot:

`93573d8` — `Merge reviewed fixes (#370)`

This baseline already includes the author's post-2.1.14 prerequisite stack, the same-document/SPA navigation fix from `4edb395`, and the author's adapted versions of our PRs #351 and #363.

The fork-specific stack above that baseline is exactly four patches:

1. `profile-isolation` — stable fork profile is isolated from the author's `%APPDATA%\chat-on-steroids`.
2. `runtime-release` — visible fork/slot identity plus slot-isolated A/B build/runtime profiles.
3. `patch-stack-tooling` — explicit baseline replay and validation.
4. `no-auto-debugger-lease` — automatic rendering leases do not attach Chrome debugger; explicit browser-control debugger ownership remains available.

Validation completed before slot activation:
- `fork:stack:verify` passes;
- focused stack suite: 115 passed / 1 skipped;
- production Electron/Vite build passes;
- no-auto-debugger boundary tests: 255/255 active-tabs + extension tests and 39/39 explicit browser-control tests passed during the rebuild;
- packaged slot validation checks fork label, slot id, exact branch/commit and the embedded slot-specific profile directory.

Slot A was built only, not launched or swapped in. During packaging the live primary process remained the author installation at `%LOCALAPPDATA%\Programs\Chat On Steroids\Chat On Steroids.exe`, and `%APPDATA%\chat-on-steroids-FORK-slot-a\config.json` retained its original length/timestamp, proving the build did not touch the slot profile.

The local `our-release` branch is the rebuilt stack. The previous `our-release @ 4f20b2f` is preserved as `backup/our-release-pre-93573d8-4f20b2f`. Do not treat stale `release-local/current.json` alone as proof that a slot is running; runtime ownership is determined from the actual executable path of the live COS process.

## Cloned plugin directory rebasing

The first live slot-A activation exposed one additional profile-clone requirement: `state\plugins.json` stores each installation generation as an absolute `directory`. A byte-for-byte profile clone therefore retained the author-profile path even though the same plugin generation had been copied into the slot profile. The new runtime correctly rejected that record because it was outside the active slot's plugin root.

Slot A was repaired in-place by changing only that `directory` to the matching generation under `%APPDATA%\chat-on-steroids-FORK-slot-a\plugins`; the JSON array shape must be preserved. The plugin then became visible after restart.

Fork patch `profile-plugin-rebase` now makes this clone operation self-healing: before plugin-record validation, an old absolute generation path is rebased only when it has the standard `<plugins>/<plugin-id>/<generation>` shape and that exact generation already exists below the active fork profile. The normalized array is then persisted. This protects slot B and future resets/clones from repeating the slot-A failure.

## Quiet automation boundaries found during live slot-A acceptance

Live slot A exposed three separate automation behaviours that looked like one failure from the desktop:

- automatic plugin schema refresh can create a visible `#settings/Plugins` helper tab when ordinary background-chat mode is off;
- a saved Goal objective can implicitly arm Goal even while the effective global Goal switch is Off and the chat has no per-chat override;
- explicit Desktop `browser_*` tools still use the browser-control debugger path, as intended, and therefore can show Chrome's debugging banner. The earlier `no-auto-debugger-lease` patch only removes automatic rendering leases, not explicit browser control.

Fork patch `quiet-automation-boundaries` changes the first two contracts and instruments the third:

- saved objectives remain durable but never grant Goal/Loop authority; the effective switch is the sole automation authority, so Off means Off;
- automatic plugin-refresh helper tabs always use the extension-owned background window, regardless of ordinary background-chat preference; manual navigation/Refresh is unchanged;
- every `browser_*` execution logs tool, session, conversation and request identity before browser-control executes, so a future debugger banner can be attributed without inference.

The standard continuation text observed in the ChatGPT composer is confirmed to come from `src/shared/recovery.ts`; one of the built-in `CONTINUE_TEXTS` strings is `Carry on until everything requested is finished.`
