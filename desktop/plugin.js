/**
 * file-actions — OS actions for a file the assistant mentions in chat.
 *
 * Registers the transcript directive `::filerow{path="…"}` (same mechanism as core's
 * `::preview{file="…"}`): the model puts the directive alone on a line and the row renders
 * inline in its message with
 *
 *   [reveal]  ctx.os.revealPath  → the OS file manager, with the file SELECTED
 *   [open]    ctx.os.openExternal(file://…)
 *   [copy]    ctx.os.writeClipboard
 *
 * Why a plugin: chat attachments are promoted as `image | file | link`; a non-image file
 * opens by handing it to the OS default app, and the desktop's reveal capability is wired
 * only into project menus — there is no per-file action in the transcript. This adds one,
 * with no core changes (so it survives `hermes update`).
 *
 * Layout: <hermes home>/plugins/file-actions/{plugin.yaml,desktop/plugin.js}
 *   (standalone desktop-only variant: <hermes home>/desktop-plugins/file-actions/plugin.js)
 * Public API only: @hermes/plugin-sdk, react, react/jsx-runtime. No JSX syntax — jsx() calls.
 */
import { cn, haptic, host, TRANSCRIPT_DIRECTIVE_AREA, usePluginI18n } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'file-actions'
const DIRECTIVE = 'filerow'
const MAX_PATH = 4096

/** ctx.os is captured at register() — components have no ctx. */
let os = null

