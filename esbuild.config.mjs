import { build } from "esbuild";

// Bundles src/ (and the shared library in lib/shared) into main.js for Obsidian.
await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  banner: { js: "/* Mindful Focus 2.0.1 — https://github.com/nooshinjava/obsidian-mindful-focus */" },
  legalComments: "none",
  logLevel: "info",
});
