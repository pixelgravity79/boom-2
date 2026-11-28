// Build paste-ready handoff messages for the other AI collaborators.
//   node tools/make_handoff.mjs            -> collab/out/<id>.md for every collaborator in collab/roles.json
//   node tools/make_handoff.mjs grok       -> just one
// Each output file is the whole message: open it, copy all, paste into that AI. Nothing is sent from here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MAX_PACK_BYTES = 160 * 1024;

export const RESPONSE_FORMAT = `reviewer: <your id>
round: <round>
ran-it: yes | no        (yes only if you actually executed the code or the tests)

### F1 <short title>
- severity: high | medium | low
- area: gameplay | visuals | animation | performance | mobile | code | creative
- file: src/sim/game.js:120      (or n/a)
- problem: what is wrong or weak, concretely
- fix: the exact change you propose (numbers, code, or steps)
- confidence: high | medium | low

### F2 ...

## Tests
(optional) new tests as fenced \`\`\`js blocks in the style of tests/sim.test.js`;

const fence = (file, text) => {
  const ext = path.extname(file).slice(1) || 'text';
  const lang = { mjs: 'js', md: 'markdown', py: 'python' }[ext] || ext;
  const ticks = text.includes('```') ? '````' : '```';
  return `#### \`${file}\`\n${ticks}${lang}\n${text.replace(/\s+$/, '')}\n${ticks}\n`;
};

export function loadRoles(root = ROOT) {
  return JSON.parse(fs.readFileSync(path.join(root, 'collab/roles.json'), 'utf8'));
}

export function buildPack(roles, who, root = ROOT) {
  const c = roles.collaborators.find((x) => x.id === who);
  if (!c) throw new Error('unknown collaborator ' + who);
  const others = roles.collaborators.filter((x) => x.id !== who).map((x) => `${x.name} (${x.role.toLowerCase()})`).join(' and ');
  const L = [];
  L.push(`# ${roles.project}: round ${roles.round} review request for ${c.name}`);
  L.push('');
  L.push(`You're joining a small team building **${roles.project}**, an original voxel lane-hopping browser game for phones and desktop. The chicken's head is a real man's face from a photo.`);
  L.push(`Claude (Claude Code) is lead developer and integrates every change. ${others} are reviewing in parallel.`);
  L.push('Your review will be compared with theirs, so be specific and disagree openly where you think someone (including Claude) is wrong.');
  L.push('');
  L.push(`**Your role:** ${c.role}.`);
  L.push('');
  L.push('## How to work');
  if (c.delivery === 'repo') {
    L.push('If you can open a project folder and a terminal (for example in an IDE), please work from the real code:');
    L.push('```sh');
    L.push(`git clone ${roles.repo}.git && cd ${roles.repo.split('/').pop()}`);
    L.push(`git checkout ${roles.branch} && cd ${roles.folder}`);
    L.push('npm install && node tests/sim.test.js --quick');
    L.push('```');
    L.push(`Then write your findings into \`${roles.folder}/collab/feedback/${c.id}.md\` (replace the template, keep the format below).`);
    L.push(`Commit that one file on a new branch named \`collab/${c.id}\` and push it.`);
    L.push(`Please **don't change any other file**: Claude reads your branch and makes the changes, so the team keeps one source of truth.`);
    L.push('');
    L.push('If you can\'t use git, reply in chat in the format below instead. The source files are included at the end of this message.');
  } else if (c.delivery === 'api') {
    L.push('This message reaches you through your API, so you cannot run the code or open the repo. Set `ran-it: no`. The relevant source files are included at the end of this message.');
    L.push('Reply only in the format below; a script reads your reply and passes it to Claude.');
  } else {
    L.push('The relevant source files are included at the end of this message. Reply in chat in the format below; it will be passed back to Claude.');
  }
  L.push('');
  L.push('**Ground rules**');
  L.push('- Only say `ran-it: yes` if you actually executed the code or tests. Reading the code is fine; just say so.');
  L.push('- Point at exact files and lines. Propose concrete changes (values, code) rather than general advice.');
  L.push('- Rank by impact on how the game plays and looks on a phone.');
  L.push('');
  L.push('## What we need from you this round');
  c.asks.forEach((a, i) => L.push(`${i + 1}. ${a}`));
  L.push('');
  if (c.attach && c.attach.length) {
    L.push('## Images');
    L.push(`If you can see images, the user will attach these files from \`${roles.folder}/\`: ${c.attach.map((a) => '`' + a + '`').join(', ')}.`);
    L.push('');
  }
  L.push('## Reply format (please keep it exactly, it is read by a script)');
  L.push('```');
  L.push(RESPONSE_FORMAT.replace('<your id>', c.id).replace('<round>', String(roles.round)));
  L.push('```');
  L.push('');
  L.push('## Source files');
  for (const f of c.files) L.push(fence(f, fs.readFileSync(path.join(root, f), 'utf8')));
  return L.join('\n') + '\n';
}

export function writePacks(only = null, root = ROOT) {
  const roles = loadRoles(root);
  const outDir = path.join(root, 'collab/out');
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const c of roles.collaborators) {
    if (only && c.id !== only) continue;
    const text = buildPack(roles, c.id, root);
    const bytes = Buffer.byteLength(text);
    if (bytes > MAX_PACK_BYTES) throw new Error(`${c.id} pack is ${bytes} bytes, over ${MAX_PACK_BYTES}: trim its file list`);
    const file = path.join(outDir, c.id + '.md');
    fs.writeFileSync(file, text);
    written.push({ id: c.id, file: path.relative(root, file), bytes });
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const w of writePacks(process.argv[2] || null)) console.log(`${w.file.padEnd(24)} ${(w.bytes / 1024).toFixed(1)} KB`);
}
