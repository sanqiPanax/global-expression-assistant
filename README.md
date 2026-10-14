# Global Expression Assistant · 全球表达助手

Turn your Chinese ideas into faithful English drafts for X, then keep a bilingual learning notebook. Includes seven tones, paired versions, glossary mappings, rewrite explanations, published history, expression bookmarks, full backups, and English read-aloud.

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

Each real generation makes up to **three model calls**: input review, generation, and output review. Paired versions are generated sequentially with different tones, using up to **six calls**. If the second fails, the first remains available. An edited draft review or an on-demand rewrite explanation makes one call. Requests time out after 45 seconds per call and are **not automatically retried**; an interrupted request can still incur provider charges. Check the provider dashboard before retrying.

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
2. Choose single post or thread, a tone, and faithful or X-native rewriting. Faithful is the default.
3. Confirm names, numbers, and Chinese intent. Adjust personal topic preferences if needed.
4. Generate, read the English and Chinese summary, and inspect detected issues.
5. Editing text or settings invalidates the check. Confirm Chinese and recheck before copying.
6. Copy a post or the entire thread, then manually paste and publish on X.
7. Save drafts explicitly. Repeated saves update the same draft; reopening a draft requires a fresh check.

Available tones:

| Tone | Intended use |
| --- | --- |
| Natural / 自然口语 | Plain everyday observations and tool experiences |
| Professional / 专业简洁 | Precise project and technical notes |
| Humorous / 幽默搞笑 | Light situational irony grounded in your input, without fabricated jokes |
| Casual / 轻松聊天 | Relaxed short sentences and conversational rhythm |
| Storytelling / 故事分享 | Connect events already present in the input; never invent people or scenes |
| Sharp / 克制犀利 | Direct observations that preserve uncertainty and avoid personal attacks |
| Warm / 温和真诚 | Gentle and sincere, without invented emotions or motivational slogans |

Tone affects wording and rhythm; preserving meaning takes priority. Faithful mode applies the tone subtly; X-native mode allows more restructuring. Changing a tone requires regeneration to rewrite the English; rechecking only reviews the current draft. Saved drafts retain their tone, including the original natural/professional drafts.

The app uses `twitter-text` for the standard **280 weighted-character** post limit, including links and emoji. It does not target paid-account long posts. Thread copy contains blank-line-separated posts, without automatic numbering; any numbering you add must fit within the limit.

## Bilingual notebook and language learning

- **Published history:** after manually posting on X, use “记录已发布”, check the final English, and save its date, optional X post URL, tags, and Chinese source. The archive does not verify publication or post for you. You can also manually add older published posts and edit their final wording. Demo outputs cannot be marked published through the draft action.
- **Chinese / English comparison:** the archive distinguishes full Chinese source from optional user-authored Chinese segments per thread post. It never treats a back-translation as the original or invents sentence alignment.
- **Search and tags:** search Chinese, English, contexts and glossary text. Comma-separated topic tags filter drafts, publications and phrase bookmarks. Use the tag button on an existing draft to update its topics.
- **Expression bookmarks:** select a sentence in the English editor and click “收藏表达”, or bookmark a phrase from an explanation. Save its Chinese meaning, usage context and tags; edit or delete it later.
- **Rewrite explanation:** explain a post on demand. The model describes meaning, tone and contextual phrase usage in Chinese; quoted phrases must exist in the supplied English. Instructions discourage invented examples and categorical grammar claims. Explanations can be wrong and do not change check status. Editing source, English or matched glossary entries marks the explanation stale. Save the draft to keep its explanations.
- **Two versions:** enable the checkbox and choose another tone. Both versions are shown for comparison; “使用这版” switches the editable version. Each has its own checks. Saving a draft keeps both. Reopening any saved or imported version requires a fresh check.
- **Glossary:** save a Chinese term/project name and its fixed English spelling. Only terms appearing in the source are sent to the model, at most 50 matches per request. Values are treated as data, never instructions. Changing a matching mapping invalidates the previous check.
- **English TTS:** read a post, the current full thread, a published entry or a bookmarked expression. Choose an English voice and 0.75× / 1× / 1.25× speed; stop playback at any time. Uses browser/OS speech synthesis without a model API call. Voice availability depends on the device; local English voices are preferred. Some voices use online synthesis governed by the browser/OS. This provides playback, not audio-file export.

## Backup and recovery

“导出完整备份” downloads a versioned JSON file containing **saved** drafts (including two versions and explanations), published records, bookmarks, tags and glossary entries. Unsaved editor changes are not included. Model credentials stay in the server `.env` and are not exported. Backups contain personal writing: keep them private.

“导入备份” validates the complete file before a confirmation and merge. Equal record IDs retain the newer `updatedAt`; repeated imports do not duplicate those IDs. Duplicate glossary spellings retain the newer mapping. Unsupported formats, invalid links, oversized collections or full browser storage leave existing records untouched. The import file limit is 10 MB; actual browser storage quotas may be smaller.

Old browser-local drafts migrate automatically on first load. The legacy copy is removed only after the new library is stored successfully. If existing data is unreadable, writing is paused: export its raw recovery file first, then restore a valid backup.

## Checks and limits

- Personal political, sexual, and crypto topic preferences are configurable. They are not legal judgments.
- Local keyword checks run before generation; real mode also uses semantic model review before and after generation.
- Numbers missing from or introduced into English are flagged for human confirmation. Unit conversions may cause false positives.
- Statuses distinguish no detected issue, needs confirmation, personal-rule block, pending recheck, review failure, and demo.
- Blocked, failed, stale, or overlength drafts cannot use the copy buttons. Warnings and demo outputs require acknowledgement.
- These checks can miss issues, particularly when the same model writes and reviews the text. Back-translation is an aid, not proof. You remain the final reviewer; tests do not establish a zero-miss guarantee.
- No live web research, fact verification, cloud history, accounts, recording, scheduling, or automatic posting.
- Library data is unencrypted local browser storage, specific to the device, browser and origin. Limits: 1,000 drafts, 1,000 published records, 2,000 bookmarks and 200 glossary entries. Hitting a limit reports an error; older records are not silently discarded. Clearing browser data loses the library; a shared device can expose it. Explicit deletion removes this application's copy, not provider logs or exported backup files.
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

Run syntax checks after the final edit, including UI text changes, before committing. Earlier passing checks do not cover subsequent edits.

Optional browser checks:

```sh
npx playwright install chromium
npm run test:browser
npm run test:learning
```

Or set `BROWSER_PATH` to an existing Chrome/Edge executable. Browser checks cover desktop/mobile layout, clipboard, edits invalidating checks, confirmation, topic settings, threads, migration, published archives, bookmarks, glossary, paired-generation failures, backup round trips and storage failures. TTS scheduling uses mocked voices; audible output requires a device with usable English voices. Screenshots go to ignored `test-results/`.

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
