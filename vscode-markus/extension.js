const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const execFile = promisify(cp.execFile);

/** @type {MarkusPreviewManager | null} */
let previewManager = null;

/** @type {vscode.ExtensionContext | null} */
let extensionContext = null;

/** @type {vscode.Uri | null} */
let lastMksUri = null;

/**
 * @param {vscode.Uri | undefined} uri
 */
function isMksUri(uri) {
  if (!uri) {
    return false;
  }
  const p = (uri.fsPath || uri.path || "").toLowerCase();
  return p.endsWith(".mks");
}

/**
 * Find the .mks file to preview even when the terminal or webview has focus.
 * @param {vscode.Uri | undefined} preferred
 * @returns {vscode.Uri | null}
 */
function resolveMksUri(preferred) {
  if (preferred && isMksUri(preferred)) {
    return preferred;
  }

  const active = vscode.window.activeTextEditor;
  if (active && isMksUri(active.document.uri)) {
    return active.document.uri;
  }

  for (const ed of vscode.window.visibleTextEditors) {
    if (isMksUri(ed.document.uri)) {
      return ed.document.uri;
    }
  }

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputText && isMksUri(input.uri)) {
        return input.uri;
      }
    }
  }

  if (lastMksUri && isMksUri(lastMksUri)) {
    return lastMksUri;
  }

  return null;
}

/**
 * @param {vscode.Uri} uri
 * @returns {vscode.TextDocument | undefined}
 */
function getOpenDocument(uri) {
  return vscode.workspace.textDocuments.find(
    (d) => d.uri.toString() === uri.toString()
  );
}

/**
 * @param {vscode.Uri} uri
 */
function basename(uri) {
  const p = uri.fsPath || uri.path || "document.mks";
  return path.basename(p);
}

class MarkusPreviewManager {
  constructor() {
    /** @type {vscode.WebviewPanel | null} */
    this.panel = null;
    /** @type {vscode.Uri | null} */
    this.currentUri = null;
    this.debounceTimer = null;
    this.buildToken = 0;
    /** @type {vscode.Uri[]} */
    this.resourceRoots = [];
  }

  openPreview(uri) {
    const docUri = resolveMksUri(uri);
    if (!docUri) {
      vscode.window.showWarningMessage(
        "Open a .mks file in the editor, then run Markus Preview again."
      );
      return;
    }

    lastMksUri = docUri;
    this.currentUri = docUri;
    this._ensurePanel(docUri);
    this.panel.reveal(vscode.ViewColumn.Beside, false);
    this.panel.title = `Preview: ${basename(docUri)}`;
    this._setStatus("Compiling LaTeX… (panel opens immediately)");
    void this.refresh(docUri);
  }

