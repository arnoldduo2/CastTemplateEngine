#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_js_1 = require("vscode-languageserver/node.js");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const vscode_uri_1 = require("vscode-uri");
const castParser_js_1 = require("./parser/castParser.js");
const projectIndex_js_1 = require("./index/projectIndex.js");
const diagnostics_js_1 = require("./diagnostics/diagnostics.js");
const codeActions_js_1 = require("./codeActions/codeActions.js");
const completion_js_1 = require("./features/completion.js");
const hover_js_1 = require("./features/hover.js");
const definition_js_1 = require("./features/definition.js");
const documentLinks_js_1 = require("./features/documentLinks.js");
const formatting_js_1 = require("./features/formatting.js");
const phpDelegation_js_1 = require("./features/phpDelegation.js");
const engine_js_1 = require("./php/engine.js");
const phpactorClient_js_1 = require("./php/phpactorClient.js");
const phpRouter_js_1 = require("./php/phpRouter.js");
const settings_js_1 = require("./settings.js");
// Create connection
const connection = (0, node_js_1.createConnection)(node_js_1.ProposedFeatures.all);
const documents = new node_js_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
// Internal state
const parsedDocs = new Map();
const parser = new castParser_js_1.CastParser();
const projectIndex = new projectIndex_js_1.ProjectIndex();
const diagnosticsManager = new diagnostics_js_1.DiagnosticsManager(projectIndex);
const codeActionsManager = new codeActions_js_1.CodeActionsManager();
const completionProvider = new completion_js_1.CompletionProvider(projectIndex);
const hoverProvider = new hover_js_1.HoverProvider(projectIndex);
const definitionProvider = new definition_js_1.DefinitionProvider(projectIndex);
const documentLinksProvider = new documentLinks_js_1.DocumentLinksProvider(projectIndex);
const formattingProvider = new formatting_js_1.FormattingProvider();
const phpEngineManager = new engine_js_1.PhpEngineManager();
let phpRouter = null;
let phpDelegation = null;
let settings = settings_js_1.DEFAULT_SETTINGS;
connection.onInitialize(async (params) => {
    settings = (0, settings_js_1.resolveSettings)(params.initializationOptions);
    completionProvider.setSettings(settings);
    // Collect workspace roots
    const roots = [];
    if (params.workspaceFolders) {
        for (const wf of params.workspaceFolders) {
            roots.push(vscode_uri_1.URI.parse(wf.uri).fsPath);
        }
    }
    else if (params.rootUri) {
        roots.push(vscode_uri_1.URI.parse(params.rootUri).fsPath);
    }
    projectIndex.setWorkspaceRoots(roots);
    projectIndex.setSettings(settings);
    await projectIndex.indexAll();
    // Check PHP runtime
    const engineStatus = phpEngineManager.resolve();
    if (engineStatus.status === 'ready' && engineStatus.command && engineStatus.args) {
        try {
            const phpactor = new phpactorClient_js_1.PhpactorClient({ command: engineStatus.command, args: engineStatus.args });
            await phpactor.start(roots);
            phpRouter = new phpRouter_js_1.PhpRouter(phpactor);
            phpDelegation = new phpDelegation_js_1.PhpDelegation(phpactor);
        }
        catch (error) {
            phpRouter = null;
            phpDelegation = null;
            if (phpEngineManager.shouldNotify()) {
                connection.sendNotification(node_js_1.ShowMessageNotification.type, {
                    type: node_js_1.MessageType.Warning,
                    message: `[Cast LSP] Phpactor could not start: ${error instanceof Error ? error.message : 'unknown error'}. Cast diagnostics remain active.`
                });
            }
        }
    }
    if (engineStatus.status !== 'ready' && phpEngineManager.shouldNotify()) {
        connection.sendNotification(node_js_1.ShowMessageNotification.type, {
            type: node_js_1.MessageType.Info,
            message: `[Cast LSP] ${engineStatus.reason ?? 'PHP runtime not detected. Template features active.'}`
        });
    }
    return {
        capabilities: {
            textDocumentSync: node_js_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                triggerCharacters: ['@', '<', '.', '$', ':', ' ', '{', '/']
            },
            hoverProvider: true,
            definitionProvider: true,
            signatureHelpProvider: { triggerCharacters: ['(', ','] },
            documentLinkProvider: {
                resolveProvider: false
            },
            documentFormattingProvider: true,
            codeActionProvider: true
        }
    };
});
// Document parsing and diagnostics update
async function validateDocument(document) {
    const uri = document.uri;
    const doc = parser.parse(uri, document.getText(), document.version);
    parsedDocs.set(uri, doc);
    const diagnostics = diagnosticsManager.getFastDiagnostics(doc, settings);
    if (phpRouter) {
        try {
            diagnostics.push(...await phpRouter.getDiagnostics(doc));
        }
        catch {
            // Phpactor failures are deliberately non-fatal: Cast validation remains live.
        }
    }
    connection.sendDiagnostics({
        uri,
        diagnostics: diagnostics.map(d => ({
            range: d.range,
            message: d.message,
            severity: d.severity,
            code: d.code,
            source: d.source || 'cast-lsp'
        }))
    });
}
documents.onDidChangeContent(change => {
    void validateDocument(change.document);
});
// cast.* settings changed in the client (propCase, componentsPath/viewsPath/resourcesPath/extension,
// diagnostics): re-resolve, re-index (componentDirs may have changed), and re-validate every open document, so
// the change takes effect without a window reload. Requires clientOptions.synchronize.configurationSection
// ('cast') on the client side (see editor/vscode/extension.js's startLanguageClient).
connection.onDidChangeConfiguration(async () => {
    const raw = await connection.workspace.getConfiguration('cast');
    settings = (0, settings_js_1.resolveSettings)(raw);
    completionProvider.setSettings(settings);
    projectIndex.setSettings(settings);
    await projectIndex.indexAll();
    for (const document of documents.all()) {
        await validateDocument(document);
    }
});
documents.onDidClose(e => {
    parsedDocs.delete(e.document.uri);
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});
// File system changes
connection.onDidChangeWatchedFiles(params => {
    for (const change of params.changes) {
        const fsPath = vscode_uri_1.URI.parse(change.uri).fsPath;
        if (change.type === node_js_1.FileChangeType.Deleted) {
            projectIndex.removeFile(fsPath);
        }
        else {
            projectIndex.indexFile(fsPath, fsPath, false);
        }
    }
});
// Completion
connection.onCompletion(async (params) => {
    const doc = parsedDocs.get(params.textDocument.uri);
    if (!doc)
        return [];
    const delegated = phpDelegation ? await phpDelegation.completion(doc, params.position) : null;
    if (delegated)
        return delegated;
    return completionProvider.getCompletions(doc, params.position);
});
// Hover
connection.onHover(async (params) => {
    const doc = parsedDocs.get(params.textDocument.uri);
    if (!doc)
        return null;
    const delegated = phpDelegation ? await phpDelegation.hover(doc, params.position) : null;
    if (delegated)
        return delegated;
    return hoverProvider.getHover(doc, params.position);
});
// Definition
connection.onDefinition(async (params) => {
    const doc = parsedDocs.get(params.textDocument.uri);
    if (!doc)
        return null;
    const delegated = phpDelegation ? await phpDelegation.definition(doc, params.position) : null;
    if (delegated)
        return delegated;
    return definitionProvider.getDefinition(doc, params.position);
});
connection.onSignatureHelp(async (params) => {
    const doc = parsedDocs.get(params.textDocument.uri);
    return doc && phpDelegation ? phpDelegation.signatureHelp(doc, params.position) : null;
});
// Document Links
connection.onDocumentLinks(params => {
    const doc = parsedDocs.get(params.textDocument.uri);
    if (!doc)
        return [];
    return documentLinksProvider.getDocumentLinks(doc);
});
// Formatting
connection.onDocumentFormatting(params => {
    const doc = parsedDocs.get(params.textDocument.uri);
    if (!doc)
        return [];
    return formattingProvider.format(doc, params.options);
});
// Code Actions
connection.onCodeAction(params => {
    const doc = parsedDocs.get(params.textDocument.uri);
    if (!doc)
        return [];
    const diagnostics = diagnosticsManager.getFastDiagnostics(doc, settings);
    return codeActionsManager.getCodeActions(doc, params, diagnostics);
});
// Listen on the document connection and stdio
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map