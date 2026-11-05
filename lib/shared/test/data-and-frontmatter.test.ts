import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { cloneJson, readEnum, readNumber, readStringArray, schemaStatus } from "../src/data";
import { mergeFrontmatter, serializeFrontmatter } from "../src/frontmatter";
import { createId, pickRandom } from "../src/ids";
import { SaveQueue } from "../src/persistence";
import { MemoryPersistence } from "../src/testing";

describe("serializeFrontmatter", () => {
  it("produces YAML that round-trips hostile strings", () => {
    const title = 'He said "hi": #1\nnew: line';
    const yaml = serializeFrontmatter({ title, tags: ["a", 'b"c'], rating: 3, done: false, skip: undefined });
    const body = yaml.replace(/^---\n|---\n$/g, "");
    expect(parse(body)).toEqual({ title, tags: ["a", 'b"c'], rating: 3, done: false });
  });

  it("rejects unsafe keys", () => {
    expect(() => serializeFrontmatter({ "bad key": "x" })).toThrow();
  });
});

describe("mergeFrontmatter", () => {
  it("sets owned keys, removes undefined ones and keeps the rest", () => {
    const target: Record<string, unknown> = { title: "old", journal: "J", custom: 1 };
    const tags = ["a"];
    mergeFrontmatter(target, { title: "new", journal: undefined, tags });
    expect(target).toEqual({ title: "new", custom: 1, tags: ["a"] });
    expect(target.tags).not.toBe(tags);
  });
});

describe("schemaStatus", () => {
  it("classifies stored data", () => {
    expect(schemaStatus(null, 2)).toBe("outdated");
    expect(schemaStatus({}, 2)).toBe("outdated");
    expect(schemaStatus({ schemaVersion: 1 }, 2)).toBe("outdated");
    expect(schemaStatus({ schemaVersion: 2 }, 2)).toBe("current");
    expect(schemaStatus({ schemaVersion: 3 }, 2)).toBe("newer");
    expect(schemaStatus({ schemaVersion: "2" }, 2)).toBe("outdated");
  });
});

describe("data readers", () => {
  it("validates numbers with bounds", () => {
    expect(readNumber("12", 0)).toBe(12);
    expect(readNumber("abc", 5)).toBe(5);
    expect(readNumber(99, 0, { max: 10 })).toBe(10);
    expect(readNumber(Number.NaN, 1)).toBe(1);
  });

  it("validates enums and string arrays", () => {
    expect(readEnum("b", ["a", "b"] as const, "a")).toBe("b");
    expect(readEnum("z", ["a", "b"] as const, "a")).toBe("a");
    expect(readStringArray(["a", 1, null, "b"])).toEqual(["a", "b"]);
    expect(readStringArray("a")).toEqual([]);
  });

  it("clones defaults so they are never shared", () => {
    const defaults = { items: [] as string[] };
    const copy = cloneJson(defaults);
    copy.items.push("x");
    expect(defaults.items).toEqual([]);
  });
});

describe("ids", () => {
  it("creates unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => createId(1)));
    expect(ids.size).toBe(1000);
  });

  it("picks random items safely", () => {
    expect(pickRandom([], () => 0.5)).toBeUndefined();
    expect(pickRandom(["a", "b"], () => 0.99)).toBe("b");
    expect(pickRandom(["a", "b"], () => 1)).toBe("b");
  });
});

describe("SaveQueue", () => {
  it("saves snapshots in order", async () => {
    const persistence = new MemoryPersistence();
    const queue = new SaveQueue(persistence);
    const data = { count: 1 };
    const first = queue.save(data);
    data.count = 2;
    const second = queue.save(data);
    await Promise.all([first, second]);
    expect(persistence.saves).toBe(2);
    expect(persistence.data).toEqual({ count: 2 });
  });
});
