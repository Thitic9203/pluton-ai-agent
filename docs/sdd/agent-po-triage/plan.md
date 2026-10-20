# Agent PO/BA triage: plan

Spec: `spec.md` in this folder

## Files
| File | Change | Rules |
|---|---|---|
| `scripts/agent/gates.mjs` | add `isReadyLabeler(sender, appLogin)` | R1, E1 |
| `scripts/agent/dispatch.mjs` | `decide`/`nextFromQueue` take `appLogin`; App labels need a collaborator author | R1, R2 |
| `scripts/agent/cli.mjs` | pass `AGENT_APP_LOGIN`; commands `triage-candidates`, `triage-apply` | R1, R3, R6 to R10 |
| `scripts/agent/triage.mjs` | new, pure: candidates, apply plan, markers | R3, R6 to R10 |
| `.github/workflows/agent.yml` | dispatch env `AGENT_APP_LOGIN`; agent job may not edit `agent:ready` | R1, risk |
| `.github/workflows/agent-triage.yml` | new: `judge` (read-only, claude-code-action, JSON schema) then `apply` (no AI, App token issues:write) | R4 to R9 |
| tests | `agent-triage.test.mjs`, `agent-dispatch.test.mjs`, `agent-gates.test.mjs`, `agent-workflow.test.mjs` | all |

## Data shapes
Verdict: `{number, verdict: 'ready'|'needs-info', reason, enrichment, ownerQuestion}`. Markers in App comments:
`<!-- agent-triage ready -->`, `<!-- agent-triage needs-info -->` (one per sweep), `<!-- agent-triage question-dm -->`,
`<!-- agent-triage gap-dm -->`.

## Libraries and cost (free tier only)
None new. claude-code-action on the existing OAuth secret, ubuntu-latest like every agent job. At most 10 candidates
are judged per run, so cost per run is bounded. No new paid service.

## Alternatives weighed, and the choice
- AI applies labels itself with the App token: rejected, a prompt-injected issue could label anything.
- Read-only judge, deterministic apply (chosen): the model never holds a write token; caps and candidacy are code.
- Fold into agent-sweep.yml: rejected, that job holds only the workflow token, whose labels never trigger agent.yml.

## What could break (hard constraint 5)
The dispatcher now accepts a second sender. Every job that holds an App token with issues write could in principle add
`agent:ready` (RISK_REGISTER R103); Gate 1 still blocks build work without the owner. Existing owner path unchanged.

## R13: the judge's failure digest (17 Oct 2026)
Files: `.github/workflows/agent-triage.yml` (two steps after `Judge each candidate` in the `judge` job) and
`scripts/lib/agent-workflow.test.mjs`.

- **Digest step** `if: failure() && steps.judge.outputs.execution_file != ''`. The path reaches the shell through `env`
  (`EXECUTION_FILE`), never pasted into `run:` (the existing "no expression in a run block" test). The `jq` filter
  (preinstalled on ubuntu-latest) lives in the env value `JUDGE_DIGEST`, so the test can run that exact text; it keeps
  the fields R13 lists by name (a whitelist, so a new SDK field is dropped, not leaked) and writes
  `$RUNNER_TEMP/judge-digest/digest.json`, then prints the `result` entries with `jq -c`.
- **Upload step**, same `if:`, `actions/upload-artifact` at the sha the other workflows pin (`043fb46d`, v7.0.1), name
  `triage-judge-digest-<run_id>-<run_attempt>`, `retention-days: 3`, `if-no-files-found: warn`.
- Shape of the execution file: the SDK message array the action writes to `$RUNNER_TEMP/claude-execution-output.json`
  (run 39012662586 log: "Log saved to /home/runner/work/_temp/claude-execution-output.json").

Alternatives weighed:
- Upload the raw execution file (the handoff's first wording): rejected, it holds every tool result, so the issue text
  the model read, and the action warns its full output "may contain secrets".
- `display_report: true` on the action: no artifact quota at all, but it writes every turn, tool results included, into
  the step summary; rejected for the same reason. It stays a one-line option if the owner prefers no artifact.
- `show_full_output: true`: rejected, the same content in the log, on every run, not only a failed one.
- Print only, no artifact: the log line alone names the error; the artifact adds the assistant text and the init
  message. Both are kept (chosen), because the log survives a refused upload.

What could break: nothing on a green run (both steps skip). On a red run the job is already red, so a refused upload
(the account wide artifact quota, PITFALLS 6.182) or a `jq` error cannot change the verdict; the printed line is
written before the upload. No `continue-on-error` and no `|| true` (Defence 20 layer 8). Artifact storage: a digest is
a few KB, kept 3 days, and is written only on a failed judge run. The repository's live artifacts read on 17 Oct 2026
are five nightly backups of about 0.6 MB each; the account wide total needs the `user` scope and was not read.

## R14 and R15: the DM reaches Slack, and an auth failure is annotated (19 Oct 2026)
Files: `.github/workflows/agent-triage.yml` and `scripts/lib/agent-workflow.test.mjs`.

- **R14.** The `apply` job gains `environment: staging` (four spaces, the slot `agent.yml:621` uses) with a comment
  that says why, and the file header names it. No value changes: `SLACK_BOT_TOKEN` keeps its name and now resolves
  from the environment; `SLACK_OWNER_ID`, `AGENT_APP_CLIENT_ID` and `AGENT_APP_PRIVATE_KEY` still resolve from the
  repository, because an environment adds to the repository's secrets and variables, never hides one it does not
  define. A new test walks every job of the five agent workflows and requires `environment: staging` on any job
  that reads `secrets.SLACK_BOT_TOKEN`; today it fails on `agent-triage.yml apply` only.
- **R15.** The digest step gets a second `jq` filter in the env literal `JUDGE_ERROR_LINE`, run with `jq -r` on
  `digest.json` before the existing `jq -c` line, so the test runs the exact text:
  `.[] | select(.type == "result" and .is_error == true) | "::error title=Triage judge failed::" + (escaped text)`,
  where the text is `.result`, or `.errors` when `.result` is empty, with `%`, CR and LF escaped (GitHub honours a
  workflow command on one line only, and the escaping also keeps a multi-line result from starting a second command).

Alternatives weighed:
- R14, copy `SLACK_BOT_TOKEN` to a repository secret: rejected, it would hand the token to every job of every
  workflow, the agent job that runs agent-written code included; the environment keeps it to jobs that ask.
- R14, move the DM to a separate job: rejected, the DM and its marker comment are one ordered loop in
  `triage-apply` (cli.mjs, skipMarker), and splitting it would duplicate the candidate recomputation.
- R15, fail the action on `is_error` in a new step: rejected, the job is already red; only the annotation is missing.

What could break (hard constraint 5): `environment: staging` puts the job under that environment's deployment branch
rules. Scheduled and `issues` runs use the default branch `main`; a `workflow_dispatch` from another branch could be
refused by those rules. Each apply run also records a deployment on `staging` in the GitHub UI, as the agent.yml Slack
jobs already do; no deploy budget counts it (the budget reads `ci.yml` runs only). R15 adds output only on a run that
is already red.
