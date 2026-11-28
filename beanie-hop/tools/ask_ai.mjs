// Send a collaborator its handoff message through its API and save the reply where read_feedback.mjs looks.
//   node tools/ask_ai.mjs gemini                 send collab/out/gemini.md, save collab/feedback/gemini.md
//   node tools/ask_ai.mjs gemini --model gemini-3.5-flash --effort medium
//   node tools/ask_ai.mjs gemini --dry-run       show what would be sent, send nothing
// Works for any OpenAI-compatible chat API configured under "api" in collab/roles.json (enabled: true).
// The key comes from the environment variable named in "keyEnv". In a Claude cloud session the network
// proxy adds the saved key itself, so a placeholder is sent and replaced on the way out.
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadRoles } from './make_handoff.mjs';
import { parseFeedback } from './read_feedback.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const systemPrompt = (c, roles) => `You are ${c.name}, a reviewer on a small multi-AI team building the browser game "${roles.project}". ` +
  `Claude is the lead developer and will compare your review with other AIs' reviews before changing anything. ` +
  `You are being called through an API: you cannot run code, open the repository or see images, so write "ran-it: no". ` +
  `Be specific and critical, point at exact files and lines, and propose concrete changes. ` +
  `Reply ONLY in the reply format given in the message (reviewer / round / ran-it lines, then "### F1 <title>" blocks with ` +
  `"- severity:", "- area:", "- file:", "- problem:", "- fix:", "- confidence:" lines, then an optional "## Tests" section). ` +
  `Give between 6 and 15 findings, most important first.`;

async function post(url, body, key) {
  const args = ['-sS', '-m', '900', '-X', 'POST', url, '-H', 'Content-Type: application/json', '-H', `Authorization: Bearer ${key}`, '--data-binary', '@-', '-w', '\n%{http_code}'];
  if (/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) args.unshift('--noproxy', '*');
  const child = run('curl', args, { maxBuffer: 64 * 1024 * 1024 });
  child.child.stdin.end(JSON.stringify(body));
  const { stdout } = await child;
  const i = stdout.lastIndexOf('\n');
  const status = +stdout.slice(i + 1);
  let json = null;
  try { json = JSON.parse(stdout.slice(0, i)); } catch { /* non-JSON error body */ }
  if (Array.isArray(json)) json = json[0];
  return { status, json, raw: stdout.slice(0, i) };
}

/**
 * Ask collaborator `id`. Options override roles.json: model, effort, maxTokens, url, root, write.
 * Returns { model, text, parsed, usage, cost, attempts }.
 */
