# COS fork patch stack

This fork is intentionally maintained as a small linear patch stack on top of an explicit upstream COS baseline ref. `our-release` is rebuildable; it is not a second long-lived development history.

## Stack policy

1. `main` may follow `upstream/main` for inspection, but release builds do not implicitly rebase onto it.
2. `our-release` is an explicitly selected upstream tag/commit plus the active `Fork-Patch` commits reported by `npm run fork:stack:status`.
3. Moving the baseline requires an explicit target ref. The tooling never silently follows `upstream/main`.
4. Third-party open PRs and post-release upstream commits are not imported by default. Each one must be reviewed and selected deliberately.
5. Upstreamable fixes made here stay temporary and are removed once a selected upstream release contains the equivalent fix.
6. Before every upstream replay, Git creates a rollback branch. `rerere` is enabled so repeated conflict resolutions can be reused, but `rerere.autoupdate` stays off so reused resolutions are never auto-staged.

## Patch registry

This table records the fork patches we maintain or have sent upstream. The authoritative list of patches currently applied to `our-release` is `npm run fork:stack:status`.

| Order | Patch id | Status | Purpose |
| --- | --- | --- | --- |
| 1 | `profile-isolation` | permanent | Keep this fork's stable Electron/profile/plugin state on `%APPDATA%\chat-on-steroids-FORK`, never the author's `%APPDATA%\chat-on-steroids`. |
| 2 | `runtime-release` | permanent | Visible fork/build identity plus graceful restart and slot-isolated A/B build/swap/rollback (`...-slot-a` / `...-slot-b`). |
| 3 | `patch-stack-tooling` | permanent | Reproducible release-baseline replay, focused validation, status reporting, and this manifest. |
| 4 | `no-auto-debugger-lease` | permanent | Disable automatic Chrome debugger rendering leases; explicit browser tools still attach on demand. |

Each stack commit carries `Fork-Patch:` and `Fork-Patch-Status:` trailers so its purpose survives rebases even though commit hashes change.

## Updating from upstream

Current selected baseline for the 2026-09-22 rebuild is upstream merge commit `93573d8` (`#370` plus its prerequisite post-2.1.14 stack).

From a clean `our-release`, select the exact upstream tag/commit deliberately:

```text
npm run fork:sync-upstream -- v2.1.15
```

The command fetches upstream, creates a local rollback branch, records the exact patch ids/statuses being replayed, rebases only the fork patch stack onto that explicitly selected ref, then runs stack-integrity checks, `diff --check`, TypeScript, focused fork regression tests, and a production build. No patch may silently disappear. Calling sync without a target is an error.

Rebase uses `--reapply-cherry-picks --empty=keep`. If upstream already contains the effect of one of our patches, Git keeps that patch as an **empty marker commit** instead of silently dropping it. `fork:stack:status` labels such commits `empty-marker`. This is deliberately conservative: an upstream-pending marker can be removed later as explicit housekeeping after we confirm the upstream implementation, while a manual `rebase --skip` is always detected as patch loss.

If a conflict occurs, the rebase stops at the exact fork patch that conflicts. Resolve that patch only, continue the rebase, then run `npm run fork:stack:verify`. Do not merge upstream into `our-release`.

If you deliberately abort a conflicted update, run `git rebase --abort` and then `npm run fork:stack:abort-sync` to clear the saved replay-validation state.

After validation, publish the rewritten integration branch explicitly:

```text
git push --force-with-lease origin our-release
```

Then use the existing A/B release path to build an explicit slot (for example `npm run fork:build -- slot-a`). Activation remains a separate step; building a slot never launches it.

## Useful commands

```text
npm run fork:stack:status
npm run fork:stack:verify
npm run fork:sync-upstream -- <release-tag-or-commit>
npm run fork:stack:abort-sync
```

`fork:sync-upstream` intentionally does not push or activate a build. Git history publication and executable activation remain separate reviewable steps.
