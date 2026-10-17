import { DiagnosticSeverity } from 'vscode-languageserver';
import { CastDocument } from '../parser/ast.js';
import { ProjectIndex } from '../index/projectIndex.js';
import { CastDiagnostic } from '../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class DiagnosticsManager {
  constructor(private projectIndex: ProjectIndex) {}

  public getFastDiagnostics(doc: CastDocument): CastDiagnostic[] {
    const diagnostics: CastDiagnostic[] = [...doc.diagnostics];

    // Check component invocation props against project index
    for (const comp of doc.components) {
      if (comp.isClosing || comp.name === 'Slot') continue;

      const meta = this.projectIndex.getComponent(comp.name);
      if (!meta) continue; // Unknown component (or non-indexed)

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
              fix: {
                title: `Add ${propName}="${propDef.defaultValue ?? ''}"`,
                newText: ` ${propName}="${propDef.defaultValue ?? ''}"`,
                range: comp.nameRange
              }
            });
          }
        }
      }
    }

    return diagnostics;
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
