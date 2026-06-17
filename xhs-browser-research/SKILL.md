---
name: xhs-browser-research
description: Use when researching Xiaohongshu or RedNote through a logged-in browser, especially for searches, filtered result review, note popup inspection, ad/scam screening, or candidate summary reports.
---

# xhs-browser-research

## Principle

Use a real logged-in browser session. Keep the same page alive, move slowly, and inspect note popups one at a time. Do not use the old `xiaohongshu-mcp`.

## Prerequisites

Before operating Xiaohongshu:

1. Check whether Playwright MCP is configured in `~/.codex/config.toml`.
2. Required profile/output directories:
   - `/Users/Apple/.codex/browser-mcp/xhs-profile`
   - `/Users/Apple/.codex/browser-mcp/output`
3. If missing, stop browser work and ask the user to approve installing/configuring Playwright MCP before continuing. After approval, create the directories and add this config:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest", "--browser", "chrome", "--user-data-dir", "/Users/Apple/.codex/browser-mcp/xhs-profile", "--output-dir", "/Users/Apple/.codex/browser-mcp/output", "--caps", "vision", "--viewport-size", "1280x900", "--timeout-action", "8000", "--timeout-navigation", "30000", "--shared-browser-context"]
```

If the MCP tool is not available in the current Codex session, use `scripts/xhs-controller.js` as a temporary controller, but keep it running and send commands through the same session. Do not repeatedly start one-shot Playwright scripts.

## Login

Open `https://www.xiaohongshu.com/explore` in the persistent profile. Tell the user to log in if needed. Wait up to 3 minutes, checking every 10-15 seconds. Do not refresh.

Login signals:

- Not logged in: `扫码`, `手机号登录`, `获取验证码`, `登录后推荐更懂你的笔记`
- Logged in: no login prompt and at least two of `发布`, `通知`, `我`, `创作中心`

If login is required or expires at any point during search, filtering, detail inspection, or report generation:

1. Stop the current browser action immediately.
2. Tell the user the browser is waiting for Xiaohongshu login.
3. Keep the same browser page open.
4. Wait up to 3 minutes, checking every 10-15 seconds.
5. After login succeeds, continue from the current task state instead of restarting the whole workflow.
6. If login is not completed within 3 minutes, report the blocked state and keep the page available for manual completion.

## Search Intent Defaults

Ask the user what kind of person/content they want to find. Infer filters from intent and confirm briefly before execution.

For dating/social intent such as `男找女`, `女找男`, `找对象`, `交友`, `脱单`, `相亲`, `搭子`:

- Query should include location if provided, e.g. `上海男找女`.
- Sort: `最新`
- Publish time: `一周内` by default, `一天内` if the user emphasizes now/recent/active.
- Distance: `同城`
- Type: `不限`

## Browser Interaction Rules

- Reuse the current Xiaohongshu page. Do not restart, reload, or close while the user is watching unless asked.
- Search input: prefer `#search-input`; fallback to `input[placeholder*="搜索"]`.
- Filter entry: visible `.filter` with text `筛选`.
- URL does not reliably change after filters. Verify via UI state, screenshot, or changed result cards.
- Xiaohongshu note details open as a modal/popup from the result list. Do not open many tabs and do not directly `goto()` note hrefs for detail inspection.
- To inspect a note, click the card image/cover area in the search result grid. Direct note URLs can show 404, QR-code verification, or incomplete pages. Treat card-cover click as the default detail-entry method.

## Slow Detail Inspection

Process candidates serially:

1. Wait for result cards to stabilize.
2. Click one visible card's image/cover area, not the note URL.
3. Wait for the modal/popup to appear.
4. Wait for author, body text, images, comments, and interaction counts to stabilize.
5. Extract details.
6. Close the popup.
7. Confirm the result list is visible again.
8. Pause 2-5 seconds before the next card.

Never rush continuous navigations. Base each next action on visible page state.

## Scam/Ad Screening

Do not claim a person is authentic. Only provide risk screening from visible evidence.

High-risk signals:

- `加微信`, `VX`, `私信`, `进群`, QR code, external app, paid service, investment/finance, resource sale.
- Red-matchmaker phrasing: `红娘`, `月老`, `中介`, `撮合`, if user wants direct personal posts.
- Template-like or very low-information posts.
- Abnormal titles like `别封我了`, obvious rule evasion, or repeated repost patterns.
- Comment section contains distrust or accusation.

Positive signals:

- Specific age, city/area, job, education, lifestyle, relationship intention.
- Normal profile history and multiple non-commercial life posts.
- Comments look organic and not purely promotional.

## Report Output

Prefer HTML for image-rich reports. Include URLs for every candidate.

Report sections:

- Search overview: query, inferred intent, filters, scanned count, inspected count, kept count, excluded count.
- Overall summary: result quality, common patterns, risk distribution.
- Candidate cards: nickname, title, URL, image, visible personal info, note text summary, comments summary, risk level, why kept, what to verify next.
- Excluded/deprioritized list: item and reason.
- Limitations: cannot verify identity; user should avoid transfers, unknown apps, QR groups, and pressure tactics.

## References

- `references/xhs-browser-notes.md` records observed selectors and UI behavior.
- `scripts/xhs-controller.js` is a temporary local controller for experimentation when MCP tools are unavailable in the active session.
