import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";

const ROOT_FOLDER = "Markus Studio";

/**
 * Pick a storage backend for the signed-in user:
 *  - Google Drive when a Drive access token is present (real Google login)
 *  - local disk otherwise (demo mode / no Google keys yet)
 */
export function getStore(session) {
  const email = session?.user?.email || "demo@markus.local";
  if (session?.googleAccessToken) {
    return new DriveStore(session.googleAccessToken);
  }
  return new LocalStore(email);
}

// ---------------- local disk backend ----------------

class LocalStore {
  constructor(email) {
    this.backend = "local";
    this.dir = path.join(process.cwd(), ".data", "workspaces", email.replace(/[^a-z0-9_.-]/gi, "_"));
  }

  async _index() {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, "index.json"), "utf8"));
    } catch {
      return { workspaces: [] };
    }
  }

  async _writeIndex(idx) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, "index.json"), JSON.stringify(idx, null, 2));
  }

  async _docs(wsId) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, wsId, "docs.json"), "utf8"));
    } catch {
      return [];
    }
  }

  async _writeDocs(wsId, docs) {
    await fs.mkdir(path.join(this.dir, wsId), { recursive: true });
    await fs.writeFile(path.join(this.dir, wsId, "docs.json"), JSON.stringify(docs, null, 2));
  }

  async listWorkspaces() {
    const idx = await this._index();
    const out = [];
    for (const ws of idx.workspaces) {
      out.push({ ...ws, docs: await this._docs(ws.id) });
    }
    return out;
  }

  async createWorkspace(name) {
    const idx = await this._index();
    const ws = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    idx.workspaces.push(ws);
    await this._writeIndex(idx);
    await this._writeDocs(ws.id, []);
    return { ...ws, docs: [] };
  }

  async deleteWorkspace(id) {
    const idx = await this._index();
    idx.workspaces = idx.workspaces.filter((w) => w.id !== id);
    await this._writeIndex(idx);
    await fs.rm(path.join(this.dir, id), { recursive: true, force: true });
  }

  async getDoc(wsId, docId) {
    const docs = await this._docs(wsId);
    const meta = docs.find((d) => d.id === docId);
    if (!meta) return null;
    let content = "";
    try {
      content = await fs.readFile(path.join(this.dir, wsId, `${docId}.mks`), "utf8");
    } catch {
      /* empty */
    }
    return { ...meta, content };
  }

  async saveDoc(wsId, { id, name, content, pages }) {
    const docs = await this._docs(wsId);
    let meta = id && docs.find((d) => d.id === id);
    if (!meta) {
      meta = { id: id || randomUUID(), name: name || "Untitled.mks" };
      docs.push(meta);
    }
    if (name) meta.name = name;
    if (typeof pages === "number") meta.pages = pages;
    meta.updatedAt = new Date().toISOString();
    await this._writeDocs(wsId, docs);
    await fs.writeFile(path.join(this.dir, wsId, `${meta.id}.mks`), content ?? "", "utf8");
    return meta;
  }

  async readAccount() {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, "account.json"), "utf8"));
    } catch {
      return {};
    }
  }

  async writeAccount(obj) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, "account.json"), JSON.stringify(obj, null, 2));
  }
}

// ---------------- Google Drive backend ----------------

class DriveStore {
  constructor(accessToken) {
    this.backend = "drive";
    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: "v3", auth: oauth });
    this._root = null;
  }

  async _rootId() {
    if (this._root) return this._root;
    const q =
      `name='${ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' ` +
      `and 'root' in parents and trashed=false`;
    const res = await this.drive.files.list({ q, fields: "files(id)", spaces: "drive" });
    if (res.data.files?.length) {
      this._root = res.data.files[0].id;
    } else {
      const made = await this.drive.files.create({
        requestBody: { name: ROOT_FOLDER, mimeType: "application/vnd.google-apps.folder" },
        fields: "id",
      });
      this._root = made.data.id;
    }
    return this._root;
  }

  async listWorkspaces() {
    const root = await this._rootId();
    const folders = await this.drive.files.list({
      q: `'${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name,createdTime)",
      orderBy: "createdTime",
    });
    const out = [];
    for (const f of folders.data.files || []) {
      const files = await this.drive.files.list({
        q: `'${f.id}' in parents and trashed=false`,
        fields: "files(id,name,modifiedTime,appProperties)",
      });
      const docs = (files.data.files || []).map((d) => ({
        id: d.id,
        name: d.name,
        pages: d.appProperties?.pages ? Number(d.appProperties.pages) : undefined,
        updatedAt: d.modifiedTime,
      }));
      out.push({ id: f.id, name: f.name, createdAt: f.createdTime, docs });
    }
    return out;
  }

  async createWorkspace(name) {
    const root = await this._rootId();
    const made = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [root],
        appProperties: { markusWs: "1" },
      },
      fields: "id,name,createdTime",
    });
    return { id: made.data.id, name: made.data.name, createdAt: made.data.createdTime, docs: [] };
  }

  async deleteWorkspace(id) {
    await this.drive.files.delete({ fileId: id });
  }

  async getDoc(wsId, docId) {
    const meta = await this.drive.files.get({
      fileId: docId,
      fields: "id,name,modifiedTime,appProperties",
    });
    const media = await this.drive.files.get(
      { fileId: docId, alt: "media" },
      { responseType: "text" }
    );
    return {
      id: meta.data.id,
      name: meta.data.name,
      pages: meta.data.appProperties?.pages ? Number(meta.data.appProperties.pages) : undefined,
      updatedAt: meta.data.modifiedTime,
      content: typeof media.data === "string" ? media.data : String(media.data ?? ""),
    };
  }

  async saveDoc(wsId, { id, name, content, pages }) {
    const appProperties = typeof pages === "number" ? { markusDoc: "1", pages: String(pages) } : { markusDoc: "1" };
    const media = { mimeType: "text/plain", body: content ?? "" };
    if (id) {
      const res = await this.drive.files.update({
        fileId: id,
        requestBody: { ...(name ? { name } : {}), appProperties },
        media,
        fields: "id,name,modifiedTime,appProperties",
      });
      return { id: res.data.id, name: res.data.name, pages, updatedAt: res.data.modifiedTime };
    }
    const res = await this.drive.files.create({
      requestBody: { name: name || "Untitled.mks", parents: [wsId], appProperties },
      media,
      fields: "id,name,modifiedTime,appProperties",
    });
    return { id: res.data.id, name: res.data.name, pages, updatedAt: res.data.modifiedTime };
  }

  // subscription state lives in an app-created file in the user's Drive,
  // so premium survives server restarts/redeploys without a separate DB
  async _accountFileId() {
    const root = await this._rootId();
    const r = await this.drive.files.list({
      q: `name='account.json' and '${root}' in parents and trashed=false`,
      fields: "files(id)",
    });
    return r.data.files?.[0]?.id || null;
  }

  async readAccount() {
    const id = await this._accountFileId();
    if (!id) return {};
    try {
      const m = await this.drive.files.get({ fileId: id, alt: "media" }, { responseType: "text" });
      return JSON.parse(typeof m.data === "string" ? m.data : String(m.data || "{}"));
    } catch {
      return {};
    }
  }

  async writeAccount(obj) {
    const root = await this._rootId();
    const id = await this._accountFileId();
    const media = { mimeType: "application/json", body: JSON.stringify(obj) };
    if (id) {
      await this.drive.files.update({ fileId: id, media });
    } else {
      await this.drive.files.create({
        requestBody: { name: "account.json", parents: [root], appProperties: { markusAccount: "1" } },
        media,
      });
    }
  }
}
