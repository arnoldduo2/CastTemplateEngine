import { DiagnosticSeverity, Position, Range } from 'vscode-languageserver';
import { camel } from 'cast-language-core';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CastDiagnostic, ComponentMetadata, PropDefinition } from '../types.js';
import { CastSettings } from '../settings.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function positionAt(text: string, offset: number): Position {
  const clamped = Math.max(0, Math.min(offset, text.length));
  const lines = text.slice(0, clamped).split('\n');
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

function rangeAt(text: string, start: number, end: number): Range {
  return { start: positionAt(text, start), end: positionAt(text, end) };
}

/** The closest of `candidates` to `word` (edit distance <= 2, or the same name in another case/kebab spelling). */
function nearest(word: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const c of candidates) {
    if (camel(c).toLowerCase() === word.toLowerCase()) return c;
    const d = editDistance(word.toLowerCase(), c.toLowerCase());
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

export class DiagnosticsManager {
  constructor(private projectIndex: ProjectIndex) {}

  public getFastDiagnostics(doc: CastDocument, settings: CastSettings): CastDiagnostic[] {
    if (settings.diagnostics === 'off') return [];
    // component-tag issues (unknown/invalid-value/deprecated/deprecated-prop/mixed-echo-style) respect the
    // configured level; parser-sourced structural errors and missing-prop/missing-key/props-legacy-conflict stay
    // at their own fixed severity unconditionally - matches editor/vscode/lib/complete.js's own SEVERITY mapping.
    const componentSeverity = settings.diagnostics === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Hint;

    const diagnostics: CastDiagnostic[] = [...doc.diagnostics];

    // Check component invocation props against project index
    for (const comp of doc.components) {
      if (comp.isClosing || comp.name === 'Slot') continue;

      const meta = this.projectIndex.getComponent(comp.name);
      if (!meta) continue; // Unknown component (or non-indexed)

      if (meta.deprecated) {
        diagnostics.push({
          range: comp.nameRange,
          message: `<${comp.name}> is deprecated${meta.deprecated === true ? '' : ': ' + meta.deprecated}`,
          severity: componentSeverity,
          code: 'deprecated-component'
        });
      }

      const providedAttrs = new Set<string>();
      for (const attr of comp.attributes) {
        providedAttrs.add(attr.name);
      }

      // Check required props
      for (const [propName, propDef] of meta.props.entries()) {
        if (propDef.isRequired) {
          // Can be satisfied by attribute OR by <Slot name="propName">
          const isSatisfiedByAttr = providedAttrs.has(propName);
          const isSatisfiedBySlot = meta.slots.some((slot) => slot.name === propName);

          if (!isSatisfiedByAttr && !isSatisfiedBySlot) {
            diagnostics.push({
              range: comp.nameRange,
              message: `Component <${comp.name}> requires prop '${propName}' of type '${propDef.type}'`,
              severity: DiagnosticSeverity.Error,
              code: 'missing-prop',
              fix: [{
                title: `Add ${propName}="${propDef.defaultValue ?? ''}"`,
                newText: ` ${propName}="${propDef.defaultValue ?? ''}"`,
                range: comp.nameRange
              }]
            });
          }
        }
      }

      // Unknown/deprecated/invalid-value, per written attribute
      const slotNames = new Set(meta.slots.map((s) => camel(s.name)));
      for (const attr of comp.attributes) {
        if (!attr.name) continue;
        const prop = this.findProp(meta, attr.name);
        if (!prop) {
          if (slotNames.has(camel(attr.name))) continue;
          const suggestion = nearest(camel(attr.name), [...meta.props.keys()]);
          diagnostics.push({
            range: attr.nameRange,
            message: `<${comp.name}> has no prop "${attr.name}"` + (suggestion ? `. Did you mean "${suggestion}"?` : ''),
            severity: componentSeverity,
            code: 'unknown-prop',
            fix: suggestion ? [{ title: `Change to "${suggestion}"`, newText: suggestion, range: attr.nameRange }] : undefined
          });
          continue;
        }
        if (prop.deprecated) {
          diagnostics.push({
            range: attr.nameRange,
            message: `"${prop.name}" is deprecated${prop.deprecated === true ? '' : ': ' + prop.deprecated}`,
            severity: componentSeverity,
            code: 'deprecated-prop'
          });
        }
        if (
          attr.value !== undefined && attr.valueRange &&
          !attr.isExpression && !attr.isSpread && !attr.isBoolean &&
          prop.kind === 'string' && prop.values?.length &&
          !attr.value.includes('<?') && !prop.values.includes(attr.value)
        ) {
          diagnostics.push({
            range: attr.valueRange,
            message: `"${attr.value}" is not one of ${prop.values.map((v) => `"${v}"`).join(', ')} for "${prop.name}"`,
            severity: componentSeverity,
            code: 'invalid-value',
            fix: prop.values.map((v) => ({ title: `Use "${v}"`, newText: v, range: attr.valueRange! }))
          });
        }
      }
    }

    // Missing key: @map/@filter/.map rendering a tag with no key/data-el-key, which breaks stable identity.
    // Ruling (Task 5): the extension's own regex for this (`\([^)]*=>`) cannot match once the callback's params
    // are parenthesized - i.e. every documented form (`($item, $i) => ...`, `fn($item) => ...`) - since `[^)]*`
    // cannot cross the callback's own closing `)`. Confirmed empirically; porting it verbatim would ship a check
    // that can never fire for valid syntax. Scanning with an explicit paren-depth count instead.
    const mapOpen = /(?:@map|@filter|\.map)\s*\(/g;
    let om: RegExpExecArray | null;
    while ((om = mapOpen.exec(doc.text)) !== null) {
      let i = om.index + om[0].length;
      let depth = 1;
      let arrowAt = -1;
      while (i < doc.text.length && depth > 0) {
        const c = doc.text[i];
        if (c === '(') depth++;
        else if (c === ')') { if (--depth === 0) break; }
        else if (c === '=' && doc.text[i + 1] === '>' && depth === 1) { arrowAt = i; break; }
        i++;
      }
      if (arrowAt === -1) continue;

      let j = arrowAt + 2;
      while (/\s/.test(doc.text[j])) j++;
      const wrapper = /^(?:return\s*\(|@render\s*\(|\()/.exec(doc.text.slice(j));
      if (wrapper) j += wrapper[0].length;
      while (/\s/.test(doc.text[j])) j++;

      const tagMatch = /^<([A-Za-z0-9_\-.:]+)/.exec(doc.text.slice(j));
      if (!tagMatch) continue;
      const tagStart = j;
      const tagClose = doc.text.indexOf('>', tagStart);
      const attrs = doc.text.slice(tagStart, tagClose === -1 ? doc.text.length : tagClose);
      if (!/\b(?:key|data-el-key)\s*=/i.test(attrs)) {
        const tagName = tagMatch[1];
        diagnostics.push({
          range: rangeAt(doc.text, tagStart, tagStart + tagName.length + 1),
          message: `Missing key: Provide a unique "key={...}" for mapped <${tagName}> to ensure stable identity and prevent UI glitches.`,
          severity: DiagnosticSeverity.Warning,
          code: 'missing-key'
        });
      }
    }

    // Style consistency: mixing <?= ?> and @{ } for plain output across sibling leaf tags is confusing - flagged
    // only within a contiguous run of simple <tag>ECHO</tag> siblings; unrelated uses elsewhere are never flagged.
    const leafEcho = /<([A-Za-z][\w-]*)>\s*(?:(<\?=\s*[^?]*?\s*\?>)|(@\{[^{}]*\}))\s*<\/\1>/g;
    let run: { start: number; end: number; style: string }[] = [];
    const flushRun = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
      const styles = new Set(run.map((r) => r.style));
      if (styles.size > 1) {
        const majority = run.filter((r) => r.style === '<?= ?>').length >= run.filter((r) => r.style === '@{ }').length ? '<?= ?>' : '@{ }';
        for (const r of run) {
          if (r.style !== majority) {
            diagnostics.push({
              range: rangeAt(doc.text, r.start, r.end),
              message: `Mixes "${r.style}" with "${majority}" used on the sibling tags right around it - pick one style for a run like this`,
              severity: componentSeverity,
              code: 'mixed-echo-style'
            });
          }
        }
      }
      run = [];
    };
    let lm: RegExpExecArray | null;
    let lastEnd: number | null = null;
    while ((lm = leafEcho.exec(doc.text)) !== null) {
      const style = lm[2] ? '<?= ?>' : '@{ }';
      const matched = (lm[2] || lm[3]) as string;
      const exprStart = lm.index + lm[0].indexOf(matched);
      const entry = { start: exprStart, end: exprStart + matched.length, style };
      if (lastEnd !== null && doc.text.slice(lastEnd, lm.index).trim() !== '') flushRun();
      run.push(entry);
      lastEnd = lm.index + lm[0].length;
    }
    flushRun();

    // @props{}: a name declared there that still also has a legacy `$name ??= ...;` line for itself is a real
    // compile error (CastTemplateEngine\Props::scan() rejects it - the prelude already assigns that name
    // unconditionally, making the old line silently dead code) - caught here too, not just at the next compile.
    if (doc.propsBlock) {
      for (const entry of doc.propsBlock.entries) {
        const re = new RegExp(`\\$${entry.name}\\s*\\?\\?=`);
        const m = re.exec(doc.text);
        if (m) {
          diagnostics.push({
            range: rangeAt(doc.text, m.index, m.index + m[0].length),
            message: `"$${entry.name}" is declared in @props{} and also uses the legacy "$${entry.name} ??= ..." convention - remove the ??= line, its default now belongs in @props{}`,
            severity: DiagnosticSeverity.Error,
            code: 'props-legacy-conflict'
          });
        }
      }
    }

    return diagnostics;
  }

  /** The documented prop for an attribute name, matching the engine's camelCasing (`has-label` is `hasLabel`). */
  private findProp(meta: ComponentMetadata, attributeName: string): PropDefinition | null {
    const wanted = camel(attributeName);
    for (const prop of meta.props.values()) {
      if (prop.name === attributeName || camel(prop.name) === wanted) return prop;
    }
    return null;
  }

  public async runAuthoritativeLint(phpPath: string, filePath: string): Promise<CastDiagnostic[]> {
    try {
      const { stdout } = await execAsync(`"${phpPath}" cast lint "${filePath}" --json`);
      const result = JSON.parse(stdout);

      if (!result.success && result.errors) {
        return result.errors.map((err: any) => ({
          range: {
            start: { line: (err.line || 1) - 1, character: 0 },
            end: { line: (err.line || 1) - 1, character: 100 }
          },
          message: err.message,
          severity: DiagnosticSeverity.Error,
          source: 'cast-compiler'
        }));
      }
    } catch {
      // CLI lint failed or not supported in this directory
    }
    return [];
  }
}
