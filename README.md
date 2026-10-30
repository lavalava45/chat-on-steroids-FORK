# Lost new-chat opening: sanitized evidence

The live incident was observed on a local 2.1.48 fork. An extension election persisted at `stage: ready`, but its elected Chrome tab no longer existed. The queued opening had no owner, offer, Send authorization, receipt or conversation binding. Why that tab initially disappeared is unknown.

The proposed regression tests exercise the untouched upstream background worker in a VM with a Chrome fixture. The ready/preparing missing-tab cases fail against stable `3bcf8fd0d747481c400d1e55d42c667bb62272f2` and pass with the focused fix. This proves the inherited dead-end handling, not a fresh live provider reproduction on the official binary.

After updating the fork, the actual incident became `failed`/“Not sent”, with no claim or Send authority. The existing Retry delivery action restored the text without submitting it. The old reserved session rejected changing its Goal controls (`session_not_recorded`), so the user-facing recovery finished in a new unsent draft in the same local project with the original Goal/model choices. This limitation is outside the focused tab-reporting fix.

- `diagnostics-excerpt.txt`: relevant version/environment section exported by the real app before updating. This is an excerpt, not the full report.
- `app.log.txt`: actual startup and extension-connection log excerpt after the update.
- `observations.json`: live observations with identifiers replaced by placeholders.
- `lost-opening-not-sent.png`, `lost-opening-restored-draft.png`: actual Electron production-renderer screenshots using isolated placeholder fixtures. They show the failed notice and draft restoration; they do not show a real provider conversation.

The code branch contains only the focused fix and its tests/translations. This evidence branch contains no private prompts, user paths, credentials or real conversation identifiers.