  _ensurePanel(docUri) {
    this.resourceRoots = this._resourceRootsFor(docUri);
    if (this.panel) {
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "markusPreview",
      "Markus Preview",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.resourceRoots,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
      this.currentUri = null;
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
    });

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "exportPdf") {
        void exportPdf(this.currentUri || undefined);
      }
      if (msg.type === "exportTex") {
        void exportTex(this.currentUri || undefined);
      }
    });
  }

  scheduleRefresh(uri) {
    if (!this.panel) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration("markus", uri);
    const ms = cfg.get("preview.debounceMs", 1000);
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.refresh(uri);
    }, ms);
  }

  /**
   * @param {vscode.Uri} [uri]
   */
  async refresh(uri) {
    const targetUri = uri || this.currentUri;
    if (!targetUri || !this.panel) {
      return;
    }

    const token = ++this.buildToken;
    this._setStatus("Compiling LaTeX… (first run may take ~30s)");

    try {
      const document = getOpenDocument(targetUri);
      const pdfPath = await compileMks(targetUri, document);
      if (token !== this.buildToken) {
        return;
      }

      this.resourceRoots = this._resourceRootsFor(targetUri, pdfPath);
      this.panel.webview.options = {
        ...this.panel.webview.options,
        localResourceRoots: this.resourceRoots,
      };

      const pdfBase64 = fs.readFileSync(pdfPath).toString("base64");
      const viewerJs = this.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(extensionContext.extensionUri, "media", "viewer.js")
      );
      const pdfJsUrl = this.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(extensionContext.extensionUri, "media", "pdf.min.js")
      );
      const workerUrl = this.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(extensionContext.extensionUri, "media", "pdf.worker.min.js")
      );

      const nonce = getNonce();
      const csp = [
        "default-src 'none'",
        "worker-src blob: " + this.panel.webview.cspSource,
        `script-src 'nonce-${nonce}' ${this.panel.webview.cspSource}`,
        "style-src 'unsafe-inline'",
      ].join("; ");

      this.panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <style>
    html, body { margin: 0; height: 100%; background: #1e1e1e; color: #ccc; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    #wrap { height: 100%; display: flex; flex-direction: column; }
    #toolbar { flex: 0 0 auto; padding: 6px 10px; font-size: 12px; border-bottom: 1px solid #333; color: #aaa; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    #toolbar .actions, #toolbar .zoom { display: flex; align-items: center; gap: 6px; }
    #toolbar button { background: #333; color: #ddd; border: 1px solid #555; border-radius: 4px; height: 22px; cursor: pointer; font-size: 11px; line-height: 1; padding: 0 8px; }
    #toolbar button:hover { background: #444; }
    #toolbar .zoom button { width: 26px; padding: 0; font-size: 14px; }
    #zoom-label { min-width: 42px; text-align: center; font-variant-numeric: tabular-nums; }
    #canvas-wrap { flex: 1 1 auto; overflow: auto; text-align: center; padding: 8px 0 24px; }
    canvas.page { display: block; margin: 0 auto 12px; box-shadow: 0 2px 12px #0008; background: #fff; image-rendering: auto; }
    #loading { padding: 2rem; color: #aaa; }
  </style>
</head>
<body>
  <div id="wrap">
    <div id="toolbar"></div>
    <div id="canvas-wrap"><div id="loading">Rendering PDF…</div></div>
  </div>
  <script nonce="${nonce}" src="${viewerJs}"></script>
  <script nonce="${nonce}">
    window.MARKUS_PREVIEW = {
      pdfData: ${JSON.stringify(pdfBase64)},
      pdfJsUrl: ${JSON.stringify(pdfJsUrl.toString())},
      workerUrl: ${JSON.stringify(workerUrl.toString())},
      enableExport: true
    };
    if (window.markusBootViewer) window.markusBootViewer();
  </script>
</body>
</html>`;
    } catch (err) {
      if (token !== this.buildToken) {
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this._setError(msg);
    }
  }

  /**
   * @param {vscode.Uri} uri
   * @param {string} [pdfPath]
   */
  _resourceRootsFor(uri, pdfPath) {
    const roots = new Set();
    if (extensionContext) {
      roots.add(extensionContext.extensionUri);
    }
    const dir = path.dirname(uri.fsPath);
    roots.add(vscode.Uri.file(dir));
    roots.add(vscode.Uri.file(path.join(dir, ".markus-preview")));
    const ws = vscode.workspace.getWorkspaceFolder(uri);
    if (ws) {
      roots.add(ws.uri);
    }
    if (pdfPath) {
      roots.add(vscode.Uri.file(path.dirname(pdfPath)));
    }
    return [...roots];
  }

  /** @param {string} text */
  _setStatus(text) {
    if (!this.panel) {
      return;
    }
    this.panel.webview.html = `<!DOCTYPE html><html><body style="margin:0;background:#1e1e1e;color:#aaa;font-family:sans-serif;">
      <div class="status" style="padding:2rem;text-align:center;"><span class="spin" style="display:inline-block;width:12px;height:12px;border:2px solid #666;border-top-color:#ddd;border-radius:50%;animation:r .8s linear infinite;margin-right:6px;"></span>${escapeHtml(text)}</div>
      <style>@keyframes r{to{transform:rotate(360deg)}}</style></body></html>`;
  }

  /** @param {string} msg */
  _setError(msg) {
    if (!this.panel) {
      return;
    }
    this.panel.webview.html = `<!DOCTYPE html><html><body style="margin:0;background:#1e1e1e;">
      <pre class="err" style="color:#f48771;padding:1rem;white-space:pre-wrap;font:12px ui-monospace,monospace;">${escapeHtml(msg)}</pre>
    </body></html>`;
  }
}

/**
 * @param {vscode.Uri} uri
 * @param {vscode.TextDocument | undefined} document
 * @param {{ pdf?: boolean }} options
 */
async function buildMks(uri, document, options = { pdf: true }) {
  const wantPdf = options.pdf !== false;
  const fsPath = uri.fsPath || uri.path;
  if (!fsPath) {
    throw new Error("Cannot resolve file path for this .mks document.");
  }
  const outDir = path.join(path.dirname(fsPath), ".markus-preview");
  fs.mkdirSync(outDir, { recursive: true });

  const stem = path.basename(fsPath, ".mks");
  if (wantPdf) {
    for (const ext of [".aux", ".bbl", ".blg", ".fdb_latexmk", ".fls", ".log", ".out"]) {
      const stale = path.join(outDir, stem + ext);
      try {
        if (fs.existsSync(stale)) {
          fs.unlinkSync(stale);
        }
      } catch {
        /* ignore */
      }
    }
  }

  let sourcePath = fsPath;
  if (document && document.uri.fsPath === fsPath && document.isDirty) {
    sourcePath = path.join(outDir, path.basename(fsPath));
    fs.writeFileSync(sourcePath, document.getText(), "utf8");
  }

  const cli = await resolveMarkusCli(uri);
  if (cli._bundledMissing || !cli.command) {
    throw new Error(formatMarkusNotFoundError(cli, true));
  }
  const cwd = path.dirname(fsPath);
  const args = [...cli.prefix, "build", sourcePath, "-o", outDir];
  if (!wantPdf) {
    args.push("--tex-only");
  }

  try {
    await execFileWithTimeout(
      cli.command,
      args,
      {
        cwd,
        env: envWithTexPath(),
        maxBuffer: 16 * 1024 * 1024,
      },
      180000
    );
  } catch (e) {
    const err = /** @type {NodeJS.ErrnoException & {stdout?: string; stderr?: string}} */ (e);
    if (err.code === "ENOENT") {
      throw new Error(formatMarkusNotFoundError(cli, Boolean(cli._bundledMissing)));
    }
    const parts = [err.message];
    if (err.stderr) {
      parts.push(err.stderr);
    }
    if (err.stdout) {
      parts.push(err.stdout);
    }
    throw new Error(parts.join("\n"));
  }

  const base = path.basename(sourcePath, ".mks");
  const artifacts = {
    outDir,
    tex: path.join(outDir, base + ".tex"),
    pdf: path.join(outDir, base + ".pdf"),
  };
  if (wantPdf && !fs.existsSync(artifacts.pdf)) {
    throw new Error(
      "PDF was not produced. Install TeX Live / MacTeX and ensure latexmk is on PATH."
    );
  }
  if (!fs.existsSync(artifacts.tex)) {
    throw new Error("LaTeX (.tex) was not produced.");
  }
  return artifacts;
}

/**
 * @param {vscode.Uri} uri
 * @param {vscode.TextDocument | undefined} document
 */
async function compileMks(uri, document) {
  const artifacts = await buildMks(uri, document, { pdf: true });
  return artifacts.pdf;
}

/**
 * @param {vscode.Uri | undefined} uri
 */
async function exportPdf(uri) {
  const docUri = resolveMksUri(uri);
  if (!docUri) {
    vscode.window.showWarningMessage("Open a .mks file to export.");
    return;
  }
  const doc = getOpenDocument(docUri);
  const fsPath = docUri.fsPath || docUri.path;
  const defaultName = path.basename(fsPath, ".mks") + ".pdf";

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Markus",
      cancellable: false,
    },
    async () => {
      const pdfPath = await compileMks(docUri, doc);
      const dest = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(path.dirname(fsPath), defaultName)),
        filters: { PDF: ["pdf"] },
        saveLabel: "Export PDF",
      });
      if (!dest) {
        return;
      }
      fs.copyFileSync(pdfPath, dest.fsPath);
      const open = "Open PDF";
      const choice = await vscode.window.showInformationMessage(
        `Exported PDF to ${dest.fsPath}`,
        open
      );
      if (choice === open) {
        await vscode.env.openExternal(dest);
      }
    }
  );
}

/**
 * @param {vscode.Uri | undefined} uri
 */
async function exportTex(uri) {
  const docUri = resolveMksUri(uri);
  if (!docUri) {
    vscode.window.showWarningMessage("Open a .mks file to export.");
    return;
  }
  const doc = getOpenDocument(docUri);
  const fsPath = docUri.fsPath || docUri.path;
  const defaultName = path.basename(fsPath, ".mks") + ".tex";

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Markus",
      cancellable: false,
    },
    async () => {
      const artifacts = await buildMks(docUri, doc, { pdf: false });
      const dest = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(path.dirname(fsPath), defaultName)),
        filters: { LaTeX: ["tex"] },
        saveLabel: "Export LaTeX",
      });
      if (!dest) {
        return;
      }
      fs.copyFileSync(artifacts.tex, dest.fsPath);
      const open = "Open .tex";
      const choice = await vscode.window.showInformationMessage(
        `Exported LaTeX to ${dest.fsPath}`,
        open
      );
      if (choice === open) {
        const doc = await vscode.workspace.openTextDocument(dest);
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    }
  );
}

/**
 * @param {string} p
 */
function isExecutableFile(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Walk upward from a folder looking for .venv/bin/markus (or Windows Scripts).
 * @param {string} startDir
 */
function findVenvMarkusUpward(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const unix = path.join(dir, ".venv", "bin", "markus");
    const win = path.join(dir, ".venv", "Scripts", "markus.exe");
    const unixPy = path.join(dir, ".venv", "bin", "python");
    const winPy = path.join(dir, ".venv", "Scripts", "python.exe");
    if (isExecutableFile(unix)) {
      return { command: unix, prefix: [] };
    }
    if (isExecutableFile(win)) {
      return { command: win, prefix: [] };
    }
    if (isExecutableFile(unixPy)) {
      return { command: unixPy, prefix: ["-m", "markus"] };
    }
    if (isExecutableFile(winPy)) {
      return { command: winPy, prefix: ["-m", "markus"] };
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function whichOnPath(name, env) {
  const isWin = process.platform === "win32";
  try {
    const r = cp.execFileSync(isWin ? "where" : "which", [name], {
      encoding: "utf8",
      env,
      timeout: 5000,
    });
    const line = r.trim().split(/\r?\n/)[0];
    if (line && isExecutableFile(line)) {
      return line;
    }
  } catch {
    /* not on PATH */
  }
  return null;
}

/**
 * @returns {string | null}
 */
function getBundledRunPy() {
  if (!extensionContext) {
    return null;
  }
  const runPy = path.join(extensionContext.extensionPath, "bundled", "run.py");
  const pkgDir = path.join(extensionContext.extensionPath, "bundled", "markus");
  if (fs.existsSync(runPy)) {
    if (fs.existsSync(path.join(pkgDir, "cli.py"))) {
      return runPy;
    }
  }
  return null;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
function findPythonExecutable(env) {
  const isWin = process.platform === "win32";
  const names = isWin
    ? ["python3.exe", "python.exe"]
    : ["python3", "python"];
  for (const name of names) {
    const hit = whichOnPath(name, env);
    if (hit) {
      return hit;
    }
  }
  const fallbacks = isWin
    ? [
        path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python312", "python.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python311", "python.exe"),
        "C:\\Python312\\python.exe",
        "C:\\Python311\\python.exe",
      ]
    : [
        "/opt/homebrew/bin/python3",
        "/usr/local/bin/python3",
        "/usr/bin/python3",
      ];
  for (const p of fallbacks) {
    if (p && isExecutableFile(p)) {
      return p;
    }
  }
  if (isWin) {
    try {
      const r = cp.execFileSync("py", ["-3", "-c", "import sys; print(sys.executable)"], {
        encoding: "utf8",
        env,
        timeout: 8000,
      });
      const line = r.trim().split(/\r?\n/).pop();
      if (line && isExecutableFile(line)) {
        return line;
      }
    } catch {
      /* py launcher missing */
    }
  }
  return null;
}

/**
 * @returns {{ command: string, prefix: string[] } | null}
 */
function resolveBundledCompiler() {
  const runPy = getBundledRunPy();
  if (!runPy) {
    return null;
  }
  const env = envWithTexPath();
  const python = findPythonExecutable(env);
  if (!python) {
    return null;
  }
  return { command: python, prefix: [runPy] };
}

/**
 * @param {{ command: string, prefix: string[] }} cli
 * @param {boolean} bundledMissing
 */
function formatMarkusNotFoundError(cli, bundledMissing) {
  const tried = cli.command + (cli.prefix.length ? ` ${cli.prefix.join(" ")}` : "");
  if (bundledMissing) {
    return (
      `Python 3 not found — cannot run the Markus compiler bundled in this extension.\n\n` +
      `Tried: ${tried}\n\n` +
      "Install Python 3.10+ on this machine (or remote server), then reload the window.\n" +
      "macOS: brew install python3\n" +
      "Ubuntu: sudo apt install python3 python3-pip"
    );
  }
  return (
    `Markus CLI not found (${tried}).\n\n` +
    "Reinstall the Markus VSIX (v0.4+) so the compiler is bundled, or set\n" +
    "Settings → Markus: Cli Path → full path to markus or python."
  );
}

/**
 * @param {vscode.Uri} uri
 * @returns {Promise<{ command: string, prefix: string[] }>}
 */
async function resolveMarkusCli(uri) {
  const cfg = vscode.workspace.getConfiguration("markus", uri);
  const custom = String(cfg.get("cliPath", "")).trim();
  if (custom) {
    if (isExecutableFile(custom)) {
      if (/python(?:3)?(?:\.exe)?$/i.test(custom)) {
        return { command: custom, prefix: ["-m", "markus"] };
      }
      return { command: custom, prefix: [] };
    }
    return { command: custom, prefix: [] };
  }

  const runPy = getBundledRunPy();
  if (runPy) {
    const bundled = resolveBundledCompiler();
    if (bundled) {
      return bundled;
    }
    return { command: "", prefix: [], _bundledMissing: true };
  }

  const fsPath = uri.fsPath || uri.path;
  const fileDir = fsPath ? path.dirname(fsPath) : process.cwd();

  const fromFile = findVenvMarkusUpward(fileDir);
  if (fromFile) {
    return fromFile;
  }

  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder) {
    const fromWs = findVenvMarkusUpward(folder.uri.fsPath);
    if (fromWs) {
      return fromWs;
    }
  }

  const env = envWithTexPath();
  const onPath = whichOnPath("markus", env);
  if (onPath) {
    return { command: onPath, prefix: [] };
  }

  const py = findPythonExecutable(env);
  if (py) {
    return { command: py, prefix: ["-m", "markus"] };
  }

  return { command: "markus", prefix: [] };
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build PATH so latexmk is found when Cursor spawns without your shell profile. */
/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('child_process').ExecFileOptions} opts
 * @param {number} timeoutMs
 */
function execFileWithTimeout(cmd, args, opts, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = cp.execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        const e = /** @type {Error & {stdout?: string; stderr?: string}} */ (err);
        e.stdout = stdout;
        e.stderr = stderr;
        reject(e);
        return;
      }
      resolve({ stdout, stderr });
    });
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Markus build timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.on("exit", () => clearTimeout(timer));
  });
}

function envWithTexPath() {
  const env = { ...process.env };
  const extra = [
    "/Library/TeX/texbin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
  ];
  const cfg = vscode.workspace
    .getConfiguration("markus")
    .get("texBinPath", "")
    .trim();
  if (cfg) {
    extra.unshift(cfg);
  }
  const sep = path.delimiter;
  const current = env.PATH || "";
  const parts = [...extra, ...current.split(sep)];
  const seen = new Set();
  env.PATH = parts
    .filter((p) => p && !seen.has(p) && (seen.add(p), true))
    .join(sep);
  return env;
}

function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let n = "";
  for (let i = 0; i < 32; i++) {
    n += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return n;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  extensionContext = context;
  previewManager = new MarkusPreviewManager();

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    200
  );
  statusBar.command = "markus.openPreview";
  statusBar.text = "$(open-preview) Markus Preview";
  statusBar.tooltip = "Open live PDF preview (Markus)";

  const syncStatusBar = () => {
    if (resolveMksUri()) {
      statusBar.show();
    } else {
      statusBar.hide();
    }
  };

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand("markus.openPreview", () =>
      previewManager.openPreview()
    ),
    vscode.commands.registerTextEditorCommand(
      "markus.openPreviewFromEditor",
      (editor) => previewManager.openPreview(editor.document.uri)
    ),
    vscode.commands.registerCommand("markus.refreshPreview", () =>
      previewManager.refresh()
    ),
    vscode.commands.registerCommand("markus.exportPdf", () => exportPdf()),
    vscode.commands.registerTextEditorCommand("markus.exportPdfFromEditor", (editor) =>
      exportPdf(editor.document.uri)
    ),
    vscode.commands.registerCommand("markus.exportTex", () => exportTex()),
    vscode.commands.registerTextEditorCommand("markus.exportTexFromEditor", (editor) =>
      exportTex(editor.document.uri)
    ),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!previewManager.panel || !previewManager.currentUri) {
        return;
      }
      if (
        e.document.uri.fsPath.endsWith(".mks") &&
        e.document.uri.toString() === previewManager.currentUri.toString()
      ) {
        previewManager.scheduleRefresh(e.document.uri);
      }
    }),
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed && isMksUri(ed.document.uri)) {
        lastMksUri = ed.document.uri;
      }
      syncStatusBar();
      if (!previewManager.panel || !ed || !isMksUri(ed.document.uri)) {
        return;
      }
      previewManager.currentUri = ed.document.uri;
      previewManager.panel.title = `Preview: ${basename(ed.document.uri)}`;
      previewManager.scheduleRefresh(ed.document.uri);
    }),
    vscode.window.onDidChangeVisibleTextEditors(() => syncStatusBar())
  );

  syncStatusBar();
  applyIconThemeSetting();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("markus.fileIcons")) {
        applyIconThemeSetting();
      }
    })
  );
}

function applyIconThemeSetting() {
  const cfg = vscode.workspace.getConfiguration("markus");
  if (!cfg.get("fileIcons")) {
    return;
  }
  const workbench = vscode.workspace.getConfiguration("workbench");
  if (workbench.get("iconTheme") !== "markus-icons") {
    void workbench.update(
      "iconTheme",
      "markus-icons",
      vscode.ConfigurationTarget.Workspace
    );
  }
}

function deactivate() {
  previewManager = null;
  extensionContext = null;
}

module.exports = { activate, deactivate };
