// Prüft die Inline-Dokumentation in src/:
//   Export-Abdeckung: exportierte Symbole mit JSDoc / alle exportierten Symbole  (Untergrenze)
//   Inline-Kommentare: Zeilen mit //- oder /* */-Kommentaren (ohne JSDoc) / alle Zeilen  (Obergrenze)
// Aufruf: node scripts/check-docs.mjs [--min-exports=<%>] [--max-inline-comments=<%>]
// In GitHub Actions wird zusätzlich ein Bericht in die Job Summary geschrieben.
import { appendFileSync } from 'node:fs'
import { relative } from 'node:path'
import ts from 'typescript'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg) => arg.match(/^--([\w-]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, Number(value)]),
)
const minExports = args['min-exports'] ?? 0
const maxInline = args['max-inline-comments'] ?? 100

const configPath = ts.findConfigFile('.', ts.sys.fileExists, 'tsconfig.app.json')
const { config } = ts.readConfigFile(configPath, ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, '.')
const program = ts.createProgram(parsed.fileNames, parsed.options)
const checker = program.getTypeChecker()
const sourceFiles = program.getSourceFiles().filter((sf) => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'))

const percent = (part, total) => (total === 0 ? 0 : (part / total) * 100)

/** Zählt Codezeilen, JSDoc-Zeilen und reine Inline-Kommentarzeilen einer Datei */
function countLines(sf) {
  const text = sf.getFullText()
  const code = new Set()
  const jsdoc = new Set()
  const inline = new Set()
  const seen = new Set()
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line
  const addRange = (set, pos, end) => {
    for (let line = lineOf(pos); line <= lineOf(end); line++) set.add(line)
  }

  const addComments = (ranges) => {
    for (const r of ranges ?? []) {
      if (seen.has(r.pos)) continue
      seen.add(r.pos)
      addRange(text.startsWith('/**', r.pos) ? jsdoc : inline, r.pos, r.end)
    }
  }

  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) {
      // JSDoc hängt als eigener Knoten im AST
      seen.add(node.getStart(sf))
      addRange(jsdoc, node.getStart(sf), node.getEnd())
      return
    }
    if (node.kind < ts.SyntaxKind.FirstNode || node.getChildCount(sf) === 0) {
      addComments(ts.getLeadingCommentRanges(text, node.getFullStart()))
      addComments(ts.getTrailingCommentRanges(text, node.getEnd()))
      const start = node.getStart(sf)
      if (node.getEnd() > start && node.getText(sf).trim() !== '') addRange(code, start, node.getEnd())
      return
    }
    node.getChildren(sf).forEach(visit)
  }
  visit(sf)

  const all = new Set([...code, ...jsdoc, ...inline])
  return { total: all.size, inline: inline.size }
}

/** Exportierte Symbole einer Datei und ob sie JSDoc haben */
function exportsOf(sf) {
  const moduleSymbol = checker.getSymbolAtLocation(sf)
  if (!moduleSymbol) return []
  return checker.getExportsOfModule(moduleSymbol).map((symbol) => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol
    const decl = target.declarations?.[0]
    return {
      name: symbol.getName(),
      documented: target.getDocumentationComment(checker).length > 0,
      line: decl ? decl.getSourceFile().getLineAndCharacterOfPosition(decl.getStart()).line + 1 : 0,
    }
  })
}

const rows = sourceFiles.map((sf) => ({
  file: relative('.', sf.fileName).replaceAll('\\', '/'),
  ...countLines(sf),
  exports: exportsOf(sf),
}))

const totalLines = rows.reduce((sum, r) => sum + r.total, 0)
const inlineLines = rows.reduce((sum, r) => sum + r.inline, 0)
const allExports = rows.flatMap((r) => r.exports.map((e) => ({ ...e, file: r.file })))
const undocumented = allExports.filter((e) => !e.documented)

const exportCoverage = allExports.length === 0 ? 100 : percent(allExports.length - undocumented.length, allExports.length)
const inlineShare = percent(inlineLines, totalLines)
const exportsOk = exportCoverage >= minExports
const inlineOk = inlineShare <= maxInline

const fmt = (n) => `${n.toFixed(1)} %`
const mark = (ok) => (ok ? '✅' : '❌')

const report = [
  '## Inline-Dokumentation',
  '',
  '| Kennzahl | Wert | Grenzwert | |',
  '|---|---|---|---|',
  `| Exporte mit JSDoc (${allExports.length - undocumented.length} von ${allExports.length}) | ${fmt(exportCoverage)} | ≥ ${fmt(minExports)} | ${mark(exportsOk)} |`,
  `| Inline-Kommentare ohne JSDoc (${inlineLines} von ${totalLines} Zeilen) | ${fmt(inlineShare)} | ≤ ${fmt(maxInline)} | ${mark(inlineOk)} |`,
  '',
  '### Pro Datei',
  '',
  '| Datei | Exporte mit JSDoc | Inline-Kommentare |',
  '|---|---|---|',
  ...rows.map((r) => {
    const documented = r.exports.filter((e) => e.documented).length
    return `| \`${r.file}\` | ${documented} / ${r.exports.length} | ${fmt(percent(r.inline, r.total))} |`
  }),
  '',
  ...(undocumented.length ? ['### Exporte ohne JSDoc', '', ...undocumented.map((e) => `- \`${e.name}\` – \`${e.file}:${e.line}\``), ''] : []),
].join('\n')

console.log(report)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report)

if (!exportsOk || !inlineOk) {
  console.error('Inline-Dokumentation verletzt einen Grenzwert.')
  process.exit(1)
}
