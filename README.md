# COS Skills UI comparison (isolated fixture)

Images are from the project's Chromium/Electron renderer under a synthetic test fixture, **not** the user's installed COS profile. No accounts, real credentials, or personal chats appear.

- `skills-menu-before.png`: upstream/main `4d16de787`, the managed Skill card context menu before the changes.
- `skills-menu-after.png`: COS fork staging `840af71e1`, with local-folder and disable actions.
- `skills-auth-before.png`: upstream/main `4d16de787`, the GitHub import dialog before optional PAT authorization.
- `skills-auth-after.png`: COS fork staging `8e73c7b53` + later menu change, showing the new optional PAT controls without a token entered.

All four captures used the same 1500x1000 synthetic fixture (`/review` managed Skill and demo workspace). They are UI visuals only, not evidence that a real PAT or live user Skill was exercised.
