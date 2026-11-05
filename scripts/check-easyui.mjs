// Ensure the pinned catalog stays integrated into the running app, not just copied to disk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync('src/vendor/easyui/catalog.json', 'utf8'));
const reachable = new Set();
function visit(relative) {
  const file = path.resolve(root, relative);
  if (reachable.has(file)) return;
  reachable.add(file);
  const source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const resolve = (specifier) => {
    if (!specifier?.startsWith('.')) return;
    const base = path.resolve(path.dirname(file), specifier);
    const target = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
      (candidate) => /\.[cm]?[jt]sx?$/.test(candidate) && fs.existsSync(candidate),
    );
    if (target) visit(target);
  };
  function walk(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      resolve(node.moduleSpecifier.text);
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(node.arguments[0])
    )
      resolve(node.arguments[0].text);
    ts.forEachChild(node, walk);
  }
  walk(ast);
}
visit('src/App.tsx');
assert.equal(catalog.items.length, 132);
assert.equal(new Set(catalog.items.map((item) => item.id)).size, 132);
for (const item of catalog.items) {
  assert.ok(reachable.has(path.resolve(root, item.source)), `Disconnected EasyUI component: ${item.id}`);
  assert.ok(item.screens.length, `Missing screen mapping: ${item.id}`);
}
console.log('EasyUI: all 132 catalog components are reachable from Raeen.');
