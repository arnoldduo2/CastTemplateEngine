"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const vscode_languageserver_1 = require("vscode-languageserver");
const castParser_js_1 = require("../parser/castParser.js");
const projectIndex_js_1 = require("../index/projectIndex.js");
const diagnostics_js_1 = require("../diagnostics/diagnostics.js");
const codeActions_js_1 = require("../codeActions/codeActions.js");
const settings_js_1 = require("../settings.js");
const parser = new castParser_js_1.CastParser();
const codeActions = new codeActions_js_1.CodeActionsManager();
/** Indexes a single Card component (required title, enum variant, a deprecated prop, a deprecated component
 * variant via a second file) and parses `viewSource` against it. */
function setup(componentSource, viewSource) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-diagnostics-'));
    const componentsDir = path.join(root, 'resources/views/components');
    fs.mkdirSync(componentsDir, { recursive: true });
    const componentPath = path.join(componentsDir, 'card.cast.php');
    fs.writeFileSync(componentPath, componentSource);
    const index = new projectIndex_js_1.ProjectIndex([root]);
    index.indexFile(componentsDir, componentPath, false); // baseDir = components folder, so the tag is "Card"
    const manager = new diagnostics_js_1.DiagnosticsManager(index);
    const doc = parser.parse('file:///view.cast.php', viewSource);
    return { manager, doc };
}
const CARD = `<?php
/**
 * Card component
 * @var string $title The card's heading
 * @var string $variant Visual style, e.g. "primary", "secondary", "ghost"
 * @var string $oldProp Deprecated: use variant instead
 */
`;
const DEPRECATED_CARD = `<?php
/**
 * Card component
 * @deprecated use NewCard instead
 * @var string $title The card's heading
 */
`;
const CARD_WITH_CAMEL_PROP = `<?php
/**
 * Card component
 * @var string $title The card's heading
 * @var string $iconName The icon to show, required
 */
`;
/** No docblock @var/@param tags at all - every prop comes only from a ??= default (inferred: true), the most
 * common shape in an older/legacy project. */
