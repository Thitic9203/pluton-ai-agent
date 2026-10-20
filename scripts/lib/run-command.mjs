/* Run a command whose output may be large, with a buffer that says so and a failure that is loud.
 *
 * Node's execFileSync and spawnSync keep a child's output in memory up to maxBuffer, which is
 * 1 MiB when the caller does not set it. Past that, Node kills the child and reports ENOBUFS:
 * execFileSync throws, spawnSync returns `error` beside a truncated stdout. Either one, behind a
 * bare catch or a `status === 0 ? stdout : null`, reads exactly like "the file is not there".
 *
 * That is what happened on 1 Oct 2026: `mockup/prototype.html:5731@ac5ba623` was refused as not
 * in the tree, because the 2215161 byte blob went through a default buffer (docs/PITFALLS.md
 * 6.68). So a call
 * that reads repository files, full history or long process lists goes through here instead:
 * the buffer is explicit, and running out of it throws OutputTooLargeError after printing one
 * `::error::` line, so even a catch that swallows the throw cannot make the run quiet.
 *
 * No packages, only node:child_process, so the hooks and CI scripts can import it.
 */
import { execFileSync, spawnSync } from 'node:child_process';

/* Larger than anything this repository reads in one call by two orders of magnitude (the largest
 * tracked file is under 3 MB, and every commit sha in the whole history is under 1 MB). */
export const OUTPUT_LIMIT = 256 * 1024 * 1024;

export class OutputTooLargeError extends Error {
  constructor(command, args, maxBuffer) {
    super(`${[command, ...args].join(' ')} wrote more than ${maxBuffer} bytes, its maxBuffer, so its output `
      + 'was cut off and must not be read as an answer (ENOBUFS)');
    this.name = 'OutputTooLargeError';
    this.code = 'ENOBUFS';
  }
}

const tooLarge = (command, args, maxBuffer) => {
  const err = new OutputTooLargeError(command, args, maxBuffer);
  process.stderr.write(`::error::${err.message}\n`);
  return err;
};

/** execFileSync with an explicit maxBuffer; ENOBUFS becomes OutputTooLargeError, anything else is rethrown as is. */
export function runSync(command, args, options = {}) {
  const maxBuffer = options.maxBuffer ?? OUTPUT_LIMIT;
  try {
    return execFileSync(command, args, { ...options, maxBuffer });
  } catch (err) {
    if (err && err.code === 'ENOBUFS') throw tooLarge(command, args, maxBuffer);
    throw err;
  }
}

/** spawnSync with an explicit maxBuffer; ENOBUFS throws OutputTooLargeError instead of returning a cut off stdout. */
export function spawnChecked(command, args, options = {}) {
  const maxBuffer = options.maxBuffer ?? OUTPUT_LIMIT;
  const r = spawnSync(command, args, { ...options, maxBuffer });
  if (r.error && r.error.code === 'ENOBUFS') throw tooLarge(command, args, maxBuffer);
  return r;
}
