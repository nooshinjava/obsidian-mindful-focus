import { TFile, TFolder, type App, type Plugin } from "obsidian";
import { describe, expect, it } from "vitest";
import { ObsidianNoteStore, PluginDataStore } from "../src/obsidian";

/** A tiny in-memory vault that behaves like Obsidian's for the calls the adapter makes. */
class FakeVault {
  readonly root = Object.assign(new TFolder(), { name: "", path: "/" });
  readonly contents = new Map<string, string>();
  readonly createdFolders: string[] = [];
  private readonly index = new Map<string, TFile | TFolder>();

  getRoot(): TFolder {
    return this.root;
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return this.index.get(path) ?? null;
  }

  private parentFolder(path: string): TFolder {
    const index = path.lastIndexOf("/");
    if (index === -1) return this.root;
    const parent = this.index.get(path.slice(0, index));
    if (!(parent instanceof TFolder)) throw new Error(`Parent folder of "${path}" does not exist.`);
    return parent;
  }

  createFolder(path: string): Promise<TFolder> {
    if (this.index.has(path)) return Promise.reject(new Error("Folder already exists."));
    const parent = this.parentFolder(path);
    const folder = Object.assign(new TFolder(), { name: path.split("/").pop() ?? path, path, parent });
    parent.children.push(folder);
    this.index.set(path, folder);
    this.createdFolders.push(path);
    return Promise.resolve(folder);
  }

  create(path: string, content: string): Promise<TFile> {
    if (this.index.has(path)) return Promise.reject(new Error("File already exists."));
    const parent = this.parentFolder(path);
    const file = Object.assign(new TFile(), { name: path.split("/").pop() ?? path, path, parent });
    parent.children.push(file);
    this.index.set(path, file);
    this.contents.set(path, content);
    return Promise.resolve(file);
  }

  read(file: TFile): Promise<string> {
    return Promise.resolve(this.contents.get(file.path) ?? "");
  }

  getMarkdownFiles(): TFile[] {
    return [...this.index.values()].filter((file): file is TFile => file instanceof TFile && file.path.endsWith(".md"));
  }
}

function fakeApp(vault: FakeVault, frontmatterByPath: Record<string, Record<string, unknown>> = {}): App {
  return {
    vault,
    metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: frontmatterByPath[file.path] }) },
  } as unknown as App;
}

describe("ObsidianNoteStore", () => {
  it("reuses an existing folder whose name differs only in case (review finding 12)", async () => {
    const vault = new FakeVault();
    await vault.createFolder("Ideas");
    const store = new ObsidianNoteStore(fakeApp(vault));

    await store.ensureFolder("ideas/2026");
    expect(vault.createdFolders).toEqual(["Ideas", "Ideas/2026"]);
    await expect(store.create("ideas/2026/note.md", "x")).resolves.toBe("Ideas/2026/note.md");
    expect(store.exists("IDEAS/2026/NOTE.md")).toBe(true);
    await expect(store.read("ideas/2026/note.md")).resolves.toBe("x");
  });

  it("refuses to treat a file as a folder", async () => {
    const vault = new FakeVault();
    await vault.create("Ideas", "not a folder");
    await expect(new ObsidianNoteStore(fakeApp(vault)).ensureFolder("Ideas/sub")).rejects.toThrow("not a folder");
  });

  it("reads frontmatter and finds notes by a frontmatter id", async () => {
    const vault = new FakeVault();
    await vault.create("a.md", '---\nidea-id: "abc"\ntitle: A\n---\nbody');
    await vault.create("b.md", "no frontmatter");
    const store = new ObsidianNoteStore(fakeApp(vault, { "a.md": { "idea-id": "abc" } }));

    await expect(store.readFrontmatter("a.md")).resolves.toEqual({ "idea-id": "abc", title: "A" });
    await expect(store.readFrontmatter("b.md")).resolves.toBeNull();
    await expect(store.findNoteByFrontmatter("idea-id", "abc")).resolves.toBe("a.md");
    await expect(store.findNoteByFrontmatter("idea-id", "zzz")).resolves.toBeNull();
  });
});

function fakePlugin(data: unknown) {
  const files = new Map<string, string>();
  let saved: unknown = undefined;
  const plugin = {
    manifest: { dir: ".obsidian/plugins/idea-vault" },
    loadData: () => Promise.resolve(data),
    saveData: (value: unknown) => {
      saved = value;
      return Promise.resolve();
    },
    app: {
      vault: {
        adapter: {
          exists: (path: string) => Promise.resolve(files.has(path)),
          write: (path: string, content: string) => {
            files.set(path, content);
            return Promise.resolve();
          },
        },
      },
    },
  };
  return { plugin: plugin as unknown as Plugin, files, saved: () => saved };
}

describe("PluginDataStore", () => {
  it("backs up older data once before it is migrated", async () => {
    const v1 = { ideas: [{ title: "x" }] };
    const { plugin, files } = fakePlugin(v1);
    const store = new PluginDataStore(plugin, 2, "Idea Vault");
    await expect(store.load()).resolves.toEqual(v1);
    expect(store.loadedStatus).toBe("outdated");
    expect(JSON.parse(files.get(".obsidian/plugins/idea-vault/data.backup-v1.json") ?? "null")).toEqual(v1);

    files.set(".obsidian/plugins/idea-vault/data.backup-v1.json", "earlier backup");
    await store.load();
    expect(files.get(".obsidian/plugins/idea-vault/data.backup-v1.json")).toBe("earlier backup");
  });

  it("doesn't back up a fresh install", async () => {
    const { plugin, files } = fakePlugin(null);
    await new PluginDataStore(plugin, 2, "Idea Vault").load();
    expect(files.size).toBe(0);
  });

  it("never overwrites data from a newer version (review finding 5)", async () => {
    const { plugin, saved } = fakePlugin({ schemaVersion: 3, ideas: [] });
    const store = new PluginDataStore(plugin, 2, "Idea Vault");
    await store.load();
    expect(store.readOnly).toBe(true);
    await expect(store.save({ schemaVersion: 2 })).rejects.toThrow("read-only");
    expect(saved()).toBeUndefined();
  });

  it("saves current data normally", async () => {
    const { plugin, saved } = fakePlugin({ schemaVersion: 2 });
    const store = new PluginDataStore(plugin, 2, "Idea Vault");
    await store.load();
    await store.save({ schemaVersion: 2, ok: true });
    expect(saved()).toEqual({ schemaVersion: 2, ok: true });
  });
});
