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
const projectIndex_js_1 = require("../index/projectIndex.js");
const settings_js_1 = require("../settings.js");
function fixtureRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cast-project-index-'));
    fs.mkdirSync(path.join(root, 'resources/views/components/btns'), { recursive: true });
    fs.writeFileSync(path.join(root, 'resources/views/components/button.cast.php'), `<?php
/**
 * Button component
 * @var string $variant Visual style, e.g. "primary", "secondary", "ghost"
 * @slot icon An optional leading icon
 */
$variant ??= 'primary';
`);
    fs.writeFileSync(path.join(root, 'resources/views/components/btns/add-new.cast.php'), '<div></div>');
    return root;
}
(0, node_test_1.default)('indexFile uses the shared parseComponent, not an ad-hoc regex, and keeps the richer docblock fields', () => {
    const root = fixtureRoot();
    const index = new projectIndex_js_1.ProjectIndex([root]);
    const meta = index.indexFile(root, path.join(root, 'resources/views/components/button.cast.php'), false);
    const variant = meta.props.get('variant');
    strict_1.default.deepEqual(variant.values, ['primary', 'secondary', 'ghost']);
    strict_1.default.equal(meta.slots.some((s) => s.name === 'icon'), true); // SlotSpec, not a bare string
});
(0, node_test_1.default)('ProjectIndex.resolveLegacyComponent/resolveView/resolveModule resolve against the configured settings', () => {
    const root = fixtureRoot();
    const index = new projectIndex_js_1.ProjectIndex([root]);
    index.setSettings((0, settings_js_1.resolveSettings)({ componentsPath: ['resources/views/components'] }));
    const { file } = index.resolveLegacyComponent('btns.add-new');
    strict_1.default.ok(file && file.endsWith('add-new.cast.php'));
});
//# sourceMappingURL=projectIndex.test.js.map