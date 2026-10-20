/* One Slack direct message, for the scheduled notice jobs. The same three calls
 * `send-reminders.mjs` makes, kept here so a job that is not a weekly reminder does not have to
 * import that script (which claims a run and reads Firestore as soon as it loads).
 *
 * Slack is a delivery channel, never the source of truth (SPEC 9.3): every caller writes the
 * in-app notification first and treats a throw from here as "in-app only". */

/* Another person's name as Slack text. Slack's formatting reference, "Escaping text" (read 30 Sep
 * 2026): `&`, `<` and `>` are control characters and "must be converted to HTML entities if
 * they're not going to be used for their parsing purpose". `&` goes first, so an entity already in
 * the name is shown as written rather than decoded. Applied in the message builders only: the bell
 * renders the same names as plain text, and `dm()` posts what it is given, so nothing is escaped
 * twice (security audit round 2). src/domain/notifications.ts keeps the same three replacements
 * for the activation message, since src and scripts share no module. */
export function slackEscape(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* Owner, 8 Oct 2026: "ส่งจริงแค่แอคเราก่อนได้ไหม เวลา 10.30 AM ส่วนคนอื่นยังไม่ต้องส่ง", then "แต่โนติใน
 * ระบบที่เป็นกระดิ่ง ส่งจริงๆ ได้ตั้งแต่รอบนี้ทุกคน". Every caller writes the bell for everyone first;
 * Slack goes only to the addresses in SLACK_ONLY_EMAILS (comma separated, a GitHub environment
 * variable set by hand, never committed). An empty or missing list sends Slack to nobody, so a
 * forgotten variable can only hold messages back, never send them to everyone. Everyone else waits
 * for #484. */
const normal = (email) => String(email ?? '').trim().toLowerCase();

export function slackAllowed(email, list) {
  const allowed = String(list ?? '').split(',').map(normal).filter(Boolean);
  const who = normal(email);
  return who !== '' && allowed.includes(who);
}

/* How each Slack method takes its arguments. Slack's Web API guide (https://docs.slack.dev/apis/web-api/,
 * read 8 Oct 2026) allows a JSON body only "For write methods that support JSON"; users.lookupByEmail
 * is a read method (`GET https://slack.com/api/users.lookupByEmail`) and answered `invalid_arguments`
 * to a JSON body on staging run 37729648229, so it goes form encoded, as Slack's own Python SDK sends
 * it. conversations.open and chat.postMessage are write methods and keep JSON.
 * src/services/slackRelay.ts keeps the same rule for the activation message.
 * conversations.replies and conversations.history are read methods too (the feedback loop, plan
 * row 9 of docs/superpowers/plans/feedback-form-to-github-slack.md), so they go the same way.
 * files.getUploadURLExternal and files.completeUploadExternal (the E2E report upload,
 * scripts/lib/e2e-slack-report.mjs) go form encoded too, as the OLS sender they are ported from sends them. */
const FORM_METHODS = new Set([
  'users.lookupByEmail',
  'conversations.replies',
  'conversations.history',
  'files.getUploadURLExternal',
  'files.completeUploadExternal',
]);

export function slackRequestInit(token, method, body) {
  if (FORM_METHODS.has(method)) {
    return {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)])).toString(),
    };
  }
  return {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export function slackDm(token, allowlist = process.env.SLACK_ONLY_EMAILS) {
  async function call(method, body) {
    const res = await fetch(`https://slack.com/api/${method}`, slackRequestInit(token, method, body));
    const json = await res.json();
    if (!json.ok) throw new Error(`${method}: ${json.error}`);
    return json;
  }
  return async function dm(email, text) {
    // Before the token check and before any call: a held account costs no Slack request at all.
    // A throw, because every caller already reads a throw as "in-app only" and keeps the bell.
    if (!slackAllowed(email, allowlist)) {
      const held = new Error('Slack held for this account until #484 (not in SLACK_ONLY_EMAILS)');
      held.held = true;
      throw held;
    }
    if (!token) throw new Error('no slack token configured');
    const { user } = await call('users.lookupByEmail', { email });
    const { channel } = await call('conversations.open', { users: user.id });
    await call('chat.postMessage', { channel: channel.id, text });
  };
}

/* ---------- The feedback loop's Slack thread (plan row 9 of
 * docs/superpowers/plans/feedback-form-to-github-slack.md, "Approval parser"). The bot posts one
 * thread per form response in the feedback channel, reads the owner's replies there and acts only
 * on an exact approval word. Every function takes fetchImpl so the tests reach no network.
 * slackDm above keeps its own call(): slackCall checks the HTTP status before reading the body,
 * which slackDm never did, so reusing it there would change slackDm's errors. ---------- */

const SLACK_API = 'https://slack.com/api/';
const MAX_PAGES = 50; // 50 pages of 200 messages; a feedback thread is never that long.

function slackError(message, status, retryAfter) {
  const err = new Error(message);
  err.status = status;
  err.retryAfter = retryAfter;
  return err;
}

/* One Slack Web API call. A non 2xx status (429 among them) or a body that is not JSON throws
 * `${method}: HTTP <status>`; a JSON answer with ok false throws `${method}: <error>`. Every error
 * carries `status` and `retryAfter` (seconds from the Retry-After header, or null). */
export async function slackCall(token, method, body, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${SLACK_API}${method}`, slackRequestInit(token, method, body));
  const status = res.status;
  const header = res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
  const retryAfter = header !== null && header !== undefined && /^\d+$/.test(String(header).trim()) ? Number(header) : null;
  if (!res.ok) throw slackError(`${method}: HTTP ${status}`, status, retryAfter);
  let json;
  try {
    json = await res.json();
  } catch {
    throw slackError(`${method}: HTTP ${status}`, status, retryAfter);
  }
  if (!json || json.ok !== true) throw slackError(`${method}: ${json?.error ?? 'no error code'}`, status, retryAfter);
  return json;
}

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
}

/* A new parent message in `channel`; returns its ts, which is the thread's ts. */
export async function startThread({ token, channel, text, fetchImpl } = {}) {
  required(token, 'token');
  required(channel, 'channel');
  required(text, 'text');
  const json = await slackCall(token, 'chat.postMessage', { channel, text }, fetchImpl);
  return json.ts;
}

/* A reply in the thread of `threadTs`; returns the reply's ts. Never starts a new thread. */
export async function replyInThread({ token, channel, threadTs, text, fetchImpl } = {}) {
  required(token, 'token');
  required(channel, 'channel');
  required(threadTs, 'threadTs');
  required(text, 'text');
  const json = await slackCall(token, 'chat.postMessage', { channel, text, thread_ts: threadTs }, fetchImpl);
  return json.ts;
}

async function paged(token, method, base, fetchImpl) {
  const messages = [];
  const seen = new Set();
  let cursor = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = { ...base, limit: 200 };
    if (cursor) body.cursor = cursor;
    const json = await slackCall(token, method, body, fetchImpl);
    messages.push(...(json.messages ?? []));
    const next = json.response_metadata?.next_cursor ?? '';
    if (!next) return messages;
    if (seen.has(next)) throw new Error(`${method}: next_cursor repeated, refusing to loop`);
    seen.add(next);
    cursor = next;
  }
  throw new Error(`${method}: more than ${MAX_PAGES} pages`);
}

/* Every message of the thread whose parent is `threadTs`, following next_cursor, once each by ts.
 *
 * Without `oldest`, the parent comes first and must be `threadTs`. Slack's conversations.replies
 * takes as `ts` "a thread's parent message or a message in the thread" and answers with the whole
 * thread either way, so a reply ts would silently read the thread under the wrong key: it throws.
 *
 * With `oldest` (sent with inclusive=false), Slack includes "Only messages after this Unix
 * timestamp", so the parent may be absent and may repeat on every page. Then only messages whose
 * ts or thread_ts is `threadTs` are kept, de-duplicated by ts, and a message of any other thread
 * throws. */
export async function readReplies({ token, channel, threadTs, oldest, fetchImpl } = {}) {
  required(token, 'token');
  required(channel, 'channel');
  required(threadTs, 'threadTs');
  const base = { channel, ts: threadTs };
  const since = oldest !== undefined && oldest !== null;
  if (since) {
    tsMicros(oldest);
    base.oldest = oldest;
    base.inclusive = false;
  }
  const raw = await paged(token, 'conversations.replies', base, fetchImpl);
  if (!since) {
    const parent = raw[0];
    if (!parent || parent.ts !== threadTs || (parent.thread_ts !== undefined && parent.thread_ts !== parent.ts)) {
      throw new Error('conversations.replies: threadTs is not the parent of a thread');
    }
  }
  const seen = new Set();
  const messages = [];
  for (const m of raw) {
    if (!m) continue;
    const own = m.ts === threadTs || m.thread_ts === threadTs;
    if (!own) throw new Error('conversations.replies: a message of another thread came back');
    if (seen.has(m.ts)) continue;
    seen.add(m.ts);
    messages.push(m);
  }
  return messages;
}

/* The bot id (`B...`) of the app that owns `token`, from auth.test. A missing or malformed id
 * throws `auth.test: ...`; no message ever carries the token. */
export async function slackBotId({ token, fetchImpl } = {}) {
  required(token, 'token');
  const json = await slackCall(token, 'auth.test', {}, fetchImpl);
  if (typeof json.bot_id !== 'string' || !/^B[A-Z0-9]+$/.test(json.bot_id)) {
    throw new Error('auth.test: the answer carries no bot id (B...); is this a bot token?');
  }
  return json.bot_id;
}

/* The line every S2 acknowledgement carries, so a thread can be found again from the responseId
 * alone when the runner died between posting and saving the thread ts (plan "State"). */
export function responseLine(responseId) {
  if (!/^[0-9a-f]{12}$/.test(String(responseId))) throw new Error('responseId must be 12 lower-case hex');
  return `form-response:${responseId}`;
}

/* The ts of the message from our own bot (`botId`, a Slack bot id `B...`) in `channel` that carries
 * the responseId line as a whole line, or null. Two such messages throw, since the loop would not
 * know which thread is the real one.
 *
 * `oldest` is required: without it conversations.history pages the whole channel, and once the
 * channel passes MAX_PAGES x 200 messages the call would fail on every run. The runner passes the
 * response's timestamp, as a Slack ts, less a margin (the ack is posted after the response, never
 * before it). Messages of another bot or of a person never match. The runner gets `botId` from
 * slackBotId (auth.test) with the same token, rather than from a stored setting. */
export async function findThreadByResponseId({ token, channel, botId, responseId, oldest, fetchImpl } = {}) {
  required(token, 'token');
  required(channel, 'channel');
  if (typeof botId !== 'string' || !/^B[A-Z0-9]+$/.test(botId)) throw new Error('botId must be a Slack bot id (B...)');
  if (oldest === undefined || oldest === null || oldest === '') throw new Error('oldest is required, so the whole channel is never paged');
  tsMicros(oldest);
  const line = responseLine(responseId);
  const base = { channel, oldest };
  const messages = await paged(token, 'conversations.history', base, fetchImpl);
  const hits = messages.filter(
    (m) => m && m.bot_id === botId && String(m.text ?? '').split(/\r?\n/).some((l) => l.trim() === line),
  );
  if (hits.length > 1) throw new Error(`${hits.length} bot messages carry ${line}; delete the duplicates so one remains`);
  return hits.length === 1 ? hits[0].ts : null;
}

/* A Slack ts ("1697000000.123456") as one integer of microseconds: Number() can lose the sixth
 * decimal, and string order breaks when the seconds gain a digit. */
function tsMicros(ts) {
  const m = /^(\d+)\.(\d{1,6})$/.exec(typeof ts === 'string' ? ts : '');
  if (!m) throw new Error('not a Slack ts');
  return BigInt(m[1]) * 1000000n + BigInt(m[2].padEnd(6, '0'));
}

export function compareTs(a, b) {
  const x = tsMicros(a);
  const y = tsMicros(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/* The approval words of the plan, matched against the whole trimmed message, never a substring.
 * `merge prod` joins only if the owner picks D5 option B. */
export const APPROVAL_WORDS = Object.freeze(['แก้เลย', 'ยังไม่แก้', 'mock ok', 'merge', 'ยังไม่ merge']);

/* The owner's replies to act on, in order: `{ts, word}` for an exact approval word,
 * `{ts, question: true}` for anything else the owner wrote, and `{ts, edited: true, editedTs}` for
 * a reply that carries an `edited` field (never a word; the runner asks the owner to type a new
 * reply, plan "Approval parser"). Only messages from `ownerId` with no bot_id and no subtype whose
 * ts is newer than `afterTs` (the bot's latest question). A plain reply must also be newer than
 * `lastProcessedTs`; an edited one is judged by `edited.ts`, so an approval edited after it was
 * acted on comes back once for re-confirmation. The runner stores the largest of `ts` and
 * `editedTs` it handled as the next lastProcessedTs, so each item comes back once. */
export function parseApproval(messages, { ownerId, afterTs, lastProcessedTs } = {}) {
  if (!Array.isArray(messages)) throw new TypeError('messages must be an array');
  const owner = typeof ownerId === 'string' ? ownerId.trim() : '';
  if (!/^[UW][A-Z0-9]+$/.test(owner)) throw new Error('ownerId must be a Slack member ID (U... or W...)');
  const after = tsMicros(afterTs);
  const last = lastProcessedTs === undefined || lastProcessedTs === null ? null : tsMicros(lastProcessedTs);
  const byTs = new Map();
  for (const m of messages) {
    if (!m || m.user !== owner || m.bot_id || m.subtype) continue;
    const at = tsMicros(m.ts);
    if (at <= after || byTs.has(m.ts)) continue;
    if (m.edited) {
      const editedTs = typeof m.edited.ts === 'string' ? m.edited.ts : m.ts;
      const key = tsMicros(editedTs);
      if (last !== null && key <= last) continue;
      byTs.set(m.ts, { key, item: { ts: m.ts, edited: true, editedTs } });
      continue;
    }
    if (last !== null && at <= last) continue;
    const text = String(m.text ?? '').trim();
    const item = APPROVAL_WORDS.includes(text) ? { ts: m.ts, word: text } : { ts: m.ts, question: true };
    byTs.set(m.ts, { key: at, item });
  }
  return [...byTs.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((e) => e.item);
}
