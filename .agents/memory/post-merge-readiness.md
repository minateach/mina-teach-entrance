---
name: Post-merge application readiness
description: Successful setup does not by itself prove the running preview has loaded merged server changes.
---

Verify the running application after a merge rather than treating successful setup as proof that the live server has reloaded.

**Why:** Setup and workflow reconciliation once reported success while the preview still used the previous server process, leaving newly merged browser assets unavailable.

**How to apply:** Check the preview after merged server changes. If the running app still serves the old behavior, restart its existing configured workflow before claiming the merge is ready.
