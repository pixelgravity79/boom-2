// Tests for the multi-AI collaboration tools.  Run: node tests/collab.test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRoles, buildPack, writePacks, MAX_PACK_BYTES } from '../tools/make_handoff.mjs';
import { parseFeedback, fetchBranchFeedback, collect } from '../tools/read_feedback.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + String(e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

const roles = loadRoles();

console.log('handoff packs');
test('roles cover ChatGPT, Gemini and Grok with a role, files and questions', () => {
  const ids = roles.collaborators.map((c) => c.id).sort().join();
  assert(ids === 'chatgpt,gemini,grok', ids);
  for (const c of roles.collaborators) {
    assert(c.role && c.asks.length >= 3 && c.files.length >= 3, c.id);
    for (const f of [...c.files, ...(c.attach || [])]) assert(fs.existsSync(path.join(ROOT, f)), `${c.id}: missing ${f}`);
  }
});
test('every pack embeds each of its source files verbatim', () => {
  for (const c of roles.collaborators) {
    const pack = buildPack(roles, c.id);
    for (const f of c.files) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\s+$/, '');
      assert(pack.includes('`' + f + '`') && pack.includes(src), `${c.id}: ${f} not embedded intact`);
    }
  }
});
test('every pack carries its questions, the reply format and the ground rules', () => {
  for (const c of roles.collaborators) {
    const pack = buildPack(roles, c.id);
    for (const a of c.asks) assert(pack.includes(a), `${c.id}: ask missing`);
    assert(pack.includes(`reviewer: ${c.id}`) && pack.includes('### F1') && pack.includes('- severity:'), `${c.id}: reply format missing`);
    assert(pack.includes('ran-it: yes'), `${c.id}: honesty rule missing`);
  }
});
test('IDE collaborators get git instructions for their own collab/<id> branch', () => {
  for (const c of roles.collaborators.filter((x) => x.delivery === 'repo')) {
    const pack = buildPack(roles, c.id);
    assert(pack.includes(`git checkout ${roles.branch}`) && pack.includes(`collab/${c.id}`) && pack.includes(`collab/feedback/${c.id}.md`), c.id);
  }
});
test('packs fit in a chat message and contain no personal details', () => {
  for (const w of writePacks()) {
    assert(w.bytes < MAX_PACK_BYTES, `${w.id}: ${w.bytes} bytes`);
    const text = fs.readFileSync(path.join(ROOT, w.file), 'utf8');
    assert(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(text.replace(/noreply@[\w.]+/g, '')), `${w.id}: contains an email address`);
  }
});
test('generated packs on disk are up to date with the sources', () => {
  for (const c of roles.collaborators) {
    const disk = fs.readFileSync(path.join(ROOT, 'collab/out', c.id + '.md'), 'utf8');
    assert(disk === buildPack(roles, c.id), `${c.id}: stale, run node tools/make_handoff.mjs`);
  }
});

console.log('reading replies');
const GOOD = `Sure! Here is my review.

reviewer: grok
round: 1
ran-it: yes

### F1 Log edge hop lands in water
- severity: high
- area: gameplay
- file: src/sim/game.js:88
- problem: hopping forward off a log at x=4.6 rounds to 5 and bumps,
  so the player is swept a moment later.
- fix: clamp the target column when leaving a log.
- confidence: medium

### F2: Bot is slow
- **severity:** low
- **area:** performance
- **file:** src/sim/bot.js
- **problem:** clones every branch
- **fix:** reuse clones
- **confidence:** high

## Tests
\`\`\`js
test('edge hop', () => {});
\`\`\`
Hope this helps!`;

