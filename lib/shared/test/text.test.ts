import { describe, expect, it } from "vitest";
import {
  escapeMarkdownInline,
  escapeTableCell,
  insertUnderHeading,
  parseTags,
  replaceExactLine,
  replaceOwnedSection,
  slugify,
  transformHeader,
  truncate,
} from "../src/text";

describe("slugify", () => {
  it("creates hyphenated lower-case slugs", () => {
    expect(slugify("Hello, World! A new idea")).toBe("hello-world-a-new-idea");
  });

  it("strips diacritics but keeps other scripts", () => {
    expect(slugify("Café résumé")).toBe("cafe-resume");
    expect(slugify("Идея номер 1")).toBe("идея-номер-1");
    expect(slugify("研究 ノート")).toBe("研究-ノート");
  });

  it("limits the length without a trailing hyphen", () => {
    expect(slugify("aaaa bbbb", 5)).toBe("aaaa");
  });
});

describe("truncate", () => {
  it("adds an ellipsis only when needed", () => {
    expect(truncate("short", 10)).toBe("short");
    expect(truncate("a long sentence", 6)).toBe("a long…");
  });
});

describe("parseTags", () => {
  it("normalizes comma-separated input into valid tags", () => {
    expect(parseTags("hypothesis, #methods, follow up, , 2024, Methods, a/b")).toEqual([
      "hypothesis",
      "methods",
      "follow-up",
      "a/b",
    ]);
  });

  it("drops characters Obsidian does not allow in tags", () => {
    expect(parseTags(['"quoted"', "semi;colon"])).toEqual(["quoted", "semicolon"]);
  });
});

describe("escapeTableCell", () => {
  it("escapes pipes and flattens newlines", () => {
    expect(escapeTableCell("a|b\nc")).toBe("a\\|b c");
  });
});

describe("insertUnderHeading", () => {
  const note = "# Day\n\n## Log\n\n### Older entry\n- text\n";

  it("puts the newest block directly under the heading", () => {
    expect(insertUnderHeading(note, "## Log", "### New\n- item")).toBe(
      "# Day\n\n## Log\n\n### New\n- item\n\n### Older entry\n- text\n",
    );
  });

  it("does not interpret $ patterns in user text", () => {
    const result = insertUnderHeading(note, "## Log", "Costs $& and $1 more");
    expect(result).toContain("Costs $& and $1 more");
  });

  it("matches the whole heading line only", () => {
    const content = "## Logbook\n\nkeep\n";
    expect(insertUnderHeading(content, "## Log", "entry")).toBe("## Logbook\n\nkeep\n\n## Log\n\nentry\n");
  });

  it("ignores headings inside code fences", () => {
    const content = "```\n## Log\n```\n";
    expect(insertUnderHeading(content, "## Log", "entry")).toBe("```\n## Log\n```\n\n## Log\n\nentry\n");
  });

  it("handles an empty note", () => {
    expect(insertUnderHeading("", "## Log", "entry")).toBe("## Log\n\nentry\n");
  });
});

describe("replaceOwnedSection", () => {
  const note = ["# Title", "", "## Idea", "", "old details", "", "## Notes", "", "my own notes", ""].join("\n");

  it("replaces the body when it is still what the plugin wrote", () => {
    expect(replaceOwnedSection(note, "## Idea", ["old details"], "new details")).toBe(
      ["# Title", "", "## Idea", "", "new details", "", "## Notes", "", "my own notes", ""].join("\n"),
    );
  });

  it("returns null when the user edited the body or the heading is missing", () => {
    const edited = note.replace("old details", "old details, expanded by me");
    expect(replaceOwnedSection(edited, "## Idea", ["old details"], "new")).toBeNull();
    expect(replaceOwnedSection(note, "## Missing", ["old details"], "new")).toBeNull();
    expect(replaceOwnedSection(note, "## Idea", [""], "new")).toBeNull();
  });

  it("tries each previous form (e.g. a version 1 placeholder)", () => {
    const v1 = note.replace("old details", "*No details added yet.*");
    expect(replaceOwnedSection(v1, "## Idea", ["_No details yet._", "*No details added yet.*"], "x")).toContain("## Idea\n\nx\n\n## Notes");
  });

  it("is not fooled by fences, headings or rules inside the old body (review findings 1 and 9)", () => {
    const tricky = "```pip install foo``` worked\n```python\nx = 1\n\n## Open questions\nwhy?\n---";
    const content = `## Comment\n\n${tricky}\n\n## Notes\n\nkeep me\n\n## Related\n\nkeep me too\n`;
    const updated = replaceOwnedSection(content, "## Comment", [tricky], "replaced") ?? "";
    expect(updated).toBe("## Comment\n\nreplaced\n\n## Notes\n\nkeep me\n\n## Related\n\nkeep me too\n");
  });
});

describe("code fence detection", () => {
  it("treats inline code at the start of a line as text, not a fence", () => {
    const content = "```inline``` code\n\n## Log\n\nold\n";
    expect(insertUnderHeading(content, "## Log", "new")).toBe("```inline``` code\n\n## Log\n\nnew\n\nold\n");
  });

  it("ignores an unclosed fence instead of hiding the rest of the note", () => {
    const content = "```python\nx = 1\n\n## Log\n\nold\n";
    expect(insertUnderHeading(content, "## Log", "new")).toContain("## Log\n\nnew\n\nold");
  });

  it("requires a matching closing fence", () => {
    const content = "````\n```\n## Log\n````\n\n## Log\n";
    expect(insertUnderHeading(content, "## Log", "entry")).toBe("````\n```\n## Log\n````\n\n## Log\n\nentry\n");
  });
});

describe("line and header helpers", () => {
  it("replaces an exact line only", () => {
    expect(replaceExactLine("# Old\n# Older", ["# Old"], "# New")).toBe("# New\n# Older");
    expect(replaceExactLine("# Old title", ["# Old"], "# New")).toBeNull();
  });

  it("limits a transform to the text before the first section", () => {
    const content = "# T\n**Status:** a\n\n## Notes\n**Status:** mine";
    expect(transformHeader(content, (header) => header.replace("**Status:** a", "**Status:** b"))).toBe(
      "# T\n**Status:** b\n\n## Notes\n**Status:** mine",
    );
  });
});

describe("escapeMarkdownInline", () => {
  it("escapes link and HTML syntax", () => {
    expect(escapeMarkdownInline("a](obsidian://x)[b <c>\\")).toBe("a\\](obsidian://x)\\[b \\<c\\>\\\\");
  });
});

describe("non-Latin scripts", () => {
  it("keeps combining marks in tags and slugs (review finding 6)", () => {
    expect(parseTags(["हिन्दी", "שָׁלוֹם"])).toEqual(["हिन्दी", "שָׁלוֹם"]);
    expect(slugify("हिन्दी नोट")).toBe("हिन्दी-नोट");
  });
});
