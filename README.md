# Flappy Fellas · Claude Lab

A separate, editable recreation of the original Camp Run game. The original published game's source and photos could not be recovered; this project does not replace or update it. Both character slots accept a local photo. No network dependencies.

## Play
Open `index.html` (keep `engine.js` in the same folder), or run `python -m http.server 8000` in this folder and visit `http://localhost:8000`. Tap or press Space to flap. Pick Camp Guy or Couch Guy. Add the original portraits using the photo inputs. Best scores are stored per character in local storage.

## Claude / coding agents
Give Claude the ZIP, or extract it into a coding workspace such as Claude Code. Ask Claude to open the HTML page if browser tools are available, play in step mode using the Flap/Wait buttons and inspect the JSON state. No time pressure. A browser with developer tools can call `FlappyLab.reset(42)`, `FlappyLab.state()`, `FlappyLab.step('flap', 8)`, `FlappyLab.step('wait', 8)`, or `FlappyLab.runPilot(3600)`. The returned state includes score, death, position, velocity, and next pipe gap bounds. `engine.js` also supports direct CommonJS import for headless tests without a browser. Run `node test.js` to check physics, collisions, scoring, replay determinism, and pilot performance.

## Suggested instruction for Claude
> Inspect this project. Play it interactively in step mode or use the shared deterministic engine in Node. Review gameplay balance, collision accuracy, responsiveness, mobile usability, accessibility, and maintainability. Improve the implementation directly in the files, add regression tests for every changed behavior, run `node test.js`, and report the test outcomes and remaining issues. Preserve both character options and support for original portraits. Do not claim to have browser-tested if browser access is unavailable. Do not overwrite the original published game.

## Files
- `index.html`: Canvas renderer, live play, step mode, portrait uploads, and browser API.
- `engine.js`: shared seeded physics and sample test pilot.
- `test.js`: Node regression checks.

This is an offline companion/recreation. Browser visual and touch testing still needs to be performed; Node tests only cover the engine. Photo crops are centered; portraits are not embedded or transmitted. Claude's ability to execute or edit depends on its environment.
