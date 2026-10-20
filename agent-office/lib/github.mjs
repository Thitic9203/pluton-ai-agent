/*
 * The GitHub client of the Agent Office snapshot (docs/sdd/agent-office-live/spec.md R2 to R4, R7,
 * R8, R43, E1, E5). It runs in Node inside the snapshot step of
 * .github/workflows/deploy-agent-office.yml, with that job's own GITHUB_TOKEN (R41); it is never
 * bundled into the Pages Function.
 *
 * Read only by construction: every request goes through `get`, which calls fetch with no init
 * other than headers, so the method is always the default one, and no body is ever sent. The paths
 * it builds are the four reads the board needs, plus `history(path)`, a GET of one repository path
 * that agent-office/lib/history.mjs builds for the money block (T33, T36).
 *
 * The token is held in this closure only. It is sent in the Authorization header, never in a URL,
 * never followed to another host (a `Link` that leaves the API origin is refused), and it is
 * scrubbed from every error message, since an error may be printed in the workflow log.
 */

const API = 'https://api.github.com';
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKFLOW_FILE = /^[A-Za-z0-9_.-]+\.ya?ml$/;
const HISTORY_PATH = /^\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.\-/]+(\?[A-Za-z0-9_.\-=&%:+]*)?$/;
const ENVELOPES = ['workflow_runs', 'jobs', 'check_runs'];

export class GitHubError extends Error {
  /** @param {string} message @param {number|null} status @param {string} path */
  constructor(message, status = null, path = '') {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.path = path;
  }
}

/** E1: GitHub refused for rate limit (429, or 403 with no quota left). `resetAt` is ISO or null. */
export class GitHubRateLimitError extends GitHubError {
  /** @param {string} message @param {number} status @param {string} path @param {string|null} resetAt */
  constructor(message, status, path, resetAt) {
    super(message, status, path);
    this.name = 'GitHubRateLimitError';
    this.resetAt = resetAt;
  }
}

/** The URL of rel="next" in a Link header, or null. */
function nextLink(header) {
  for (const part of String(header ?? '').split(',')) {
    const m = /<([^>]+)>\s*;\s*rel="next"/.exec(part);
    if (m) return m[1];
  }
  return null;
}

function checkRepo(repo) {
  if (!REPO.test(String(repo)) || String(repo).includes('..')) throw new GitHubError(`Not a repository name: ${repo}`);
  return String(repo);
}

/**
 * @param {{ token: string, fetch?: typeof fetch }} options
 */
export function createGitHubClient({ token, fetch: fetchFn = globalThis.fetch }) {
  if (typeof token !== 'string' || token === '') throw new GitHubError('No GitHub token: the snapshot step must receive GITHUB_TOKEN');
  const scrub = (text) => String(text).split(token).join('[token]');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'taskfolio-agent-office-snapshot',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // R73: at most IN_FLIGHT requests at once, whatever the callers ask in parallel; the rest queue.
  const IN_FLIGHT = 6;
  let active = 0;
  const waiting = [];
  const acquire = () => (active < IN_FLIGHT ? (active++, Promise.resolve()) : new Promise((resolve) => waiting.push(resolve)));
  const release = () => { const next = waiting.shift(); if (next) next(); else active--; };
  const reason = (error) => {
    if (!(error instanceof Error)) return String(error);
    const inner = error.cause instanceof Error ? error.cause.message : error.cause ? String(error.cause) : '';
    return inner ? `${error.message}: ${inner}` : error.message;
  };

  /** One read. `url` must be on the API origin. */
  async function get(url) {
    if (new URL(url).origin !== API) throw new GitHubError(`Refusing to follow a link off ${API}: ${scrub(new URL(url).origin)}`);
    const path = new URL(url).pathname;
    await acquire();
    try {
      return await read(url, path);
    } finally {
      release();
    }
  }

  async function read(url, path) {
    let response;
    try {
      response = await fetchFn(url, { headers });
    } catch (error) {
      throw new GitHubError(`GitHub could not be reached for ${path}: ${scrub(reason(error))}`, null, path);
    }
    if (!response.ok) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      let detail = '';
      try {
        detail = String((await response.json())?.message ?? '');
      } catch {
        detail = '';
      }
      const message = scrub(`GitHub answered ${response.status} for ${path}${detail ? `: ${detail}` : ''}`);
      if (response.status === 429 || (response.status === 403 && (remaining === '0' || /rate limit/i.test(detail)))) {
        throw new GitHubRateLimitError(message, response.status, path, Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null);
      }
      throw new GitHubError(message, response.status, path);
    }
    return { body: await response.json(), next: nextLink(response.headers.get('link')) };
  }

  /** Every page of a list (E5). `key` names the array inside an envelope (`workflow_runs`). */
  async function all(path, key = null) {
    const out = [];
    let url = `${API}${path}`;
    while (url) {
      const { body, next } = await get(url);
      const items = key ? body?.[key] : body;
      if (!Array.isArray(items)) throw new GitHubError(`GitHub answered ${path} with no list`, 200, path);
      out.push(...items);
      url = next;
    }
    return out;
  }

  /**
   * T33, T36: the `get(path)` that agent-office/lib/history.mjs takes. A GET of one repository path
   * (`/repos/owner/name/...`), every page merged: a list answer is one array, an envelope
   * (`workflow_runs`, `jobs`, `check_runs`) keeps its shape with the array merged. Anything else is
   * refused before a request is made.
   * @param {string} path
   */
  async function history(path) {
    const p = String(path);
    if (!HISTORY_PATH.test(p) || p.includes('..')) throw new GitHubError(`Not a repository read: ${p.split('?')[0]}`);
    let url = `${API}${p}`;
    /** @type {unknown} */
    let merged = null;
    while (url) {
      const { body, next } = await get(url);
      if (merged === null) merged = body;
      else if (Array.isArray(merged) && Array.isArray(body)) merged.push(...body);
      else {
        const key = ENVELOPES.find((k) => Array.isArray(merged?.[k]) && Array.isArray(body?.[k]));
        if (!key) throw new GitHubError(`GitHub answered page 2 of ${p.split('?')[0]} in another shape`, 200, p);
        merged[key].push(...body[key]);
      }
      url = next;
    }
    return merged;
  }

  return {
    history,
    /** R2, E5: every open issue of the repository; pull requests (which the issues list includes) are left out. */
    async openIssues(repo) {
      const items = await all(`/repos/${checkRepo(repo)}/issues?state=open&per_page=100`);
      return items.filter((i) => !i.pull_request);
    },
    /** R4: the timeline of one issue (labeled and unlabeled events among others). */
    async timeline(repo, n) {
      if (!Number.isInteger(n) || n <= 0) throw new GitHubError(`Not an issue number: ${n}`);
      return all(`/repos/${checkRepo(repo)}/issues/${n}/timeline?per_page=100`);
    },
    /** R3: closed pull requests whose base is `base` (the caller keeps the merged ones). */
    async releasePulls(repo, base) {
      return all(`/repos/${checkRepo(repo)}/pulls?state=closed&base=${encodeURIComponent(String(base))}&per_page=100`);
    },
    /** R7, R8: in-progress runs of one workflow file. */
    async runsInProgress(repo, workflowFile) {
      if (!WORKFLOW_FILE.test(String(workflowFile))) throw new GitHubError(`Not a workflow file name: ${workflowFile}`);
      return all(`/repos/${checkRepo(repo)}/actions/workflows/${workflowFile}/runs?status=in_progress&per_page=100`, 'workflow_runs');
    },
  };
}
