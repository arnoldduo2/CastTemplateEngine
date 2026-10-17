"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.resolveSettings = resolveSettings;
/** Mirrors the VS Code extension's own defaults (locations()/config.get() in editor/vscode/extension.js). */
exports.DEFAULT_SETTINGS = {
    propCase: 'camel',
    componentsPath: ['resources/views/components'],
    viewsPath: 'resources/views',
    resourcesPath: 'resources',
    extension: '.cast.php',
    diagnostics: 'hint',
};
/** Fills in a default for any key `raw` doesn't supply - the LSP's own settings may arrive partial (an older
 * client, an initializationOptions payload missing a key the extension hasn't started sending yet). */
function resolveSettings(raw) {
    return { ...exports.DEFAULT_SETTINGS, ...raw };
}
//# sourceMappingURL=settings.js.map