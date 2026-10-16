"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiagnosticsManager = void 0;
const vscode_languageserver_1 = require("vscode-languageserver");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class DiagnosticsManager {
    projectIndex;
    constructor(projectIndex) {
        this.projectIndex = projectIndex;
    }
    getFastDiagnostics(doc) {
        const diagnostics = [...doc.diagnostics];
        // Check component invocation props against project index
        for (const comp of doc.components) {
            if (comp.isClosing || comp.name === 'Slot')
                continue;
            const meta = this.projectIndex.getComponent(comp.name);
            if (!meta)
                continue; // Unknown component (or non-indexed)
            const providedAttrs = new Set();
            for (const attr of comp.attributes) {
                providedAttrs.add(attr.name);
            }
            // Check required props
            for (const [propName, propDef] of meta.props.entries()) {
                if (propDef.isRequired) {
                    // Can be satisfied by attribute OR by <Slot name="propName">
                    const isSatisfiedByAttr = providedAttrs.has(propName);
                    const isSatisfiedBySlot = meta.slots.includes(propName);
                    if (!isSatisfiedByAttr && !isSatisfiedBySlot) {
                        diagnostics.push({
                            range: comp.nameRange,
                            message: `Component <${comp.name}> requires prop '${propName}' of type '${propDef.type}'`,
                            severity: vscode_languageserver_1.DiagnosticSeverity.Error,
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
    async runAuthoritativeLint(phpPath, filePath) {
        try {
            const { stdout } = await execAsync(`"${phpPath}" cast lint "${filePath}" --json`);
            const result = JSON.parse(stdout);
            if (!result.success && result.errors) {
                return result.errors.map((err) => ({
                    range: {
                        start: { line: (err.line || 1) - 1, character: 0 },
                        end: { line: (err.line || 1) - 1, character: 100 }
                    },
                    message: err.message,
                    severity: vscode_languageserver_1.DiagnosticSeverity.Error,
                    source: 'cast-compiler'
                }));
            }
        }
        catch {
            // CLI lint failed or not supported in this directory
        }
        return [];
    }
}
exports.DiagnosticsManager = DiagnosticsManager;
//# sourceMappingURL=diagnostics.js.map