test('parses a well-formed reply, including chat noise and bold keys', () => {
  const r = parseFeedback(GOOD, 'grok');
  assert(r.errors.length === 0, r.errors.join('; '));
  assert(r.reviewer === 'grok' && r.round === 1 && r.ranIt === true);
  assert(r.findings.length === 2, 'findings ' + r.findings.length);
  const [a, b] = r.findings;
  assert(a.severity === 'high' && a.path === 'src/sim/game.js' && a.line === 88, JSON.stringify(a));
  assert(a.problem.includes('swept a moment later'), 'multi-line value lost');
  assert(b.title === 'Bot is slow' && b.severity === 'low' && b.fix === 'reuse clones', JSON.stringify(b));
  assert(r.tests.length === 1 && r.tests[0].includes('edge hop'));
});
test('rejects malformed findings instead of ignoring them', () => {
  const r = parseFeedback('reviewer: chatgpt\n### F1 x\n- severity: urgent\n- problem: p\n', 'chatgpt');
  assert(r.errors.some((e) => e.includes('severity')) && r.errors.some((e) => e.includes('fix')), r.errors.join('; '));
  const empty = parseFeedback('Looks great, no notes!', 'gemini');
  assert(empty.errors.length === 1, 'prose-only reply should be flagged');
});
test('the shipped templates read as "waiting", not as errors', () => {
  for (const c of roles.collaborators) {
    const r = parseFeedback(fs.readFileSync(path.join(ROOT, 'collab/feedback', c.id + '.md'), 'utf8'), c.id);
    assert(r.waiting && r.errors.length === 0, c.id);
  }
  const res = collect();
  assert(res.errors.length === 0 && res.replies.every((r) => r.waiting), 'collect() on templates');
});

console.log('git branch route');
test('a reply pushed to collab/<id> is fetched and parsed (temporary repos)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beanie-collab-'));
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const remote = path.join(tmp, 'remote.git'), ai = path.join(tmp, 'ai'), lead = path.join(tmp, 'lead');
    execFileSync('git', ['init', '--quiet', '--bare', remote]);
    // the "AI" side: clone, write its feedback on its own branch, push
    execFileSync('git', ['clone', '--quiet', remote, ai], { stdio: 'ignore' });
    git(ai, 'checkout', '--quiet', '-b', 'collab/grok');
    fs.mkdirSync(path.join(ai, 'beanie-hop/collab/feedback'), { recursive: true });
    fs.writeFileSync(path.join(ai, 'beanie-hop/collab/feedback/grok.md'), GOOD);
    git(ai, 'add', '.');
    git(ai, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--quiet', '-m', 'grok feedback');
    git(ai, 'push', '--quiet', 'origin', 'collab/grok');
    // the lead side: a separate clone that has never seen that branch
    execFileSync('git', ['clone', '--quiet', remote, lead], { stdio: 'ignore' });
    const text = fetchBranchFeedback('grok', { repo: lead, remote: 'origin', folder: 'beanie-hop' });
    assert(text && text.includes('Log edge hop'), 'branch reply not fetched');
    const r = parseFeedback(text, 'grok');
    assert(r.findings.length === 2 && r.errors.length === 0, 'parse after fetch');
    assert(fetchBranchFeedback('gemini', { repo: lead, remote: 'origin', folder: 'beanie-hop' }) === null, 'missing branch should be null');
    const res = collect({ fetch: true, repo: lead, remote: 'origin' });
    const fromBranch = res.replies.find((x) => x.from === 'branch collab/grok');
    assert(fromBranch && fromBranch.findings.length === 2, 'collect() with --fetch');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('two reviewers on the same code are flagged for comparison', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beanie-overlap-'));
  try {
    fs.mkdirSync(path.join(tmp, 'collab/feedback'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'collab/roles.json'), path.join(tmp, 'collab/roles.json'));
    fs.writeFileSync(path.join(tmp, 'collab/feedback/grok.md'), GOOD);
    fs.writeFileSync(path.join(tmp, 'collab/feedback/chatgpt.md'), 'reviewer: chatgpt\n### F1 Edge clamp is wrong\n- severity: medium\n- file: src/sim/game.js:92\n- problem: p\n- fix: f\n');
    fs.writeFileSync(path.join(tmp, 'collab/feedback/gemini.md'), 'status: waiting\n');
    const res = collect({ root: tmp });
    assert(res.errors.length === 0, res.errors.join('; '));
    assert(res.overlaps.length === 1 && res.overlaps[0][2] === 'src/sim/game.js', JSON.stringify(res.overlaps));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
