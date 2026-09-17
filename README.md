# file-actions — file actions for chat transcripts

A Hermes **desktop plugin** that gives the assistant a way to hand you a file *and* its
location, inline in the conversation:

```
::filerow{path="C:\Users\you\Documents\proposal.docx"}
```

renders as a row with the file name, the full path, and three buttons:

| Button | What it does |
|---|---|
| **在文件夹中显示 / Reveal in folder** | Opens the OS file manager with the file **selected** (`shell.showItemInFolder`) |
| **用默认应用打开 / Open with default app** | Hands the path to the OS default application |
| **复制路径 / Copy path** | Copies the full path to the clipboard |

## Why this exists

Hermes promotes chat attachments as three kinds — `image`, `file`, `link`. Anything that
isn't an image gets a card whose only action is *download / hand to the OS default app*, and
the desktop's reveal capability (`revealPath`) is wired only into project menus: there is no
per-file action in the transcript. So "show me that file" meant downloading a copy you
already have on disk, and "where is it?" had no answer at all.

This plugin adds the missing action without touching core — it registers a transcript
directive (the same mechanism as core's `::preview{file="…"}`), so nothing renders unless the
model actually emits it. Installing it is a plugin, not a patch, so it survives
`hermes update`.

## Install

```bash
# from the curated catalog (if admitted)
hermes plugins search file-actions && hermes plugins install file-actions

# or straight from this repo
hermes plugins install <owner>/<repo>
```

Standalone desktop-only installs also work: drop `desktop/plugin.js` at
`<hermes home>/desktop-plugins/file-actions/plugin.js` (folder name == plugin id). The app
hot-loads that directory; if it doesn't appear, run **⌘K → Reload desktop plugins**.

## Usage (for the model / a skill)

Emit the directive alone on its own line:

```
::filerow{path="C:\Users\you\Documents\file.docx"}
::filerow{path="/home/you/code/my.project", kind="dir"}   # or a trailing separator; no guessing
::filerow{path="relative.md"}                            # resolved against the session cwd
::filerow{path="…", label="Proposal v3"}                 # optional display label
```

Attributes are treated as untrusted input: the path is length-capped, NUL-checked and passed
through only to the OS actions above — the plugin never reads the file's contents and never
sends the path anywhere.

## Requirements

- Hermes desktop app with plugin support (`ctx.os.revealPath` / `openExternal` /
  `writeClipboard`; these resolve `false` rather than throwing when a build doesn't expose
  them — the plugin then reports "not supported" instead of failing silently).
- No Python side, no backend, no capabilities to consent to: it is renderer-only.

## Notes

- i18n ships its own bundles (`en`, `zh`) via `ctx.i18n.register`; it never edits core `en.ts`.
- Styling uses the app's theme variables only — no hardcoded colors, no backgrounds.
- Companion idea (not included): converting `docx/xlsx/pptx/csv` to HTML for in-chat preview
  is an agent-side job (a script + `::preview{file="…"}`), not a plugin capability — a plugin
  can render UI, but it cannot shell out to convert a document.

## License

MIT — see `LICENSE`.
