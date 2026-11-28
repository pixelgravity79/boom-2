# Collaboration log

Only verified events go here. Anything an AI did is recorded only once its reply has actually arrived and been read.

## Round 1: review of the simulation, face pipeline and renderer code

| AI | Message | Sent | Reply | Model that actually answered | Cost |
|---|---|---|---|---|---|
| ChatGPT | `collab/out/chatgpt.md` | 2026-11-28, pasted by the user | 17 findings + 7 tests, `collab/feedback/chatgpt.md` | chosen in the ChatGPT app, not verifiable here; it says it did not run the code and flagged its own statistics as unverified | user's subscription |
| Gemini | `collab/out/gemini.md` | 2026-11-28, through the Gemini API (free tier) | 10 findings, `collab/feedback/gemini.md` | `gemini-3.5-flash`, high reasoning effort (`gemini-3.8-flash` was overloaded with 503 errors three times; `gemini-4-neon` needs paid billing) | $0, 21,538 tokens in / 2,171 out |
| Grok | `collab/out/grok.md` | 2026-11-28, pasted by the user | 5 findings + 2 tests, `collab/feedback/grok.md` | chosen in the Grok app, not verifiable here; it says `ran-it: yes`, but its second test fails as written, so treated as unverified | user's subscription |

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

### What Claude did with ChatGPT's and Grok's findings

Each claim was reproduced against the unchanged code first, with a one-off script; its results are in the "Verified?" column. The same cases are now regression tests in `tests/sim.test.js`, which fail on the old code and pass on the new.

| Finding | Verified? | Decision |
|---|---|---|
| ChatGPT F2: no limit on runs of dangerous rows | **Yes, exactly as reported.** Seed 97 had a 47-row run (rows 222–268); grass was 22% at rows 250–399. | **Fixed.** Runs are capped at 3 / 4 / 5 / 7 by row (rows 0–19, 20–59, 60–149, 150+) and river runs at 3. Grass is now 27–31% late. Test: 300 seeds × 700 rows. |
| ChatGPT F3: a buffered hop dodges the swept-off-the-log death | **Yes** | **Fixed.** Each step now resolves the swept check and hazards *before* starting a buffered hop. |
| ChatGPT F4 + Grok F3 (both): mid-hop collisions switch lanes at exactly half-way | Yes (by reading; behaviour as described) | **ChatGPT's fix used.** You're hittable in a lane only while your hitbox overlaps it, so in both lanes only around mid-hop. **Grok's "check both lanes for the whole hop" rejected:** it would kill you after you'd visibly cleared a car. Two tests. |
| ChatGPT F5: you can land on decorative lily pads outside the playfield | **Yes** (stood at x = 5) | **Fixed.** Scenery pads are stored apart (`decorPads`) and pads outside the playfield never hold you. Two tests. |
| ChatGPT F6: a fatal landing still awards corn and score | Yes, but only within a single 1/120 s tick | **Fixed.** Landing is now checked first and rewarded only if you survive. |
| ChatGPT F9: input buffer drops corrections; `input('toString')` | **Yes:** `input('toString')` crashed the game | **Fixed.** Only real direction names are accepted, a correction replaces the stale buffered move, buffered moves expire after 0.4 s (ChatGPT suggested 0.25 s, which would drop legitimate rapid taps), and the buffer clears on pause. "Opposite direction cancels" was not adopted: tap-forward then back should hop and come back. Three tests. |
| ChatGPT F11 + Grok F1 (both): log tolerance is 0.1, not the documented 0.3 | **Yes** | **Fixed** to the documented 0.3: a middle ground between ChatGPT's 0.15 and Grok's 0.45. Test. |
| ChatGPT F10: clock runs on the title screen; landing isn't tick-exact | Partly | **Hops are now exactly 18 ticks** (tested). **Keeping traffic moving on the title screen is deliberate,** so the title-screen freeze test was not adopted. Seeded replays are deterministic (tested). |
| ChatGPT F7: difficulty retune | Compared with the code: many of its anchor values already matched | **Used:** speedster lanes only from row 20 and capped at 5.8 tiles/s; centre column clear on rows 0–3; lily pads 38% → 18%; first railway after row 18; trains every 10–14 s early and 6.5–9 s late, with 1.5 s of warning early. |
| ChatGPT F8 + Grok F5: the eagle comes too soon | Agreed | **Eagle distance 4.3 rows** (Grok 4.2, ChatGPT 4.4). Camera creep starts gentler (0.30 rows/s) and ramps to the same top speed. The pressure line was already separate from the drawn camera and never moves back. **New: eagle warning** (red edge pulse + distant screech) before it strikes; tested in the browser on all four devices. |
| Grok F5: hop time 0.16 s | Judgement call | **0.15 s,** between the old 0.135 and Grok's 0.16, and an exact 18 ticks. |
| ChatGPT F13: fairness tests overstate | Agreed | **Added the acceptance test it proposed:** the bot reaches row 150 on 98/100 seeds (bar: 95). The bot's lookahead was lengthened after one of its failures turned out to be bot short-sightedness, not an unfair level. |
| ChatGPT F15: turning speed depends on frame rate | Yes | **Fixed** with exponential smoothing. |
| ChatGPT F14: face readability | Agreed on the goal | **Camera lowered from 54° to 46°,** so the face is seen more head-on (about 18% taller on screen). In-play trees made shorter so they never hide the chicken. Face glow lowered to 0.14 (ChatGPT 0.12, Gemini 0.06). Head size kept: same on-screen size as its proposal. |
| ChatGPT F16: death personality | Partly | **Used:** a 0.12 s hit-stop on impact and new captions. Its "Hogwarts Express" line was not used: it names someone else's brand. |
| ChatGPT F12: architecture boundaries | Agreed in part | **Added `drainEvents()`.** Separate cosmetic RNG and immutable lanes are deferred: no current bug comes from them. |
| ChatGPT F1: hop up the screen instead, head turned to the camera | Design disagreement | **Not changed; left to the owner.** Going toward the camera is what keeps the face visible the whole time. Its proposal needs the head turned backwards on the body, and an A/B test with real players, which can't be run here. |
| ChatGPT F17: unlockable accessories, daily challenge | Ideas | **Backlog.** Kept the name Beanie Hop, which ChatGPT also preferred. |
| Grok F2: you can't step off a log at the edge | **No.** Forward off a log at x = 4.7 already lands on column 4 (the sideways case it describes stays on the river). | **Rejected.** Its test was fixed (it jumped into water before reaching the log) and kept as a guard. |
| Grok F4: hazard checks are slow on phones | **No:** 0.30 µs per step, about 0.004% of one CPU core | **Rejected.** |

## Next round

Round 2 starts once the game is published. Gemini goes through the API again, now with gameplay screenshots that don't show the face. ChatGPT and Grok get their messages through you.
