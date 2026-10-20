// The runs-on form that keeps agent and bot pull requests off the Mac (R88). Copied unchanged from
// pluton-timesheet scripts/lib/workflow-security.test.mjs at 0706c9dfa, which stays in that repo
// (docs/sdd/repo-split/spec.md R8).
export const GUARDED_RUNS_ON =
  "${{ (github.event_name != 'pull_request' || (github.event.pull_request.head.repo.full_name == github.repository && !startsWith(github.head_ref, 'agent/issue-') && github.event.pull_request.user.type != 'Bot')) && vars.RUNNER || 'ubuntu-latest' }}";