const LEGACY_ONLY_TOOLTIP = `<?php
$text ??= 'Tip';
$position ??= 'top';
`;
(0, node_test_1.default)('a required prop written in kebab-case still satisfies the camelCase-documented prop (no false missing-prop)', () => {
    const { manager, doc } = setup(CARD_WITH_CAMEL_PROP, '<Card title="x" icon-name="bell" />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    strict_1.default.equal(diagnostics.find((d) => d.code === 'missing-prop'), undefined, 'icon-name already satisfies iconName');
});
(0, node_test_1.default)('a spread attribute ({...$props}) suppresses missing-prop entirely - it could be providing anything', () => {
    const { manager, doc } = setup(CARD_WITH_CAMEL_PROP, '<Card {...$props} />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    strict_1.default.equal(diagnostics.find((d) => d.code === 'missing-prop'), undefined);
});
(0, node_test_1.default)('a required prop provided by a call-site <Slot name="..."> child (not a documented @slot tag) satisfies missing-prop', () => {
    const { manager, doc } = setup(CARD, '<Card variant="primary"><Slot name="title">Hi</Slot></Card>');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    strict_1.default.equal(diagnostics.find((d) => d.code === 'missing-prop' && d.message.includes("'title'")), undefined);
});
(0, node_test_1.default)('an undocumented (legacy ??=-only) component is never flagged for an unknown attribute', () => {
    const { manager, doc } = setup(LEGACY_ONLY_TOOLTIP, '<Tooltip text="x" classX="mt-2" />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    strict_1.default.deepEqual(diagnostics, [], 'nothing documented means nothing to be wrong about');
});
(0, node_test_1.default)('missing-prop severity follows cast.diagnostics (Hint by default, Warning under "warning"), not a fixed Error', () => {
    const { manager, doc } = setup(CARD, '<Card />');
    const hint = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS).find((d) => d.code === 'missing-prop');
    strict_1.default.equal(hint.severity, vscode_languageserver_1.DiagnosticSeverity.Hint);
    const warning = manager.getFastDiagnostics(doc, { ...settings_js_1.DEFAULT_SETTINGS, diagnostics: 'warning' }).find((d) => d.code === 'missing-prop');
    strict_1.default.equal(warning.severity, vscode_languageserver_1.DiagnosticSeverity.Warning);
});
(0, node_test_1.default)('diagnostics: "off" silences every LSP-computed diagnostic, not just parser errors', () => {
    const { manager, doc } = setup(CARD, '<Card />');
    const diagnostics = manager.getFastDiagnostics(doc, { ...settings_js_1.DEFAULT_SETTINGS, diagnostics: 'off' });
    strict_1.default.deepEqual(diagnostics, []);
});
(0, node_test_1.default)('unknown prop name gets a suggestion and a quick fix that renames it', () => {
    const { manager, doc } = setup(CARD, '<Card title="x" varient="primary" />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const d = diagnostics.find((d) => d.code === 'unknown-prop');
    strict_1.default.ok(d, 'expected an unknown-prop diagnostic');
    strict_1.default.match(d.message, /did you mean/i);
    strict_1.default.equal(d.fix[0].newText, 'variant');
});
(0, node_test_1.default)('invalid enum value gets one quick fix per allowed value', () => {
    const { manager, doc } = setup(CARD, '<Card title="x" variant="loud" />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const d = diagnostics.find((d) => d.code === 'invalid-value');
    strict_1.default.ok(d, 'expected an invalid-value diagnostic');
    strict_1.default.equal(d.fix.length, 3); // primary, secondary, ghost
});
(0, node_test_1.default)('CodeActionsManager offers a fix for a diagnostic getFastDiagnostics computed, not just one CastParser already had', () => {
    const { manager, doc } = setup(CARD, '<Card />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const missing = diagnostics.find((d) => d.code === 'missing-prop');
    strict_1.default.ok(missing, 'expected a missing-prop diagnostic (title is required)');
    const actions = codeActions.getCodeActions(doc, { textDocument: { uri: doc.uri }, range: missing.range, context: { diagnostics: [] } }, diagnostics);
    strict_1.default.ok(actions.length > 0);
});
(0, node_test_1.default)('deprecated component gets flagged with its own message', () => {
    const { manager, doc } = setup(DEPRECATED_CARD, '<Card title="x" />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const d = diagnostics.find((d) => d.code === 'deprecated-component');
    strict_1.default.ok(d, 'expected a deprecated-component diagnostic');
    strict_1.default.match(d.message, /use NewCard instead/);
});
(0, node_test_1.default)('deprecated prop gets flagged with its own message', () => {
    const { manager, doc } = setup(CARD, '<Card title="x" oldProp="y" />');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const d = diagnostics.find((d) => d.code === 'deprecated-prop');
    strict_1.default.ok(d, 'expected a deprecated-prop diagnostic');
    strict_1.default.match(d.message, /use variant instead/);
});
(0, node_test_1.default)('missing key on a mapped tag is flagged', () => {
    const { manager, doc } = setup(CARD, "@map($items, ($item, $i) => return(<li>@{ $item->name }</li>))");
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const d = diagnostics.find((d) => d.code === 'missing-key');
    strict_1.default.ok(d, 'expected a missing-key diagnostic');
});
(0, node_test_1.default)('mixing <?= ?> and @{ } across sibling leaf tags is flagged', () => {
    const { manager, doc } = setup(CARD, '<td><?= $a ?></td><td>@{ $b }</td><td>@{ $c }</td>');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const d = diagnostics.find((d) => d.code === 'mixed-echo-style');
    strict_1.default.ok(d, 'expected a mixed-echo-style diagnostic on the minority-style sibling');
});
(0, node_test_1.default)('a @props{} entry that still has a legacy ??= line for the same name is flagged', () => {
    const { manager, doc } = setup(CARD, '@props { string $title; }\n<?php $title ??= "x"; ?>');
    const diagnostics = manager.getFastDiagnostics(doc, settings_js_1.DEFAULT_SETTINGS);
    const d = diagnostics.find((d) => d.code === 'props-legacy-conflict');
    strict_1.default.ok(d, 'expected a props-legacy-conflict diagnostic');
});
//# sourceMappingURL=diagnostics.test.js.map