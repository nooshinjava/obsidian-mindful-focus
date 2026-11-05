import { describe, expect, it } from "vitest";
import {
  isSafeVaultPath,
  joinVaultPath,
  noteCandidatePath,
  normalizeVaultPath,
  parentFolder,
  resolveFolderSetting,
  toSafeFileName,
} from "../src/paths";

describe("normalizeVaultPath", () => {
  it("normalizes separators, whitespace and empty segments", () => {
    expect(normalizeVaultPath("  /Projects\\\\Alpha//Notes/ ")).toBe("Projects/Alpha/Notes");
    expect(normalizeVaultPath(" A / B ")).toBe("A/B");
    expect(normalizeVaultPath(undefined)).toBe("");
  });

  it("replaces non-breaking spaces", () => {
    expect(normalizeVaultPath("My\u00a0Folder")).toBe("My Folder");
  });
});

describe("isSafeVaultPath", () => {
  it("accepts ordinary relative paths", () => {
    expect(isSafeVaultPath("Projects/Alpha/Labbook.md")).toBe(true);
    expect(isSafeVaultPath("Idea Vault")).toBe(true);
  });

  it.each(["", "   ", "../outside", "a/../../b", "./a", ".obsidian/plugins", "notes/.hidden", "C:/Users/x", "a\u0000b"])(
    "rejects %j",
    (path) => {
      expect(isSafeVaultPath(path)).toBe(false);
    },
  );
});

describe("resolveFolderSetting", () => {
  it("falls back when the setting is empty or unsafe", () => {
    expect(resolveFolderSetting("", "Idea Vault")).toBe("Idea Vault");
    expect(resolveFolderSetting("../escape", "Idea Vault")).toBe("Idea Vault");
    expect(resolveFolderSetting("/Research/Ideas/", "Idea Vault")).toBe("Research/Ideas");
  });
});

describe("toSafeFileName", () => {
  it("removes characters that are invalid in file names or links", () => {
    expect(toSafeFileName('a/b\\c:d*e?f"g<h>i|j#k^l[m]n')).toBe("a-b-c-d-e-f-g-h-i-j-k-l-m-n");
  });

  it("trims dots, dashes and whitespace and falls back when empty", () => {
    expect(toSafeFileName("  ..hello..  ")).toBe("hello");
    expect(toSafeFileName("///", "Fallback")).toBe("Fallback");
  });

  it("avoids Windows reserved names and limits length", () => {
    expect(toSafeFileName("CON")).toBe("CON-note");
    expect(Array.from(toSafeFileName("é".repeat(300))).length).toBe(100);
  });

  it("keeps non-Latin scripts", () => {
    expect(toSafeFileName("研究ノート")).toBe("研究ノート");
  });
});

describe("path joining", () => {
  it("joins and finds parents", () => {
    expect(joinVaultPath("A/", "/B", "", "c.md")).toBe("A/B/c.md");
    expect(parentFolder("A/B/c.md")).toBe("A/B");
    expect(parentFolder("c.md")).toBe("");
  });

  it("builds numbered candidates", () => {
    expect(noteCandidatePath("Ideas", "my idea.md", 0)).toBe("Ideas/my idea.md");
    expect(noteCandidatePath("Ideas", "my idea", 2)).toBe("Ideas/my idea 2.md");
    expect(noteCandidatePath("", "../x", 0)).toBe("x.md");
  });
});
