// Static TypeScript AST inspection only. Never import or execute inspected files.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export function parser(root, explicit) {
  const require = createRequire(path.join(path.resolve(root), '__coverage_parser__.cjs'));
  try { return require(explicit ? path.resolve(explicit) : 'typescript'); }
  catch { throw new Error('Static parser unavailable: supply --typescript <trusted typescript.js>; do not install dependencies outside setup.'); }
}

export function inspect(ts, file) {
  const source = fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (tree.parseDiagnostics.length) throw new Error(`${file}: source parse failed`);
  const calls = [], assertions = [], functions = [], imports = [];
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      imports.push(node.moduleSpecifier.text);
      for (const binding of node.importClause?.namedBindings?.elements || []) {
        if (binding.propertyName?.text === 'test' && binding.name.text !== 'test') throw new Error(`${file}: aliased test declarations require a reviewed static adapter`);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) functions.push(node);
    if (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) functions.push(node);
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(tree);
      if (/^test(?:\.(?:skip|fixme|only|fail))?$/.test(expression) && node.arguments.length >= 2) {
        const body = node.arguments.at(-1);
        if (ts.isArrowFunction(body) || ts.isFunctionExpression(body)) {
          if (ts.isBlock(body.body) && body.body.statements.length === 0) throw new Error(`${file}: empty test body`);
          calls.push({node, body, expression});
        } else if (expression === 'test' || ts.isStringLiteral(node.arguments[0])) throw new Error(`${file}: unresolved test callback requires a reviewed static adapter`);
      }
      // Only actual matcher calls rooted in expect, not comments, strings or mere expect(value).
      if (/^(?:await\s+)?expect(?:\.(?:soft|poll))?\s*\(/.test(expression) && /\.(?:not\.)?[A-Za-z]\w*$/.test(expression)) assertions.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const metadataPositions = new Set();
  const commentsAtNodes = node => {
    for (const comment of ts.getLeadingCommentRanges(source, node.getFullStart()) || []) {
      if (/^\/\/\s*@e2e-meta\s/.test(source.slice(comment.pos, comment.end))) metadataPositions.add(comment.pos);
    }
    ts.forEachChild(node, commentsAtNodes);
  };
  commentsAtNodes(tree);
  if (metadataPositions.size !== calls.length) throw new Error(`${file}: orphan or unsupported @e2e-meta declaration`);
  const within = (node, container) => node.getStart(tree) >= container.getStart(tree) && node.end <= container.end;
  const records = [];
  for (const call of calls) {
    const statement = call.node.parent;
    const comments = ts.getLeadingCommentRanges(source, statement.getFullStart()) || [];
    const metaComments = comments.map(c => source.slice(c.pos, c.end)).filter(c => /^\/\/\s*@e2e-meta\s/.test(c));
    if (metaComments.length !== 1) throw new Error(`${file}: each test declaration requires one adjacent @e2e-meta record`);
    const metadata = JSON.parse(metaComments[0].replace(/^\/\/\s*@e2e-meta\s+/, ''));
    const cases = metadata.cases || [metadata];
    if (!Array.isArray(cases) || !cases.length) throw new Error(`${file}: empty parameterized metadata`);
    if (metadata.cases) {
      let loop = statement.parent;
      while (loop && !ts.isForOfStatement(loop)) loop = loop.parent;
      if (!loop || !ts.isArrayLiteralExpression(loop.expression)) throw new Error(`${file}: parameterized cases require a literal for-of array (dynamic factories need a reviewed static adapter)`);
      const ids = loop.expression.elements.map(e => ts.isObjectLiteralExpression(e) && e.properties.find(p => p.name?.getText(tree) === 'testId')?.initializer).map(v => v && ts.isStringLiteral(v) ? v.text : null);
      if (ids.some(id => !id) || new Set(ids).size !== ids.length || JSON.stringify([...ids].sort()) !== JSON.stringify(cases.map(c => c.testId).sort())) throw new Error(`${file}: parameterized IDs do not match literal cases`);
    }
    for (const meta of cases) {
      if (!meta.testId || !meta.journeyId || typeof meta.portalEligible !== 'boolean') throw new Error(`${file}: invalid test metadata`);
      records.push({...meta, node: call.node, body: call.body, line: tree.getLineAndCharacterOfPosition(call.node.getStart(tree)).line + 1});
    }
  }
  const evidence = new Map();
  // Anchors must be real comments adjacent to an assertion statement, not arbitrary text.
  for (const assertion of assertions) {
    let statement = assertion;
    while (statement.parent && !ts.isExpressionStatement(statement)) statement = statement.parent;
    if (!ts.isExpressionStatement(statement)) continue;
    const comments = ts.getLeadingCommentRanges(source, statement.getFullStart()) || [];
    for (const comment of comments) {
      const match = source.slice(comment.pos, comment.end).match(/^\/\/\s*@e2e-evidence\s+([\w.-]+)\s*$/);
      if (!match) continue;
      if (evidence.has(match[1])) throw new Error(`${file}: duplicate evidence anchor ${match[1]}`);
      const text = assertion.getText(tree);
      if (/^expect\(\s*(?:true|false|\d+|['"][^'"]*['"])\s*\)/.test(text)) throw new Error(`${file}: unconditional literal assertion at ${match[1]}`);
      evidence.set(match[1], {node: assertion, text, testIds: records.filter(r => within(assertion, r.body)).map(r => r.testId), helper: functions.find(f => within(assertion, f))?.name?.getText(tree)});
    }
  }
  for (const assertion of assertions) {
    if (/^expect\(\s*(?:true|false|\d+|['"][^'"]*['"])\s*\)/.test(assertion.getText(tree))) throw new Error(`${file}: unconditional literal assertion`);
  }
  return {source, tree, records, evidence, assertions, imports, within};
}
