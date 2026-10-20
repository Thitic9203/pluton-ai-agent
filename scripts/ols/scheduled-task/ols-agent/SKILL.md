---
name: ols-agent
description: OLS agent tick (Mon–Fri every 30 min, 09:00–17:30 Asia/Bangkok): reads the owner's OLS QA tickets and the newest dev e2e run, runs the ols-qa skills headlessly, sends every Jira/Sheet write to the owner's Slack DM as a draft and applies it only after a `passed` reply, then publishes the OLS board. Spec docs/sdd/ols-real.
---

<!--
Definition only (docs/sdd/ols-real/spec.md R1; P4: Desktop scheduled task on this Mac, every 30 minutes
in working hours). The main thread installs it after the owner's go, with the scheduled-tasks tool:
  create_scheduled_task(taskId: "ols-agent", cronExpression: "*/30 9-17 * * 1-5",
    description: <the description above>, prompt: <the body below>)
Stop it with update_scheduled_task(taskId: "ols-agent", enabled: false), or delete_scheduled_task.
Working hours are an open question (spec open question 1); change the cron when the owner answers.
-->

You are running one tick of the **OLS agent**. This session starts with no context. Follow these steps literally and do nothing else.

1. Run exactly this command, from `/Users/thitichaya/GitHub/pluton-timesheet` on `main`:
   `PATH=/Users/thitichaya/actions-runner-taskfolio/_work/_tool/node/22.23.2/arm64/bin:$PATH node scripts/ols/tick.mjs --live`
2. Do not read, print or copy any credential. The script reads them itself and prints counts and keys only.
3. Do not post to Jira, Slack, Discord or Google Sheets yourself, and do not run any ols-qa skill yourself. Every write goes through the script's `passed` gate.
4. If the command exits non-zero, report the last line of its output as the result of this run and stop. Do not retry it, and do not change any file to make it pass.
5. Report the script's last line (`tick done: ...`) as the result.
</content>
</invoke>
