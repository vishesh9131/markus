import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
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

  async _images(wsId) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, wsId, "images.json"), "utf8"));
    } catch {
      return [];
    }
  }

  async _writeImages(wsId, imgs) {
    await fs.mkdir(path.join(this.dir, wsId), { recursive: true });
    await fs.writeFile(path.join(this.dir, wsId, "images.json"), JSON.stringify(imgs, null, 2));
  }

  async listWorkspaces() {
    const idx = await this._index();
    const out = [];
    for (const ws of idx.workspaces) {
      out.push({ ...ws, docs: await this._docs(ws.id), images: await this._images(ws.id) });
    }
    return out;
  }

  async uploadImage(wsId, { name, base64, mime, folderId }) {
    const imgs = await this._images(wsId);
    const meta = { id: randomUUID(), name, mime, folderId: folderId || null, updatedAt: new Date().toISOString() };
    imgs.push(meta);
    await this._writeImages(wsId, imgs);
    await fs.writeFile(path.join(this.dir, wsId, `img_${meta.id}`), Buffer.from(base64, "base64"));
    return meta;
  }

  async getImage(wsId, imgId) {
    const meta = (await this._images(wsId)).find((i) => i.id === imgId);
    if (!meta) return null;
    let base64 = "";
    try {
      base64 = (await fs.readFile(path.join(this.dir, wsId, `img_${imgId}`))).toString("base64");
    } catch {
      /* empty */
    }
    return { ...meta, base64 };
  }

  async _folders(wsId) {
    try {
      return JSON.parse(await fs.readFile(path.join(this.dir, wsId, "folders.json"), "utf8"));
    } catch {
      return [];
    }
  }

  async createFolder(wsId, name) {
    const folders = await this._folders(wsId);
    const meta = { id: randomUUID(), name };
    folders.push(meta);
    await fs.mkdir(path.join(this.dir, wsId), { recursive: true });
    await fs.writeFile(path.join(this.dir, wsId, "folders.json"), JSON.stringify(folders, null, 2));
    return meta;
  }

  async tree(wsId) {
    const docs = await this._docs(wsId);
    const images = await this._images(wsId);
    const folders = await this._folders(wsId);
    const inFolder = (arr, fid) => arr.filter((x) => (x.folderId || null) === fid);
    return {
      docs: inFolder(docs, null),
      images: inFolder(images, null),
      folders: folders.map((f) => ({ id: f.id, name: f.name, docs: inFolder(docs, f.id), images: inFolder(images, f.id) })),
    };
  }

  async _writeFolders(wsId, f) {
    await fs.mkdir(path.join(this.dir, wsId), { recursive: true });
    await fs.writeFile(path.join(this.dir, wsId, "folders.json"), JSON.stringify(f, null, 2));
  }

  async rename(wsId, id, name) {
    const docs = await this._docs(wsId);
    const d = docs.find((x) => x.id === id);
    if (d) { d.name = name; await this._writeDocs(wsId, docs); return { id, name }; }
    const imgs = await this._images(wsId);
    const im = imgs.find((x) => x.id === id);
    if (im) { im.name = name; await this._writeImages(wsId, imgs); return { id, name }; }
    const fols = await this._folders(wsId);
    const fo = fols.find((x) => x.id === id);
    if (fo) { fo.name = name; await this._writeFolders(wsId, fols); return { id, name }; }
    return { id, name };
  }

  async move(wsId, id, toFolderId) {
    const folderId = toFolderId || null;
    const docs = await this._docs(wsId);
    const d = docs.find((x) => x.id === id);
    if (d) { d.folderId = folderId; await this._writeDocs(wsId, docs); return; }
    const imgs = await this._images(wsId);
    const im = imgs.find((x) => x.id === id);
    if (im) { im.folderId = folderId; await this._writeImages(wsId, imgs); }
  }

  async remove(wsId, id) {
    const docs = await this._docs(wsId);
    if (docs.some((x) => x.id === id)) {
      await this._writeDocs(wsId, docs.filter((x) => x.id !== id));
      await fs.rm(path.join(this.dir, wsId, `${id}.mks`), { force: true });
      return;
    }
    const imgs = await this._images(wsId);
    if (imgs.some((x) => x.id === id)) {
      await this._writeImages(wsId, imgs.filter((x) => x.id !== id));
      await fs.rm(path.join(this.dir, wsId, `img_${id}`), { force: true });
      return;
    }
    const fols = await this._folders(wsId);
    if (fols.some((x) => x.id === id)) {
      await this._writeFolders(wsId, fols.filter((x) => x.id !== id));
      const keptDocs = [];
      for (const d of docs) {
        if (d.folderId === id) await fs.rm(path.join(this.dir, wsId, `${d.id}.mks`), { force: true });
        else keptDocs.push(d);
      }
      await this._writeDocs(wsId, keptDocs);
      const keptImgs = [];
      for (const im of imgs) {
        if (im.folderId === id) await fs.rm(path.join(this.dir, wsId, `img_${im.id}`), { force: true });
        else keptImgs.push(im);
      }
      await this._writeImages(wsId, keptImgs);
    }
  }

  async duplicate(wsId, id, name) {
    const doc = await this.getDoc(wsId, id);
    if (!doc) return null;
    const meta = await this.saveDoc(wsId, { name, content: doc.content, pages: doc.pages, folderId: doc.folderId || null });
    return { id: meta.id, name: meta.name };
  }

  async createWorkspace(name) {
    const idx = await this._index();
    const ws = { id: randomUUID(), name, createdAt: new Date().toISOString() };
    idx.workspaces.push(ws);
    await this._writeIndex(idx);
    await this._writeDocs(ws.id, []);
    return { ...ws, docs: [] };
  }

  async countDocs(wsId) {
    return (await this._docs(wsId)).length;
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

  async saveDoc(wsId, { id, name, content, pages, folderId }) {
    const docs = await this._docs(wsId);
    let meta = id && docs.find((d) => d.id === id);
    if (!meta) {
      meta = { id: id || randomUUID(), name: name || "Untitled.mks", folderId: folderId || null };
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

  // Remove every workspace, document, and the account file for this user.
  async deleteEverything() {
    await fs.rm(this.dir, { recursive: true, force: true });
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

  // List every file matching params, following nextPageToken so results aren't
  // capped at Drive's default page size (premium users can exceed 100).
  async _listAll({ fields = "files(id,name)", ...params }) {
    const out = [];
    let pageToken;
    do {
      const res = await this.drive.files.list({
        ...params,
        pageSize: 1000,
        pageToken,
        fields: `nextPageToken, ${fields}`,
      });
      out.push(...(res.data.files || []));
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    return out;
  }

  async listWorkspaces() {
    const root = await this._rootId();
    const folders = await this._listAll({
      q: `'${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id,name,createdTime)",
      orderBy: "createdTime",
    });
    const out = [];
    for (const f of folders) {
      const files = await this._listAll({
        q: `'${f.id}' in parents and trashed=false`,
        fields: "files(id,name,mimeType,modifiedTime,appProperties)",
      });
      const docs = [];
      const images = [];
      for (const d of files) {
        if (d.mimeType === "application/vnd.google-apps.folder") continue; // subfolders -> tree()
        if ((d.mimeType || "").startsWith("image/")) {
          images.push({ id: d.id, name: d.name, mime: d.mimeType, updatedAt: d.modifiedTime });
        } else {
          docs.push({
            id: d.id,
            name: d.name,
            pages: d.appProperties?.pages ? Number(d.appProperties.pages) : undefined,
            updatedAt: d.modifiedTime,
          });
        }
      }
      out.push({ id: f.id, name: f.name, createdAt: f.createdTime, docs, images });
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

  // Cheap top-level doc count for the quota check (one Drive call, this ws only).
  async countDocs(wsId) {
    const files = await this._listAll({ q: `'${wsId}' in parents and trashed=false`, fields: "files(id,mimeType)" });
    return files.filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder" && !(f.mimeType || "").startsWith("image/")
    ).length;
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

  async saveDoc(wsId, { id, name, content, pages, folderId }) {
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
      requestBody: { name: name || "Untitled.mks", parents: [folderId || wsId], appProperties },
      media,
      fields: "id,name,modifiedTime,appProperties",
    });
    return { id: res.data.id, name: res.data.name, pages, updatedAt: res.data.modifiedTime };
  }

  // ---- folders (one level: a workspace folder contains docs/images/folders) ----
  async createFolder(wsId, name) {
    const made = await this.drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [wsId], appProperties: { markusFolder: "1" } },
      fields: "id,name",
    });
    return { id: made.data.id, name: made.data.name };
  }

  async tree(wsId) {
    const split = (files) => {
      const docs = [], images = [], folders = [];
      for (const d of files) {
        if (d.mimeType === "application/vnd.google-apps.folder") folders.push({ id: d.id, name: d.name });
        else if ((d.mimeType || "").startsWith("image/")) images.push({ id: d.id, name: d.name, mime: d.mimeType, updatedAt: d.modifiedTime });
        else docs.push({ id: d.id, name: d.name, pages: d.appProperties?.pages ? Number(d.appProperties.pages) : undefined, updatedAt: d.modifiedTime });
      }
      return { docs, images, folders };
    };
    const fields = "files(id,name,mimeType,modifiedTime,appProperties)";
    const root = split(await this._listAll({ q: `'${wsId}' in parents and trashed=false`, fields }));
    const folders = [];
    for (const fol of root.folders) {
      const c = split(await this._listAll({ q: `'${fol.id}' in parents and trashed=false`, fields }));
      folders.push({ id: fol.id, name: fol.name, docs: c.docs, images: c.images });
    }
    return { docs: root.docs, images: root.images, folders };
  }

  async uploadImage(wsId, { name, base64, mime, folderId }) {
    const res = await this.drive.files.create({
      requestBody: { name, parents: [folderId || wsId], appProperties: { markusImage: "1" } },
      media: { mimeType: mime || "application/octet-stream", body: Readable.from(Buffer.from(base64, "base64")) },
      fields: "id,name,mimeType,modifiedTime",
    });
    return { id: res.data.id, name: res.data.name, mime: res.data.mimeType, updatedAt: res.data.modifiedTime };
  }

  async getImage(_wsId, imgId) {
    const meta = await this.drive.files.get({ fileId: imgId, fields: "id,name,mimeType" });
    const media = await this.drive.files.get({ fileId: imgId, alt: "media" }, { responseType: "arraybuffer" });
    return {
      id: imgId,
      name: meta.data.name,
      mime: meta.data.mimeType,
      base64: Buffer.from(media.data).toString("base64"),
    };
  }

  // ---- item operations (work on any file/folder by Drive id) ----
  async rename(_wsId, id, name) {
    const r = await this.drive.files.update({ fileId: id, requestBody: { name }, fields: "id,name" });
    return { id: r.data.id, name: r.data.name };
  }

  async remove(_wsId, id) {
    await this.drive.files.delete({ fileId: id }); // folders cascade
  }

  async move(wsId, id, toFolderId, fromFolderId) {
    await this.drive.files.update({
      fileId: id,
      addParents: toFolderId || wsId,
      removeParents: fromFolderId || wsId,
      fields: "id",
    });
  }

  async duplicate(_wsId, id, name) {
    const r = await this.drive.files.copy({ fileId: id, requestBody: { name }, fields: "id,name,modifiedTime" });
    return { id: r.data.id, name: r.data.name };
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

  // Delete the whole "Markus Studio" folder, which cascades to every workspace,
  // document, and the account file. Only files this app created are affected.
  async deleteEverything() {
    const q =
      `name='${ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' ` +
      `and 'root' in parents and trashed=false`;
    const res = await this.drive.files.list({ q, fields: "files(id)", spaces: "drive" });
    for (const f of res.data.files || []) {
      await this.drive.files.delete({ fileId: f.id });
    }
    this._root = null;
  }
}
