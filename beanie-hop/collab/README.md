# Working with ChatGPT, Gemini and Grok

Claude can't reach the other AIs directly. This session has no connector, API key or browser for ChatGPT, Google's Gemini or Grok. So collaboration goes through you, and git is the shared source of truth.

Each AI gets a ready-made message. Their replies come back in a fixed format that Claude reads with a script. Then Claude compares the reviewers, settles disagreements and makes the changes.

| AI | Setup you asked for | Role | How it gets the work |
|---|---|---|---|
| ChatGPT | GPT-6, High Effort, regular chat | architecture, code review, debugging, gameplay, creative direction | paste `collab/out/chatgpt.md` into a chat |
| Gemini | Gemini Neon 4 High in Antigravity | visuals, animation, performance, independent testing | open the repo in Antigravity and paste `collab/out/gemini.md` |
| Grok | Grok in Cursor, 4.7 Expert | mechanics, optimisation, edge cases, technical review | open the repo in Cursor and paste `collab/out/grok.md` |

You choose those model settings inside each app; Claude can't see or verify them.

## Each round

1. **Claude** updates `collab/STATUS.md` and the asks in `collab/roles.json`, runs `node tools/make_handoff.mjs`, and pushes.
2. **You** open `beanie-hop/collab/out/<name>.md` on GitHub (use the "Raw" view), copy all of it, and paste it into that AI. For Gemini, also attach the four images it lists from `beanie-hop/assets/`.
3. **The reply comes back** in one of two ways:
   - **Gemini and Grok in an IDE:** they commit their reply to `beanie-hop/collab/feedback/<name>.md` on a branch called `collab/<name>` and push it. Just tell Claude "Grok pushed", for example.
   - **ChatGPT, or anyone replying in chat:** paste the reply to Claude, or into `collab/feedback/<name>.md`.
4. **Claude** runs `node tools/read_feedback.mjs --fetch`. It reads both places, rejects replies that are malformed, and lists where two reviewers point at the same code, so their advice can be compared before anything changes. Claude records what it accepted or rejected, and why, in `collab/LOG.md`.

## Files

| Path | What |
|---|---|
| `collab/roles.json` | who does what, which files each AI sees, this round's questions |
| `collab/STATUS.md` | shared project status, included in every message |
| `collab/out/*.md` | generated paste-ready messages (don't edit; regenerate) |
| `collab/feedback/*.md` | replies; templates say `status: waiting` until a real reply arrives |
| `collab/LOG.md` | what was sent, what came back, and what was done with it |
| `tools/make_handoff.mjs` | builds the messages |
| `tools/read_feedback.mjs` | reads and checks replies, from files and from `collab/*` branches |
| `tests/collab.test.js` | tests for both tools, including the git branch route |
