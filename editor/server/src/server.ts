#!/usr/bin/env node
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  FileChangeType,
  ShowMessageNotification,
  MessageType
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

import { CastParser } from './parser/castParser.js';
import { ProjectIndex } from './index/projectIndex.js';
import { DiagnosticsManager } from './diagnostics/diagnostics.js';
import { CodeActionsManager } from './codeActions/codeActions.js';
import { CompletionProvider } from './features/completion.js';
import { HoverProvider } from './features/hover.js';
import { DefinitionProvider } from './features/definition.js';
import { DocumentLinksProvider } from './features/documentLinks.js';
import { FormattingProvider } from './features/formatting.js';
import { PhpDelegation } from './features/phpDelegation.js';
import { PhpEngineManager } from './php/engine.js';
import { PhpactorClient } from './php/phpactorClient.js';
import { PhpRouter } from './php/phpRouter.js';
import { CastDocument } from './parser/ast.js';
import { CastSettings, DEFAULT_SETTINGS, resolveSettings } from './settings.js';

// Create connection
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// Internal state
const parsedDocs: Map<string, CastDocument> = new Map();
const parser = new CastParser();
const projectIndex = new ProjectIndex();
const diagnosticsManager = new DiagnosticsManager(projectIndex);
const codeActionsManager = new CodeActionsManager();
const completionProvider = new CompletionProvider(projectIndex);
const hoverProvider = new HoverProvider(projectIndex);
const definitionProvider = new DefinitionProvider(projectIndex);
const documentLinksProvider = new DocumentLinksProvider(projectIndex);
const formattingProvider = new FormattingProvider();
const phpEngineManager = new PhpEngineManager();
let phpRouter: PhpRouter | null = null;
let phpDelegation: PhpDelegation | null = null;
let settings: CastSettings = DEFAULT_SETTINGS;

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  settings = resolveSettings(params.initializationOptions as Partial<CastSettings> | undefined);
  completionProvider.setSettings(settings);

  // Collect workspace roots
  const roots: string[] = [];
  if (params.workspaceFolders) {
    for (const wf of params.workspaceFolders) {
      roots.push(URI.parse(wf.uri).fsPath);
    }
  } else if (params.rootUri) {
    roots.push(URI.parse(params.rootUri).fsPath);
  }

  projectIndex.setWorkspaceRoots(roots);
  projectIndex.setSettings(settings);
  await projectIndex.indexAll();

  // Check PHP runtime
  const engineStatus = phpEngineManager.resolve();
  if (engineStatus.status === 'ready' && engineStatus.command && engineStatus.args) {
    try {
      const phpactor = new PhpactorClient({ command: engineStatus.command, args: engineStatus.args });
      await phpactor.start(roots);
      phpRouter = new PhpRouter(phpactor);
      phpDelegation = new PhpDelegation(phpactor);
    } catch (error) {
      phpRouter = null;
      phpDelegation = null;
      if (phpEngineManager.shouldNotify()) {
        connection.sendNotification(ShowMessageNotification.type, {
          type: MessageType.Warning,
          message: `[Cast LSP] Phpactor could not start: ${error instanceof Error ? error.message : 'unknown error'}. Cast diagnostics remain active.`
        });
      }
    }
  }
  if (engineStatus.status !== 'ready' && phpEngineManager.shouldNotify()) {
    connection.sendNotification(ShowMessageNotification.type, {
      type: MessageType.Info,
      message: `[Cast LSP] ${engineStatus.reason ?? 'PHP runtime not detected. Template features active.'}`
    });
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
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
async function validateDocument(document: TextDocument): Promise<void> {
  const uri = document.uri;
  const doc = parser.parse(uri, document.getText(), document.version);
  parsedDocs.set(uri, doc);

  const diagnostics = diagnosticsManager.getFastDiagnostics(doc, settings);
  if (phpRouter) {
    try {
      diagnostics.push(...await phpRouter.getDiagnostics(doc));
    } catch {
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
  settings = resolveSettings(raw as Partial<CastSettings> | undefined);
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
    const fsPath = URI.parse(change.uri).fsPath;
    if (change.type === FileChangeType.Deleted) {
      projectIndex.removeFile(fsPath);
    } else {
      projectIndex.indexFile(fsPath, fsPath, false);
    }
  }
});

// Completion
connection.onCompletion(async params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return [];
  const delegated = phpDelegation ? await phpDelegation.completion(doc, params.position) : null;
  if (delegated) return delegated;
  return completionProvider.getCompletions(doc, params.position);
});

// Hover
connection.onHover(async params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return null;
  const delegated = phpDelegation ? await phpDelegation.hover(doc, params.position) : null;
  if (delegated) return delegated;
  return hoverProvider.getHover(doc, params.position);
});

// Definition
connection.onDefinition(async params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return null;
  const delegated = phpDelegation ? await phpDelegation.definition(doc, params.position) : null;
  if (delegated) return delegated;
  return definitionProvider.getDefinition(doc, params.position);
});

connection.onSignatureHelp(async params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  return doc && phpDelegation ? phpDelegation.signatureHelp(doc, params.position) : null;
});

// Document Links
connection.onDocumentLinks(params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return [];
  return documentLinksProvider.getDocumentLinks(doc);
});

// Formatting
connection.onDocumentFormatting(params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return [];
  return formattingProvider.format(doc, params.options);
});

// Code Actions
connection.onCodeAction(params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return [];
  const diagnostics = diagnosticsManager.getFastDiagnostics(doc, settings);
  return codeActionsManager.getCodeActions(doc, params, diagnostics);
});

// Listen on the document connection and stdio
documents.listen(connection);
connection.listen();
