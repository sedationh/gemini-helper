# Gemini Helper

A Tampermonkey userscript that enhances the [Gemini](https://gemini.google.com) experience. Some features are migrated from the [Gemini Voyager](https://github.com/nicepkg/gemini-voyager) browser extension.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Edge / Firefox / Safari)
2. Open `gemini-helper.user.js` and click **Install** in the Tampermonkey prompt
3. Visit [gemini.google.com](https://gemini.google.com) — all features activate automatically

## Features

### 1. Strip Dollar Signs from Copy

Gemini renders LaTeX formulas with `$` delimiters. When you copy text containing formulas, the raw `$` and `\` escape characters pollute your clipboard.

This feature intercepts all copy operations (selection copy, `navigator.clipboard.writeText`, `navigator.clipboard.write`) and automatically strips `$` signs and backslash-prefixed commands like `\min` → `min`.

**Before:** `$dp[i] = \min(dp[i], dp[i - coin] + 1)$`
**After:** `dp[i] = min(dp[i], dp[i - coin] + 1)`

No configuration needed — always active.

---

### 2. Chat Width

Freely adjust the chat content width for a better viewing experience, especially on wide monitors.

- A floating `↔` button appears at the bottom-right corner
- Click it to reveal a control panel with:
  - **Toggle switch** — enable / disable width override
  - **Slider** — adjust width from 30% to 100% of screen width
- Settings persist across sessions (saved in `localStorage`)
- Automatically re-applies when new messages load
- Supports dark mode

---

### 3. Default Model

Stop repeating yourself — auto-switch to your preferred model on every new chat.

- Open the model selector menu and you'll see a **★ star button** next to each model name
- Click the star to set that model as your default
- On every new conversation (`/app` or `/gem/*`), the script automatically:
  1. Detects the current model
  2. Opens the model menu
  3. Switches to your starred default
  4. Focuses the chat input
- Flash/Fast models are skipped (Gemini already defaults to them)
- Click the star again to clear the default
- Toast notifications confirm your actions
- Works with SPA navigation — no page reload needed

---

### 4. Timeline

A visual map for your mind — navigate long conversations at a glance.

- A vertical **timeline bar** appears on the right edge of the screen
- Each **dot** represents a user message in the conversation
- The **active dot** (green ring) shows which message you're currently viewing
- **Click** any dot to smooth-scroll to that message
- **Hover** over a dot to see a text preview tooltip
- **Scroll wheel** over the bar passes through to the main content
- Automatically updates when new messages are added
- Adapts to Gemini's light / dark theme
- Only shows on conversation routes (`/app`, `/gem/*`)
- Cleans up properly on navigation away

---

## Settings Storage

All settings are stored in `localStorage` under these keys:

| Key | Description |
|-----|-------------|
| `geminiHelperSettings` | Chat width enabled state and percentage |
| `geminiHelperDefaultModel` | Starred default model (`{id, name}`) |

No external network requests. No data leaves your browser.

## License

MIT
