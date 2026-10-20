// OLS intake: which duty a ticket gets. Spec: docs/sdd/ols-real/spec.md R1, R2, R3. Pure.

/** R1: the owner's QA work (P1, P3: QA Owner only; READY TO TEST is To Do category, so statusCategory). */
export const JQL = 'project = OLS AND cf[12120] = currentUser() AND statusCategory != Done';
export const FIELDS = ['summary', 'status', 'issuetype', 'customfield_12128', 'created'];

/** The mock's Thai names (mock lines 423, 633 to 634). */
export const DUTY_TH = { 'write-tc': 'เขียนเทสเคส', 'review-tc': 'รีวิวเทสเคส', test: 'ทดสอบ', retest: 'รีเทสบัค', 'e2e-fix': 'แก้เคส e2e' };

const IN_TEST = new Set(['READY TO TEST', 'TESTING']);
const HAS_TC = new Set(['DONE', 'QA REVIEWED']);
const up = (v) => String(v ?? '').trim().toUpperCase();
const optionValue = (f) => (f && typeof f === 'object' ? f.value : f);

/** @returns {{ key: string, n: number, summary: string, type: string, status: string, tcStatus: string, created: string|null } | null} */
export function normalize(raw) {
  const m = /^OLS-(\d+)$/.exec(String(raw?.key ?? ''));
  if (!m) return null;
  const f = raw.fields ?? {};
  const created = f.created ? new Date(f.created) : null;
  return {
    key: raw.key,
    n: Number(m[1]),
    summary: String(f.summary ?? ''),
    type: String(f.issuetype?.name ?? '').trim().toLowerCase(),
    status: up(f.status?.name),
    tcStatus: up(optionValue(f.customfield_12128)),
    created: created && !Number.isNaN(created.getTime()) ? created.toISOString() : null,
  };
}

/** R2: one duty per ticket, or null when it waits. R3 follows from TC Status moving after each approval. */
export function dutyOf(t) {
  if (!t) return null;
  const inTest = IN_TEST.has(t.status);
  if (t.type === 'story') {
    if (!HAS_TC.has(t.tcStatus)) return 'write-tc';
    if (t.tcStatus === 'DONE') return 'review-tc';
    return inTest ? 'test' : null;
  }
  if (t.type === 'bug' || t.type === 'task') return inTest ? 'retest' : null;
  return null;
}

/** R17: caps for the context written into ticket.json. */
export const TEXT_CAP = 20000;
export const COMMENT_CAP = 50;
const BLOCK = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'rule', 'panel', 'tableRow']);

/** R17: Jira's document format (ADF) to plain text; a string passes through; lists become "- " lines. */
export function adfText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node !== 'object') return String(node);
  const lines = [];
  const walk = (n, prefix) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'listItem') {
      for (const [i, c] of (n.content ?? []).entries()) walk(c, i === 0 ? prefix + '- ' : prefix + '  ');
      return;
    }
    if (BLOCK.has(n.type) || n.type === 'tableCell' || n.type === 'tableHeader') {
      const parts = [''];
      const inline = (m) => {
        if (m.type === 'text') parts[parts.length - 1] += m.text ?? '';
        else if (m.type === 'hardBreak') parts.push('');
        else if (m.type === 'mention' || m.type === 'emoji' || m.type === 'inlineCard') parts[parts.length - 1] += m.attrs?.text ?? m.attrs?.url ?? '';
        else for (const c of m.content ?? []) inline(c);
      };
      if (n.content?.some((c) => BLOCK.has(c.type) || c.type === 'bulletList' || c.type === 'orderedList')) {
        for (const c of n.content) walk(c, prefix);
        return;
      }
      for (const c of n.content ?? []) inline(c);
      for (const [i, t] of parts.entries()) lines.push((i === 0 ? prefix : prefix.replace(/- $/, '  ')) + t);
      return;
    }
    for (const c of n.content ?? []) walk(c, prefix);
  };
  walk(node, '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const CRITERIA = /acceptance criteria|edge case/i;

/** R17: the whole context written into ticket.json stays under this many characters. */
export const TICKET_CAP = 200000;

/**
 * R17: description, criteria fields found by their Jira names, and the newest comments, as plain text.
 * `page` is the comment endpoint's answer (`orderBy=-created`, newest first, with `total`); the
 * issue's own comment field is never read, since it may hold one page from the oldest.
 */
export function ticketContext(issue, page = { comments: [], total: 0 }) {
  const f = issue?.fields ?? {};
  const names = issue?.names ?? {};
  const cut = [];
  const capped = (label, text) => {
    if (text.length <= TEXT_CAP) return text;
    cut.push(`${label} cut at ${TEXT_CAP} characters`);
    return text.slice(0, TEXT_CAP);
  };
  const description = capped('description', adfText(f.description));
  const criteria = Object.keys(names)
    .filter((id) => id !== 'description' && CRITERIA.test(String(names[id])) && f[id] != null)
    .map((id) => ({ name: String(names[id]), text: capped(String(names[id]), adfText(f[id])) }))
    .filter((c) => c.text);
  // ols-retest-procedure R1, R3: how the description and the criteria fields changed (issue
  // expand=changelog), oldest first, so a case can be checked against the ticket now and before
  const tracked = new Set(['description', ...Object.keys(names).filter((id) => CRITERIA.test(String(names[id])))]);
  const history = (Array.isArray(issue?.changelog?.histories) ? issue.changelog.histories : [])
    .flatMap((h) => (h?.items ?? [])
      .filter((it) => tracked.has(String(it?.fieldId ?? it?.field ?? '')))
      .map((it) => ({ author: String(h?.author?.displayName ?? ''), created: String(h?.created ?? ''), field: String(it.field ?? it.fieldId), from: String(it.fromString ?? ''), to: String(it.toString ?? '') })))
    .sort((a, b) => Date.parse(a.created) - Date.parse(b.created))
    .map((e, i) => ({ ...e, from: capped(`history ${i + 1} from`, e.from), to: capped(`history ${i + 1} to`, e.to) }));
  const newestFirst = (Array.isArray(page?.comments) ? page.comments : []).slice(0, COMMENT_CAP);
  const total = Number(page?.total ?? newestFirst.length);
  if (total > newestFirst.length) cut.push(`comments: newest ${newestFirst.length} of ${total}`);
  const comments = [...newestFirst].reverse().map((c, i) => ({
    author: String(c?.author?.displayName ?? ''),
    created: String(c?.created ?? ''),
    text: capped(`comment ${i + 1}`, adfText(c?.body)),
  }));
  const out = { description, criteria, history, comments, cut };
  // the total cap: drop the oldest comments first, then the oldest history, and say how many
  let dropped = 0;
  const size = () => JSON.stringify(out).length + 240; // room for the notes themselves
  while (comments.length && size() > TICKET_CAP) {
    comments.shift();
    dropped += 1;
  }
  if (dropped) cut.push(`comments: dropped ${dropped} oldest to keep ticket.json under ${TICKET_CAP} characters`);
  let gone = 0;
  while (history.length && size() > TICKET_CAP) {
    history.shift();
    gone += 1;
  }
  if (gone) cut.push(`history: dropped ${gone} oldest to keep ticket.json under ${TICKET_CAP} characters`);
  // with every comment gone, criteria fields go from the last (the description alone is at most TEXT_CAP)
  while (criteria.length && size() > TICKET_CAP) cut.push(`criteria: dropped "${criteria.pop().name}" to keep ticket.json under ${TICKET_CAP} characters`);
  return out;
}
