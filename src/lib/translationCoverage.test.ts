import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { hasTranslation, translationEntries } from "./locale";

const ROOTS = ["src/App.tsx", "src/components", "src/lib", "src/seo"];

function sourceFiles(path: string): string[] {
  const entry = readdirSync(path, { withFileTypes: true });
  return entry.flatMap((item) => {
    const child = join(path, item.name);
    if (item.isDirectory()) return sourceFiles(child);
    return /\.(ts|tsx)$/.test(item.name) && !item.name.endsWith(".test.ts") ? [child] : [];
  });
}

function files(): string[] {
  return ROOTS.flatMap((path) => (path.endsWith(".tsx") ? [path] : sourceFiles(path)));
}

function stringLiterals(node: ts.Node): string[] {
  const values: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) {
      values.push(child.text);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return values;
}

describe("translation catalogue", () => {
  it("contains EN and JA values without Hangul fallbacks", () => {
    for (const [source, target] of translationEntries()) {
      expect(target.en, `${source} EN`).not.toMatch(/[가-힣]/);
      expect(target.ja, `${source} JA`).not.toMatch(/[가-힣]/);
      expect(target.en.length).toBeGreaterThan(0);
      expect(target.ja.length).toBeGreaterThan(0);
    }
  });

  it("covers every literal passed to tr() or translate()", () => {
    const missing = new Set<string>();
    for (const file of files()) {
      const source = readFileSync(file, "utf8");
      const tree = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const sourceArgument =
            node.expression.text === "tr"
              ? node.arguments[0]
              : node.expression.text === "translate"
                ? node.arguments[1]
                : undefined;
          if (sourceArgument) {
            for (const value of stringLiterals(sourceArgument)) {
              if (/[가-힣]/.test(value) && !hasTranslation("en", value)) missing.add(value);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
    }
    expect([...missing]).toEqual([]);
  });
});
