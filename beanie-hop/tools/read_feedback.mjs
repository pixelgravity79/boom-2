// Collect the collaborators' replies and line them up for comparison.
//   node tools/read_feedback.mjs                 read collab/feedback/<id>.md (replies pasted in by hand)
//   node tools/read_feedback.mjs --fetch         also fetch each collab/<id> branch from origin and read its file
//   node tools/read_feedback.mjs --json          machine-readable output
// Exit code 1 if any reply is malformed, so a bad paste is caught instead of silently ignored.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRoles } from './make_handoff.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEVERITY = ['high', 'medium', 'low'];

/** Parse one reply. Tolerates chat noise: prose around it, **bold** keys, "F1:" or "F1 -" headings. */
export function parseFeedback(text, who = '?') {
  const out = { reviewer: who, round: null, ranIt: null, waiting: false, findings: [], tests: [], errors: [] };
  if (/^status:\s*waiting/im.test(text)) { out.waiting = true; return out; }
  const head = (k) => { const m = text.match(new RegExp('^\\s*\\**' + k + '\\**\\s*:\\s*\\**\\s*([^\\n*]+)', 'im')); return m ? m[1].trim() : null; };
  out.reviewer = (head('reviewer') || who).toLowerCase();
  out.round = head('round') ? parseInt(head('round'), 10) : null;
  const ran = head('ran-it');
  out.ranIt = ran ? /^yes/i.test(ran) : null;

  // findings
  const parts = text.split(/^#{2,4}\s*(?=F\d+\b)/m).slice(1);
  for (const part of parts) {
    const idm = part.match(/^F(\d+)[\s:.\-–—]*([^\n]*)/);
    const f = { id: 'F' + idm[1], title: idm[2].trim() };
    const body = part.split(/^#{1,4}\s/m)[0];
    let key = null;
    for (const raw of body.split('\n').slice(1)) {
      const m = raw.match(/^\s*[-*]\s*\**([a-z-]+)\**\s*:\s*\**\s*(.*)$/i);
      if (m) { key = m[1].toLowerCase(); f[key] = m[2].replace(/\*+$/, '').trim(); }
      else if (key && raw.trim() && !/^```/.test(raw.trim())) f[key] += ' ' + raw.trim();
    }
    f.severity = (f.severity || '').toLowerCase().split(/[\s|(]/)[0];
    if (!SEVERITY.includes(f.severity)) out.errors.push(`${who} ${f.id}: severity must be high, medium or low (got "${f.severity}")`);
    if (!f.problem) out.errors.push(`${who} ${f.id}: missing "problem"`);
    if (!f.fix) out.errors.push(`${who} ${f.id}: missing "fix"`);
    const fm = (f.file || '').match(/([\w./-]+\.\w+)(?::(\d+))?/);
    f.path = fm ? fm[1] : null;
    f.line = fm && fm[2] ? +fm[2] : null;
    out.findings.push(f);
  }
  const tests = text.split(/^##\s*Tests\s*$/im)[1];
  if (tests) for (const m of tests.matchAll(/```(?:js|javascript)?\n([\s\S]*?)```/g)) out.tests.push(m[1]);
  if (!out.findings.length && !out.waiting) out.errors.push(`${who}: no findings found (expected "### F1 ..." blocks)`);
  return out;
}

/** Read the reply for `id` from the collab/<id> branch of `remote`. Returns null if that branch doesn't exist. */
export function fetchBranchFeedback(id, { repo = path.resolve(ROOT, '..'), remote = 'origin', folder = path.basename(ROOT) } = {}) {
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try { git('fetch', '--quiet', remote, `collab/${id}`); } catch { return null; }
  try { return git('show', `FETCH_HEAD:${folder}/collab/feedback/${id}.md`); } catch { return null; }
}

/** Gather replies for every collaborator and find places where reviewers point at the same code. */
export function collect({ fetch = false, repo, remote, root = ROOT } = {}) {
  const roles = loadRoles(root);
  const replies = [];
  for (const c of roles.collaborators) {
    const sources = [];
    const local = path.join(root, 'collab/feedback', c.id + '.md');
    if (fs.existsSync(local)) sources.push({ from: 'collab/feedback/' + c.id + '.md', text: fs.readFileSync(local, 'utf8') });
    if (fetch) {
      const t = fetchBranchFeedback(c.id, { repo, remote });
      if (t) sources.push({ from: `branch collab/${c.id}`, text: t });
    }
    for (const s of sources) replies.push({ id: c.id, name: c.name, from: s.from, ...parseFeedback(s.text, c.id) });
  }
  const all = replies.filter((r) => !r.waiting).flatMap((r) => r.findings.map((f) => ({ ...f, by: r.id })));
  const overlaps = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    if (a.by === b.by || !a.path || a.path !== b.path) continue;
    if (a.line == null || b.line == null || Math.abs(a.line - b.line) <= 12) overlaps.push([a.by + ' ' + a.id, b.by + ' ' + b.id, a.path]);
  }
  return { round: roles.round, replies, overlaps, errors: replies.flatMap((r) => r.errors) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const res = collect({ fetch: args.includes('--fetch'), repo: opt('--repo'), remote: opt('--remote') });
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 1));
  else {
    console.log(`Round ${res.round} feedback`);
    for (const r of res.replies) {
      if (r.waiting) { console.log(`\n${r.name}: waiting (template, nothing received yet) [${r.from}]`); continue; }
      console.log(`\n${r.name} [${r.from}]  ran-it: ${r.ranIt === null ? '?' : r.ranIt ? 'yes' : 'no'}  findings: ${r.findings.length}  tests: ${r.tests.length}`);
      for (const f of r.findings) console.log(`  ${f.id.padEnd(4)} ${f.severity.padEnd(6)} ${(f.area || '').padEnd(11)} ${(f.file || 'n/a').padEnd(28)} ${f.title || f.problem.slice(0, 60)}`);
    }
    if (res.overlaps.length) {
      console.log('\nSame code, different reviewers: compare these before changing anything');
      for (const o of res.overlaps) console.log(`  ${o[0]}  <->  ${o[1]}   (${o[2]})`);
    }
    if (res.errors.length) { console.log('\nProblems:'); for (const e of res.errors) console.log('  ' + e); }
  }
  process.exit(res.errors.length ? 1 : 0);
}
