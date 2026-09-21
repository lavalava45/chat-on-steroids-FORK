# COS fork patch stack

This fork is intentionally maintained as a small linear patch stack on top of the current upstream COS source. `our-release` is rebuildable; it is not a second long-lived development history.

## Stack policy

1. `main` follows `upstream/main` and contains no fork changes.
2. `our-release` is upstream plus the active `Fork-Patch` commits reported by `npm run fork:stack:status`.
3. Third-party open PRs are not imported by default. Upstream owns their integration.
4. Upstreamable fixes made here stay temporary and are removed once upstream contains the equivalent fix.
5. Before every upstream replay, Git creates a rollback branch. `rerere` is enabled so repeated conflict resolutions can be reused, but `rerere.autoupdate` stays off so reused resolutions are never auto-staged.

When a third-party PR is imported early by explicit choice, it is kept as one clearly labelled temporary patch and removed as soon as upstream contains an accepted equivalent.

## Patch registry

This table records the fork patches we maintain or have sent upstream. The authoritative list of patches currently applied to `our-release` is `npm run fork:stack:status`.

| Order | Patch id | Status | Purpose |
| --- | --- | --- | --- |
| 1 | `profile-isolation` | permanent | Keep this fork's Electron/profile/plugin state separate from the original COS installation. |
| 2 | `runtime-release` | permanent | Visible fork/build identity plus graceful restart and local A/B build/swap/rollback. |
| 3 | `upstream-350-plugin-route` | upstream-pending | Fix stale ChatGPT Plugins route. Upstream issue #350 / PR #351. Drop when upstream contains it. |
| 4 | `upstream-362-plugin-refresh` | upstream-pending | Explicit Restart re-arms one unclaimed plugin refresh attempt. Upstream issue #362 / PR #363. Drop when upstream contains it. |
| 5 | `patch-stack-tooling` | permanent | Reproducible upstream replay, focused validation, status reporting, and this manifest. |
| 6 | `third-party-358-bounded-recovery` | third-party-open | Adapt upstream PR #358 to stop endless unclaimed browser recovery offers; excludes its accidental `node_modules` file and adds fork guards for manual compaction and stale SPA activity. Drop when upstream contains an accepted equivalent. |
| 7 | `third-party-341-stop-compaction` | third-party-open | Adapt upstream PR #341 so an oversized run gets one fresh auto-compaction chance when its proven work episode stops; excludes `node_modules` and preserves newer current-main lifecycle guards. Drop when upstream contains an accepted equivalent. |

Each stack commit carries `Fork-Patch:` and `Fork-Patch-Status:` trailers so its purpose survives rebases even though commit hashes change.

## Updating from upstream

From a clean `our-release`:

```text
npm run fork:sync-upstream
```

The command fetches upstream, creates a local rollback branch, records the exact patch ids/statuses being replayed, rebases only the fork patch stack onto the new `upstream/main`, then runs stack-integrity checks, `diff --check`, TypeScript, focused fork regression tests, and a production build. No patch may silently disappear.

Rebase uses `--reapply-cherry-picks --empty=keep`. If upstream already contains the effect of one of our patches, Git keeps that patch as an **empty marker commit** instead of silently dropping it. `fork:stack:status` labels such commits `empty-marker`. This is deliberately conservative: an upstream-pending marker can be removed later as explicit housekeeping after we confirm the upstream implementation, while a manual `rebase --skip` is always detected as patch loss.

If a conflict occurs, the rebase stops at the exact fork patch that conflicts. Resolve that patch only, continue the rebase, then run `npm run fork:stack:verify`. Do not merge upstream into `our-release`.

If you deliberately abort a conflicted update, run `git rebase --abort` and then `npm run fork:stack:abort-sync` to clear the saved replay-validation state.

After validation, publish the rewritten integration branch explicitly:

```text
git push --force-with-lease origin our-release
```

Then use the existing A/B release path (`fork:build` / `fork:swap`) to activate it.

## Useful commands

```text
npm run fork:stack:status
npm run fork:stack:verify
npm run fork:sync-upstream
npm run fork:stack:abort-sync
```

`fork:sync-upstream` intentionally does not push or activate a build. Git history publication and executable activation remain separate reviewable steps.
