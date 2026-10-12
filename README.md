# Global Expression Assistant · 全球表达助手

Turn your Chinese ideas into faithful English drafts for X. A small self-hosted writing tool: one text box, two styles, single posts or threads, personal topic checks, and browser-local drafts.

中文想法 → 确认原意 → 英文单帖 / Thread → 编辑复检 → 复制到 X。使用输入法自带语音输入即可，本项目不录音、不登录 X、不自动发布。

## Quick start

Requires **Node.js 22.9+** and npm. On Windows, double-click **`start.cmd`** (keep its terminal open while using the app). Or use:

```sh
npm ci
npm start
```

Open **http://127.0.0.1:3210**. With no API credentials, the application runs in **demo mode**: fixed sample text, not a translation of your input. You can test editing, rules, copying, and saved drafts without paying for a model.

## Connect a model

Copy `.env.example` to `.env`, then configure:

```dotenv
MODEL_BASE_URL=https://YOUR-PROVIDER/v1
MODEL_API_KEY=YOUR_KEY
MODEL_NAME=YOUR_MODEL
```

Restart `npm start`. The provider must support the compatible `POST /chat/completions` protocol, JSON object responses (`response_format`), and system/user messages. This is a protocol adapter, not a claim that every provider is compatible. No specific paid provider is required.

Each real generation makes up to **three model calls**: input review, generation, and output review. An edited draft review makes one call. Requests time out after 45 seconds per call and are **not automatically retried**; an interrupted request can still incur provider charges. Check the provider dashboard before retrying.

API keys remain on the local server; do not paste them into source text or commit `.env`. The remote model URL must use HTTPS (loopback HTTP is allowed for local models/tests). Browser input and output text are sent to the configured model. Provider retention and training policies depend on your provider; this app cannot delete its records.

### OpenCode Go

Verified with a local Go subscription and `minimax-m2.5` on 2026-10-12:

```dotenv
MODEL_BASE_URL=https://opencode.ai/zen/go/v1
MODEL_NAME=minimax-m2.5
MODEL_API_KEY=YOUR_GO_KEY
MODEL_SESSION_HEADER=x-opencode-session
```

Go returned `MissingSessionID` without its routing header. The app generates an identifier for its own server session and sends it through the configured header; it stays the same across generation and review calls. No key or draft content is used in that identifier.

This provider sometimes wraps its JSON in one Markdown code fence despite JSON mode. The parser accepts either plain JSON or exactly one complete JSON fence; malformed JSON or surrounding prose still fails validation.

One synthetic Chinese sample completed generation plus both reviews in approximately **24.7 seconds**, producing a **167-character** weighted post. A subsequent edited-number check took **6.9 seconds** and flagged `20 → 200`. This verifies connectivity and these paths, not broad writing quality or guaranteed latency. Subscription limits and available models can change; refer to your account for consumption.

An optional **paid external API** smoke check is available after configuring `.env`:

```sh
node --env-file=.env scripts/live-smoke.mjs
```

It uses synthetic input, makes up to four successful model calls, and stores results only in ignored `test-results/go-live.json`. It is excluded from regular tests and CI.

## Workflow

1. Type or paste Chinese; your system input method can supply speech-to-text.
2. Choose single post or thread, natural or professional style, faithful or X-native rewriting. Faithful is the default.
3. Confirm names, numbers, and Chinese intent. Adjust personal topic preferences if needed.
4. Generate, read the English and Chinese summary, and inspect detected issues.
5. Editing text or settings invalidates the check. Confirm Chinese and recheck before copying.
6. Copy a post or the entire thread, then manually paste and publish on X.
7. Save drafts explicitly. Repeated saves update the same draft; reopening a draft requires a fresh check.

The app uses `twitter-text` for the standard **280 weighted-character** post limit, including links and emoji. It does not target paid-account long posts. Thread copy contains blank-line-separated posts, without automatic numbering; any numbering you add must fit within the limit.

## Checks and limits

- Personal political, sexual, and crypto topic preferences are configurable. They are not legal judgments.
- Local keyword checks run before generation; real mode also uses semantic model review before and after generation.
- Numbers missing from or introduced into English are flagged for human confirmation. Unit conversions may cause false positives.
- Statuses distinguish no detected issue, needs confirmation, personal-rule block, pending recheck, review failure, and demo.
- Blocked, failed, stale, or overlength drafts cannot use the copy buttons. Warnings and demo outputs require acknowledgement.
- These checks can miss issues, particularly when the same model writes and reviews the text. Back-translation is an aid, not proof. You remain the final reviewer; tests do not establish a zero-miss guarantee.
- No live web research, fact verification, cloud history, accounts, recording, scheduling, or automatic posting.
- Drafts are unencrypted local browser storage, limited to the latest 100 saved drafts. This is device/browser specific. Clearing browser data loses them; a shared device can expose them. Explicit deletion removes this application's copy, not provider logs.
- Text remains in the editor after a request error; unsaved text is lost on reload. Save important drafts.

## Phone / trusted LAN

The interface works on mobile screens. To access the local service from your phone on the same trusted network, set `HOST=0.0.0.0` in `.env`, restart, then open `http://YOUR-COMPUTER-LAN-IP:3210`. Firewall configuration may be required. Clipboard access may be unavailable on HTTP LAN pages; manually select and copy the text instead.

**Do not expose this development server to the public internet.** There is no login or per-user quota; LAN clients can consume your configured API credits. Default binding is loopback. For public hosting, add authentication, HTTPS, request limits and provider budget controls first.

## Development and validation

```sh
npm run check
npm test
```

Tests cover actual HTTP flows using a mock model service, not a paid external model. They include semantic precheck blocks, output review failures, malformed responses, length rules, origin protection and concurrent request rejection.

Optional browser checks:

```sh
npx playwright install chromium
npm run test:browser
```

Or set `BROWSER_PATH` to an existing Chrome/Edge executable. Browser checks cover desktop/mobile layout, clipboard, edits invalidating checks, confirmation, topic settings, threads, and draft persistence. Screenshots go to ignored `test-results/`.

Before claiming translation quality, evaluate 20–30 real Chinese samples with your configured model. See [the MVP specification](docs/MVP.md).

## Project structure

```text
server.js             HTTP server, provider adapter, review orchestration
lib/core.js           validation, personal rules, counting, prompts
public/               responsive UI; browser-local drafts
test/                 unit and HTTP integration tests
scripts/              optional browser checks
docs/MVP.md           agreed scope and acceptance criteria
```

The UI is served by the same Node server, without a frontend build step. Only the X text-counting library is a runtime dependency. Model generation and review are separate calls; cloud storage and speculative provider abstractions are deferred.

## Contributing / License

Issues and small pull requests are welcome. Please do not include real API keys, private draft text or identifying information in bug reports. Run checks/tests and describe the behavior you changed.

MIT. An independent project, not affiliated with X or a model vendor.
