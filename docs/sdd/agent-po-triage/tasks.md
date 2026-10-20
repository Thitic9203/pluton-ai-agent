# Agent PO/BA triage: tasks

Plan: `plan.md` in this folder

- [ ] **T1.** `isReadyLabeler`. Rules: R1, E1. Test first: agent-gates.test.mjs, App bot accepted, empty slug and impostors refused. Done when: passes.
- [ ] **T2.** Dispatcher accepts the App for collaborator issues. Rules: R1, R2. Test first: agent-dispatch.test.mjs. Done when: passes, old owner cases unchanged.
- [ ] **T3.** `triage.mjs` candidates and apply plan. Rules: R3, R6 to R10, E2. Test first: agent-triage.test.mjs. Done when: passes.
- [ ] **T4.** cli commands and agent-triage.yml; agent.yml dispatch env and agent job deny rule. Rules: R1, R4, R8, R9, R11. Test first: agent-workflow.test.mjs triage cases. Done when: passes.
- [ ] **T5.** Docs: plan Q1, CLAUDE.md constraint 21, DECISION_LOG, RISK_REGISTER R103. Done when: `node scripts/config-gate.mjs` passes.
- [ ] **T6.** The judge's failure digest. Rules: R13, E4. Test first: agent-workflow.test.mjs, "judge keeps a redacted digest only when it failed" (step shape) and "the digest filter keeps the error and drops issue text" (runs the `JUDGE_DIGEST` filter from the workflow with `jq` on a fixture); both fail before the steps exist. Done when: `TZ=UTC node --test scripts/lib/agent-workflow.test.mjs`, `node scripts/docs-check.mjs` and `node scripts/round-guard-check.mjs` pass.
- [ ] **T7.** The apply job runs in `environment: staging`. Rules: R14, E3. Test first: agent-workflow.test.mjs "every job that reads secrets.SLACK_BOT_TOKEN runs in the environment staging" fails on `agent-triage.yml apply` before the line exists; the apply test also asserts it. Done when: `TZ=UTC node --test scripts/lib/agent-workflow.test.mjs` passes.
- [ ] **T8.** The digest step annotates an `is_error` result. Rules: R15. Test first: agent-workflow.test.mjs "the digest step annotates an is_error result as ::error:: (R15)" fails before `JUDGE_ERROR_LINE` exists. Done when: `TZ=UTC node --test scripts/lib/agent-workflow.test.mjs` and `node scripts/docs-check.mjs` pass.
