# Bug Tracking — How We Do It

We use GitHub Issues as the team's shared bug tracker.

## Filing a bug
1. Go to the **Issues** tab on the repo.
2. Click **New issue**.
3. Choose the **Bug report** template.
4. Fill in every section — especially "Steps to reproduce." A bug no one
   can reproduce can't be fixed.

## Filing a task (not a bug)
Use the **Task** template instead — for follow-up work, small
improvements, or anything that isn't "something is broken."

## Labels
| Label | Meaning |
|---|---|
| `bug` | Something is broken |
| `status:needs-triage` | Not yet reviewed/assigned — the default on a new issue |
| `status:confirmed` | Reproduced, agreed it's real |
| `status:in-progress` | Someone's actively fixing it |
| `status:blocked` | Can't be fixed yet (waiting on something else) |
| `priority:blocker` | App-breaking, fix before anything else |
| `priority:high` | Major feature broken |
| `priority:medium` | Feature partly works |
| `priority:low` | Cosmetic / minor |
| `module:safety` | FR-1.1–1.5 (SOS, triggers) |
| `module:journey` | FR-1.6–1.11 (journeys, routes, trusted circle) |
| `module:lostfound` | FR-2.x |
| `module:parentchild` | FR-4.x |
| `module:pettracking` | FR-5.x (optional/Phase 2) |
| `module:account` | FR-3.x (auth, profile, notifications, offline) |
| `module:admin` | FR-6.x / admin dashboard |

## Triage flow
1. New issue comes in with `status:needs-triage`.
2. Whoever reviews it confirms it's reproducible, adds the right
   `module:` and `priority:` labels, and switches the status to
   `status:confirmed`.
3. Whoever picks it up switches it to `status:in-progress` and assigns
   themselves.
4. Once fixed and merged, close the issue — reference the PR that fixed
   it in the closing comment (e.g. "Fixed in #42").

## Before each milestone
Run a manual QA pass across every module that's ready to test, filing
any new bugs found using the template above, and check that nothing
with `priority:blocker` or `priority:high` is still open before the
milestone deadline.