/** Attributes are untrusted model output: validate before touching the filesystem. */
function safePath(raw) {
  const v = String(raw ?? '').trim().replace(/^["']+|["']+$/g, '')
  if (!v || v.length > MAX_PATH || v.includes('\0')) return ''
  return v
}

/** Absolute paths and URLs pass through; relative ones resolve against the session cwd. */
function resolvePath(p) {
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\')) return p
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return p
  let cwd = ''
  try {
    cwd = host.state.cwd?.get?.() || ''
  } catch {
    cwd = ''
  }
  if (!cwd) return p
  return cwd.replace(/[\\/]+$/, '') + (cwd.includes('\\') ? '\\' : '/') + p
}

function fileUrl(p) {
  const norm = p.replace(/\\/g, '/')
  return 'file://' + (/^[a-zA-Z]:/.test(norm) || norm.startsWith('//') ? '/' : '') + norm
}

// A UNC path is untrusted, model-supplied text: shell.showItemInFolder would make
// Windows dial that host and offer NTLM credentials, so reveal is never offered for it.
function isUncPath(p) {
  return p.startsWith('\\\\') || p.startsWith('//')
}

function basename(p) {
  const t = p.replace(/[\\/]+$/, '')
  return t.split(/[\\/]/).pop() || t
}

const BUTTON = [
  'inline-flex items-center gap-1 rounded border border-(--ui-stroke-secondary) px-1.5 py-[2px]',
  'text-[0.6875rem] leading-4 text-(--ui-text-secondary) transition-colors',
  'hover:bg-(--chrome-action-hover) hover:text-foreground'
].join(' ')

function button(label, title, onClick) {
  return jsx('button', { type: 'button', title, className: BUTTON, onClick, children: label })
}

function FileRow({ attrs, streaming }) {
  const t = usePluginI18n(ID)
  const raw = safePath(attrs?.path)
  if (!raw) {
    return jsx('div', {
      className: 'text-(--ui-text-quaternary) text-xs',
      children: t('missingPath', DIRECTIVE)
    })
  }
  const path = resolvePath(raw)
  const name = String(attrs?.label ?? '').trim() || basename(path)
  const explicitKind = String(attrs?.kind ?? '').trim().toLowerCase()
  // Only an explicit kind or a trailing separator means "folder" — guessing from a dot in the
  // last segment misreads `my.project` (a directory) and `README` (a file) on every OS.
  const isDir = explicitKind === 'dir' || /[\\/]$/.test(String(attrs?.path ?? ''))

  const run = async (fn, okKey, failKey) => {
    let ok = false
    try {
      ok = (await fn()) !== false
    } catch {
      ok = false
    }
    host.notify({ kind: ok ? 'info' : 'error', message: ok ? t(okKey) : t(failKey) })
  }

  const onReveal = () => {
    haptic('tap')
    if (!os?.revealPath) return void host.notify({ kind: 'error', message: t('unsupported') })
    void run(() => os.revealPath(path), 'revealed', 'revealFailed')
  }
  const onOpen = () => {
    haptic('tap')
    if (!os?.openExternal) return void host.notify({ kind: 'error', message: t('unsupported') })
    void run(() => os.openExternal(fileUrl(path)), 'opened', 'openFailed')
  }
  const onCopy = () => {
    haptic('tap')
    if (!os?.writeClipboard) return void host.notify({ kind: 'error', message: t('unsupported') })
    void run(() => os.writeClipboard(path), 'copied', 'copyFailed')
  }

  return jsxs('div', {
    className: cn(
      'my-1.5 flex w-full flex-col gap-1.5 rounded-md border border-(--ui-stroke-secondary)',
      'px-2.5 py-2 text-left'
    ),
    children: [
      jsxs('div', {
        className: 'flex flex-wrap items-center gap-2',
        children: [
          jsx('span', { className: 'text-[0.8125rem] font-medium', children: name }),
          jsx('span', {
            className: 'text-(--ui-text-quaternary) text-[0.6875rem]',
            children: isDir ? t('kindDir') : t('kindFile')
          }),
          streaming
            ? jsx('span', { className: 'text-(--ui-text-quaternary) text-[0.6875rem]', children: '…' })
            : null
        ].filter(Boolean)
      }),
      jsx('div', {
        className: 'select-all break-all font-mono text-[0.6875rem] leading-4 text-(--ui-text-tertiary)',
        children: path
      }),
      jsxs('div', {
        className: 'flex flex-wrap items-center gap-1',
        children: [
          isUncPath(path) ? null : button(t('reveal'), t('revealTip'), onReveal),
          button(t('open'), t('openTip'), onOpen),
          button(t('copy'), t('copyTip'), onCopy)
        ].filter(Boolean)
      })
    ]
  })
}

export default {
  id: ID,
  name: 'File actions',
  register(ctx) {
    os = ctx?.os ?? os

    // Ship our own strings; values are literals or interpolators (never edit core en.ts).
    ctx.i18n.register({
      en: {
        missingPath: arg => `::${arg} needs a path attribute`,
        kindFile: 'file',
        kindDir: 'folder',
        reveal: 'Reveal in folder',
        revealTip: 'Show in the OS file manager, with the file selected',
        open: 'Open with default app',
        openTip: 'Hand the file to the OS default application',
        copy: 'Copy path',
        copyTip: 'Copy the full path to the clipboard',
        revealed: 'Revealed in the file manager',
        revealFailed: 'Could not reveal the file',
        opened: 'Opened with the default app',
        openFailed: 'Could not open the file',
        copied: 'Path copied',
        copyFailed: 'Could not copy the path',
        unsupported: 'This desktop build does not expose OS actions to plugins'
      },
      zh: {
        missingPath: arg => `::${arg} 需要一个 path 属性`,
        kindFile: '文件',
        kindDir: '目录',
        reveal: '在文件夹中显示',
        revealTip: '在系统文件管理器中定位（会选中该文件）',
        open: '用默认应用打开',
        openTip: '交给系统默认程序打开',
        copy: '复制路径',
        copyTip: '把完整路径复制到剪贴板',
        revealed: '已在文件管理器中定位',
        revealFailed: '定位失败',
        opened: '已用默认应用打开',
        openFailed: '打开失败',
        copied: '路径已复制',
        copyFailed: '复制失败',
        unsupported: '这个桌面版本没有向插件开放系统操作'
      },
      // Core ships en / zh / zh-hant / ja / ar / ru; normalizeLocale folds zh-CN,
      // zh-Hans → 'zh' and zh-TW, zh-HK → 'zh-hant'. Locales this plugin does not
      // carry fall back to `en` by design — add a bundle rather than guessing.
      'zh-hant': {
        missingPath: arg => `::${arg} 需要一個 path 屬性`,
        kindFile: '檔案',
        kindDir: '資料夾',
        reveal: '在資料夾中顯示',
        revealTip: '在系統檔案管理員中定位（會選取該檔案）',
        open: '用預設應用程式開啟',
        openTip: '交給系統預設程式開啟',
        copy: '複製路徑',
        copyTip: '把完整路徑複製到剪貼簿',
        revealed: '已在檔案管理員中定位',
        revealFailed: '定位失敗',
        opened: '已用預設應用程式開啟',
        openFailed: '開啟失敗',
        copied: '路徑已複製',
        copyFailed: '複製失敗',
        unsupported: '這個桌面版本沒有向插件開放系統操作'
      },
      ja: {
        missingPath: arg => `::${arg} には path 属性が必要です`,
        kindFile: 'ファイル',
        kindDir: 'フォルダー',
        reveal: 'フォルダーで表示',
        revealTip: 'OS のファイルマネージャーで選択して表示します',
        open: '既定のアプリで開く',
        openTip: 'OS の既定のアプリケーションで開きます',
        copy: 'パスをコピー',
        copyTip: 'フルパスをクリップボードにコピーします',
        revealed: 'ファイルマネージャーで表示しました',
        revealFailed: '表示できませんでした',
        opened: '既定のアプリで開きました',
        openFailed: '開けませんでした',
        copied: 'パスをコピーしました',
        copyFailed: 'コピーできませんでした',
        unsupported: 'このデスクトップ版はプラグインに OS 操作を公開していません'
      }
    })

    ctx.register({
      id: DIRECTIVE,
      area: TRANSCRIPT_DIRECTIVE_AREA,
      data: {
        name: DIRECTIVE,
        render: props => jsx(FileRow, { attrs: props.attrs, streaming: props.streaming })
      }
    })
  }
}
