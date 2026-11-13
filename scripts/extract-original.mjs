// Convert the supplied single-file prototype into tree-shakeable ES modules.
// Symbol-based dependency tracing preserves the original rendering and shaders.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import ts from "typescript";
import { transform } from "esbuild";
const html = fs.readFileSync("csf国产3A大作_V1.html", "utf8");
const original = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const pretty = (
  await transform(original, {
    minify: false,
    loader: "js",
    legalComments: "none",
  })
).code;
const parsed = ts.createSourceFile(
  "bundle.js",
  pretty,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const closure = parsed.statements.find(ts.isExpressionStatement).expression
  .expression;
const source = closure.expression.body.getText(parsed).slice(1, -1);
const first = ts.createSourceFile(
  "source.js",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS,
);
const exportsCall = first.statements.find(
  (s) =>
    ts.isExpressionStatement(s) &&
    s.expression.expression?.getText(first) === "br" &&
    s.expression.arguments?.[0]?.getText(first) === "lt",
);
const aliases = new Map(
  exportsCall.expression.arguments[1].properties.map((p) => [
    p.initializer.body.getText(first),
    p.name.getText(first),
  ]),
);
const statements = [];
let game = false;
for (const s of first.statements) {
  if (
    ts.isVariableStatement(s) &&
    s.declarationList.declarations.some((d) => d.name.getText(first) === "oi")
  )
    game = true;
  if (!game) continue;
  if (
    ts.isVariableStatement(s) &&
    s.declarationList.declarations.some((d) => d.name.getText(first) === "gM")
  )
    break;
  if (ts.isVariableStatement(s))
    for (const d of s.declarationList.declarations)
      statements.push(`var ${d.getText(first)};`);
  else if (
    !(
      ts.isExpressionStatement(s) &&
      s.expression.expression?.getText(first) === "br"
    )
  )
    statements.push(s.getText(first));
}
const content = statements.join("\n");
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "jimao-original-"),
);
process.on("exit", () =>
  fs.rmSync(temporaryDirectory, { recursive: true, force: true }),
);
const file = path.join(temporaryDirectory, "source.js");
fs.writeFileSync(file, content);
const program = ts.createProgram([file], {
  allowJs: true,
  noLib: true,
  noResolve: true,
});
const sf = program.getSourceFile(file),
  checker = program.getTypeChecker(),
  bindings = new Map();
for (const s of sf.statements) {
  const name = ts.isVariableStatement(s)
    ? s.declarationList.declarations[0].name
    : s.name;
  if (name) bindings.set(checker.getSymbolAtLocation(name), s);
}
function emit(filename, roots, effects = false) {
  const needed = new Set(),
    imports = new Map();
  function include(statement) {
    if (needed.has(statement)) return;
    needed.add(statement);
    function visit(node) {
      if (ts.isIdentifier(node)) {
        const symbol = ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
        if (bindings.has(symbol)) include(bindings.get(symbol));
        else if (!symbol && aliases.has(node.text))
          imports.set(node.text, aliases.get(node.text));
      }
      ts.forEachChild(node, visit);
    }
    visit(statement);
  }
  if (effects)
    for (const s of sf.statements)
      if (
        !ts.isVariableStatement(s) &&
        !ts.isFunctionDeclaration(s) &&
        !ts.isClassDeclaration(s)
      )
        include(s);
  for (const root of Object.keys(roots)) {
    const s = sf.statements.find(
      (s) =>
        (ts.isVariableStatement(s)
          ? s.declarationList.declarations[0].name
          : s.name
        )?.getText(sf) === root,
    );
    if (!s) throw Error(root);
    include(s);
  }
  const code = `// Generated from csf国产3A大作_V1.html by scripts/extract-original.mjs.\n// Preserve original shaders and geometry; adapt gameplay in the typed client layer.\nimport * as lt from 'three';\nconst {${[...imports].map(([alias, name]) => `${name}:${alias}`).join(",")}} = lt;\n${sf.statements
    .filter((s) => needed.has(s))
    .map((s) => s.getText(sf))
    .join("\n")}\nexport {${Object.entries(roots)
    .map(([name, alias]) => `${name} as ${alias}`)
    .join(",")}};\n`;
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(
    filename,
    code
      .replace(
        'document.getElementById("view")',
        '(i.canvas || document.getElementById("view"))',
      )
      .replace(
        "muzzleWorld: Re, reloadNow: Fe",
        "playShot: Be, muzzleWorld: Re, reloadNow: Fe",
      ),
  );
  console.log(filename, code.length, "bytes", needed.size, "declarations");
}
emit(
  "src/client/original/engine.js",
  {
    Hg: "createRenderer",
    Gg: "createMaterials",
    C1: "createLevel",
    pv: "createBackdrop",
    O1: "createGround",
    Cf: "createEffects",
    dm: "createWeapon",
    Yg: "createProps",
    zy: "selectQuality",
    Dy: "createEvents",
    il: "createRandom",
    w_: "createRifleGeometry",
    mi: "rifleInfo",
  },
  true,
);
emit("src/shared/original/physics.js", {
  d3: "createPhysics",
  oi: "worldBounds",
});
