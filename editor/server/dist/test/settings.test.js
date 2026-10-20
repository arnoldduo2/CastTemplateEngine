"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const settings_js_1 = require("../settings.js");
(0, node_test_1.default)('resolveSettings fills in every default the extension itself uses', () => {
    strict_1.default.deepEqual((0, settings_js_1.resolveSettings)(undefined), settings_js_1.DEFAULT_SETTINGS);
    strict_1.default.deepEqual((0, settings_js_1.resolveSettings)({ propCase: 'kebab' }), { ...settings_js_1.DEFAULT_SETTINGS, propCase: 'kebab' });
});
(0, node_test_1.default)('resolveSettings normalizes a bare string componentsPath into an array (cast.componentsPath is declared ["string", "array"] in package.json)', () => {
    strict_1.default.deepEqual((0, settings_js_1.resolveSettings)({ componentsPath: 'resources/views/ui' }), { ...settings_js_1.DEFAULT_SETTINGS, componentsPath: ['resources/views/ui'] });
});
(0, node_test_1.default)('resolveSettings falls back to the default propCase/diagnostics on an unrecognized value, instead of passing it through', () => {
    strict_1.default.deepEqual((0, settings_js_1.resolveSettings)({ propCase: 'shout', diagnostics: 'loud' }), settings_js_1.DEFAULT_SETTINGS);
});
//# sourceMappingURL=settings.test.js.map