export async function askAI(id, opts = {}) {
  const root = opts.root || ROOT;
  const roles = loadRoles(root);
  const c = roles.collaborators.find((x) => x.id === id);
  if (!c) throw new Error('unknown collaborator ' + id);
  const api = c.api || {};
  if (!api.enabled && !opts.force) throw new Error(`${c.name} has no enabled API in collab/roles.json${api.note ? ' (' + api.note + ')' : ''}`);
  const url = opts.url || api.url;
  const key = process.env[api.keyEnv] || 'proxy-injected';
  const pack = fs.readFileSync(path.join(root, 'collab/out', id + '.md'), 'utf8');
  const models = [opts.model || api.model, ...(opts.model ? [] : api.fallbackModels || [])];
  const messages = [{ role: 'system', content: systemPrompt(c, roles) }, { role: 'user', content: pack }];
  const attempts = [];
  const usage = { prompt_tokens: 0, completion_tokens: 0 };

  const call = async (model, msgs) => {
    const body = { model, messages: msgs, max_tokens: opts.maxTokens || api.maxTokens || 32768 };
    const effort = opts.effort || api.effort;
    if (effort) body.reasoning_effort = effort;
    const r = await post(url, body, key);
    const err = r.json && r.json.error;
    attempts.push({ model, status: r.status, error: err ? String(err.message || err).slice(0, 160) : null });
    if (r.status !== 200 || err) return null;
    const u = r.json.usage || {};
    usage.prompt_tokens += u.prompt_tokens || 0;
    usage.completion_tokens += u.completion_tokens || 0;
    return r.json.choices?.[0]?.message?.content || '';
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const retryDelays = opts.retryDelays || [8000, 25000];
  let model = null, text = null;
  outer: for (const m of models) {
    for (let tries = 0; ; tries++) {
      text = await call(m, messages);
      if (text) { model = m; break outer; }
      const last = attempts[attempts.length - 1];
      if (last.status >= 500 && tries < retryDelays.length) { await wait(retryDelays[tries]); continue; } // overloaded: same model again
      if ([404, 429, 403, 400].includes(last.status) || last.status >= 500) break;        // unavailable or still overloaded: next model
      break outer;                                                                           // anything else: stop
    }
  }
  if (!text) throw new Error(`${c.name}: no reply. Attempts: ${JSON.stringify(attempts)}`);

  let parsed = parseFeedback(text, id);
  if (parsed.errors.length) { // one repair round: ask for the same review in the right format
    const fixed = await call(model, [...messages, { role: 'assistant', content: text },
      { role: 'user', content: 'A script could not read your reply: ' + parsed.errors.join('; ') + '. Re-send the whole review in exactly the reply format, nothing else.' }]);
    if (fixed) { const p2 = parseFeedback(fixed, id); if (p2.errors.length < parsed.errors.length) { text = fixed; parsed = p2; } }
  }

  const price = api.price || {};
  const cost = (usage.prompt_tokens * (price.input || 0) + usage.completion_tokens * (price.output || 0)) / 1e6;
  const when = new Date().toISOString();
  if (opts.write !== false) {
    const header = `<!-- ${c.name} via API: model ${model}, effort ${opts.effort || api.effort || 'default'}, ${when}, ` +
      `${usage.prompt_tokens} tokens in / ${usage.completion_tokens} out, est. cost $${cost.toFixed(4)} -->\n`;
    const body = /^\s*\**reviewer\**\s*:/im.test(text) ? text : `reviewer: ${id}\nround: ${roles.round}\nran-it: no\n\n${text}`;
    fs.mkdirSync(path.join(root, 'collab/feedback'), { recursive: true });
    fs.writeFileSync(path.join(root, 'collab/feedback', id + '.md'), header + body.trim() + '\n');
    fs.appendFileSync(path.join(root, 'collab/usage.jsonl'), JSON.stringify({ when, id, round: roles.round, model, ...usage, cost: +cost.toFixed(4), findings: parsed.findings.length, errors: parsed.errors.length }) + '\n');
  }
  return { model, text, parsed, usage, cost, attempts };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const id = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && !['--dry-run', '--force'].includes(args[i - 1])));
  if (!id) { console.error('usage: node tools/ask_ai.mjs <collaborator> [--model m] [--effort e] [--dry-run]'); process.exit(2); }
  if (args.includes('--dry-run')) {
    const roles = loadRoles(); const c = roles.collaborators.find((x) => x.id === id);
    const pack = fs.readFileSync(path.join(ROOT, 'collab/out', id + '.md'), 'utf8');
    console.log(`would send ${(Buffer.byteLength(pack) / 1024).toFixed(1)} KB to ${c.api && c.api.url} as ${opt('--model') || (c.api && c.api.model)}`);
    process.exit(0);
  }
  const t0 = Date.now();
  askAI(id, { model: opt('--model'), effort: opt('--effort'), force: args.includes('--force') }).then((r) => {
    console.log(`${id}: ${r.parsed.findings.length} findings from ${r.model} in ${((Date.now() - t0) / 1000).toFixed(0)}s, ` +
      `${r.usage.prompt_tokens} tokens in / ${r.usage.completion_tokens} out, est. cost $${r.cost.toFixed(4)}`);
    if (r.attempts.length > 1) console.log('attempts: ' + r.attempts.map((a) => `${a.model}=${a.status}`).join(', '));
    if (r.parsed.errors.length) { console.log('format problems: ' + r.parsed.errors.join('; ')); process.exit(1); }
  }).catch((e) => { console.error(e.message); process.exit(1); });
}
