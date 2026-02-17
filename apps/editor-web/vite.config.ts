import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolveTsFromJsExtension() {
  return {
    name: "resolve-ts-from-js-extension",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (!importer) return null;
      if (!source.startsWith("./") && !source.startsWith("../")) return null;
      if (!source.endsWith(".js")) return null;

      const absImporter = importer.startsWith("file://")
        ? fileURLToPath(importer)
        : importer;

      const importerDir = path.dirname(absImporter);
      const candidateTs = path.resolve(importerDir, source.replace(/\.js$/, ".ts"));
      if (fs.existsSync(candidateTs)) return candidateTs;

      const candidateTsx = path.resolve(importerDir, source.replace(/\.js$/, ".tsx"));
      if (fs.existsSync(candidateTsx)) return candidateTsx;

      return null;
    }
  };
}

export default defineConfig({
  plugins: [resolveTsFromJsExtension(), react()],
  server: {
    port: 5173
  }
});
