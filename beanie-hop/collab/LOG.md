# Collaboration log

Only verified events go here. Anything an AI did is recorded only once its reply has actually arrived and been read.

## Round 1: review of the simulation, face pipeline and renderer code

| AI | Message | Sent | Reply | Model that actually answered | Cost |
|---|---|---|---|---|---|
| ChatGPT | `collab/out/chatgpt.md` | not yet (copy-and-paste route) | not yet | n/a | n/a |
| Gemini | `collab/out/gemini.md` | 2026-11-28, through the Gemini API (free tier) | 10 findings, `collab/feedback/gemini.md` | `gemini-3.5-flash`, high reasoning effort (`gemini-3.8-flash` was overloaded with 503 errors three times; `gemini-4-neon` needs paid billing) | $0, 21,538 tokens in / 2,171 out |
| Grok | `collab/out/grok.md` | not yet (copy-and-paste or Cursor route) | not yet | n/a | n/a |

Gemini reviewed the code only. It could not run the game (`ran-it: no`), and no images were sent: on the free tier Google may use what is sent, so the photo stays out.

### What Claude did with Gemini's findings

Every finding was checked against the running game with real-browser screenshots before deciding.

| # | Finding | Decision | Why / evidence |
|---|---|---|---|
| F6 | Railway warning lights are off-screen on phones | **Accepted, fixed** | Correct: the posts were at x = ±4.95 in a 9.6-tile-wide phone view. Moved to ±4.62 (`lanes.js`). |
| F9 | Hop has no forward lean | **Accepted, fixed** | Added a 0.16 rad lean during the hop arc. Gemini's sign was backwards (it would lean back), so the sign was corrected. |
| F4 | Tiny chicken parts cast shadows | **Accepted in part** | Comb, beak, wattle and feet no longer cast shadows. Measured: about 80 draw calls per frame in total, so this was minor. |
| F7 | Green car blends with the grass | **Accepted in part** | Green car changed to teal. Rejected "logs look like tree trunks": logs are only ever on blue water. |
| F2 | Face glows in shadow like a sticker | **Accepted in part** | Emissive lowered from 0.32 to 0.20, not to 0.06. At 0.06 the face goes dull and harder to recognise on a phone. |
| F1 | Move the beak up to the mouth | **Rejected** | The beak would cover the mustache and mouth, which are key to recognising him. Close-up screenshots confirm the beak under the chin reads well. |
| F3 | Car-death pancake sinks the face into the road | **Rejected** | The maths ignored the 0.14 flattening scale. Screenshot: the face lies flat and fully visible on the road. |
| F10 | Merge each lane's ground and props into one mesh | **Rejected** | They are separate on purpose: only props cast shadows, so the huge ground slab never draws into the shadow map. |
| F5 | Centre the face crop on the eyes | **Not changed for now** | The face is a 3/4 view; the current crop keeps nose and chin inside the head. Kept for round 2 with screenshots. |
| F8 | Softer mask edge, tighter contact shadow | **Not changed for now** | No halo is visible in phone-size screenshots. Kept for round 2 with screenshots. |

Bugs found by Claude's own browser testing in the same period (not by Gemini):
- **Chicken disappeared** at low frame rates: the squash spring exploded. Fixed with a sub-stepped spring (`src/render/spring.js`); covered by tests from 10 to 240 fps.
- **The game-over card covered the flattened chicken.** The camera now frames it in the top third; there is an e2e check for it.

## Next round

Round 2 starts once the game is published. Gemini goes through the API again, now with gameplay screenshots that don't show the face. ChatGPT and Grok get their messages through you.
