import { describe, expect, it } from "vitest";
import { appendUnderHeading, createUniqueNote, ensureNote, noteOwnership, noteSyncMessage, writeGeneratedNote } from "../src/notes";
import { MemoryNoteStore } from "../src/testing";

describe("createUniqueNote", () => {
  it("creates the folder and the note", async () => {
    const store = new MemoryNoteStore();
    const path = await createUniqueNote(store, "Ideas/2026", "First idea", "body");
    expect(path).toBe("Ideas/2026/First idea.md");
    expect(store.files.get(path)).toBe("body");
  });

  it("never overwrites an existing note", async () => {
    const store = new MemoryNoteStore({ "Ideas/Same.md": "keep me", "Ideas/Same 1.md": "and me" });
    const path = await createUniqueNote(store, "Ideas", "Same", "new");
    expect(path).toBe("Ideas/Same 2.md");
    expect(store.files.get("Ideas/Same.md")).toBe("keep me");
    expect(store.files.get("Ideas/Same 1.md")).toBe("and me");
  });

  it("retries when the store reports the name was taken concurrently", async () => {
    const store = new MemoryNoteStore();
    const originalCreate = store.create.bind(store);
    let calls = 0;
    store.create = (path, content) => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("File already exists.")) : originalCreate(path, content);
    };
    await expect(createUniqueNote(store, "", "Race", "x")).resolves.toBe("Race 1.md");
  });

  it("propagates unrelated errors", async () => {
    const store = new MemoryNoteStore();
    store.create = () => Promise.reject(new Error("Disk full"));
    await expect(createUniqueNote(store, "", "x", "y")).rejects.toThrow("Disk full");
  });

  it("sanitizes the file name", async () => {
    const store = new MemoryNoteStore();
    await expect(createUniqueNote(store, "Ideas", "../../etc/passwd", "x")).resolves.toBe("Ideas/etc-passwd.md");
  });
});

describe("ensureNote and appendUnderHeading", () => {
  it("creates the note from the template once", async () => {
    const store = new MemoryNoteStore();
    expect(await ensureNote(store, "Daily/2026-11-04.md", "# Day\n\n## Log\n")).toBe(true);
    expect(await ensureNote(store, "Daily/2026-11-04.md", "other")).toBe(false);
    expect(store.files.get("Daily/2026-11-04.md")).toBe("# Day\n\n## Log\n");
  });

  it("tolerates a concurrent creation of the same note", async () => {
    const store = new MemoryNoteStore();
    const results = await Promise.all([
      appendUnderHeading(store, "Daily/d.md", "## Log", "one", "## Log\n"),
      appendUnderHeading(store, "Daily/d.md", "## Log", "two", "## Log\n"),
    ]);
    expect(results).toHaveLength(2);
    const content = store.files.get("Daily/d.md") ?? "";
    expect(content).toContain("one");
    expect(content).toContain("two");
  });

  it("appends newest entries under the heading", async () => {
    const store = new MemoryNoteStore();
    const template = "# Day\n\n## Log\n";
    await appendUnderHeading(store, "Daily/d.md", "## Log", "first", template);
    await appendUnderHeading(store, "Daily/d.md", "## Log", "second", template);
    expect(store.files.get("Daily/d.md")).toBe("# Day\n\n## Log\n\nsecond\n\nfirst\n");
  });
});

describe("MemoryNoteStore frontmatter", () => {
  it("updates frontmatter and keeps the body", async () => {
    const store = new MemoryNoteStore({ "a.md": '---\ntitle: "Old"\ncustom: keep\n---\n# Body\n' });
    await store.updateFrontmatter("a.md", (fm) => {
      fm.title = "New";
    });
    expect(store.frontmatterOf("a.md")).toEqual({ title: "New", custom: "keep" });
    expect(store.files.get("a.md")).toMatch(/\n---\n# Body\n$/);
  });
});

describe("createUniqueNote reservations", () => {
  it("skips paths another record still claims even if the file is gone", async () => {
    const store = new MemoryNoteStore();
    const path = await createUniqueNote(store, "Ideas", "x", "body", (candidate) => candidate === "Ideas/x.md");
    expect(path).toBe("Ideas/x 1.md");
  });
});

describe("writeGeneratedNote", () => {
  const marked = (text: string) => `---\nreport: true\n---\n${text}`;

  it("replaces only a previous generated copy (review finding 4)", async () => {
    const store = new MemoryNoteStore({ "Ideas/Ideas-2026-11.md": "my own monthly note" });
    const first = await writeGeneratedNote(store, "Ideas", "Ideas-2026-11", marked("v1"), "report");
    expect(first).toBe("Ideas/Ideas-2026-11 1.md");
    expect(store.files.get("Ideas/Ideas-2026-11.md")).toBe("my own monthly note");

    const second = await writeGeneratedNote(store, "Ideas", "Ideas-2026-11", marked("v2"), "report");
    expect(second).toBe(first);
    expect(store.files.get(first)).toBe(marked("v2"));
  });

  it("skips notes whose frontmatter can't be parsed", async () => {
    const store = new MemoryNoteStore({ "r.md": "---\n: : bad\n---\n" });
    await expect(writeGeneratedNote(store, "", "r", marked("x"), "report")).resolves.toBe("r 1.md");
  });
});

describe("noteOwnership", () => {
  const store = new MemoryNoteStore({
    "mine.md": '---\nidea-id: "a"\n---\n',
    "theirs.md": '---\nidea-id: "b"\n---\n',
    "old.md": "# v1 note without an id",
    "broken.md": "---\n: : bad\n---\n",
  });

  it("uses the id property when present", async () => {
    await expect(noteOwnership(store, "mine.md", "idea-id", "a", false)).resolves.toBe("owned");
    await expect(noteOwnership(store, "theirs.md", "idea-id", "a", false)).resolves.toBe("not-owned");
  });

  it("accepts id-less notes only when no other record claims them", async () => {
    await expect(noteOwnership(store, "old.md", "idea-id", "a", false)).resolves.toBe("owned");
    await expect(noteOwnership(store, "old.md", "idea-id", "a", true)).resolves.toBe("not-owned");
  });

  it("reports unknown for unparsable frontmatter", async () => {
    await expect(noteOwnership(store, "broken.md", "idea-id", "a", false)).resolves.toBe("unknown");
  });
});

describe("noteSyncMessage", () => {
  it("explains outcomes that need attention", () => {
    expect(noteSyncMessage("Idea", { status: "updated" })).toBeNull();
    expect(noteSyncMessage("Idea", { status: "kept-edits" })).toContain("your text in the note was kept");
    expect(noteSyncMessage("Paper", { status: "failed", error: "bad YAML" })).toBe(
      "Paper saved, but its note couldn't be updated: bad YAML",
    );
  });
});
