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
import { PhpEngineManager } from './php/engine.js';
import { CastDocument } from './parser/ast.js';

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

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
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
  await projectIndex.indexAll();

  // Check PHP runtime
  const engineStatus = phpEngineManager.resolve();
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
      documentLinkProvider: {
        resolveProvider: false
      },
      documentFormattingProvider: true,
      codeActionProvider: true
    }
  };
});

// Document parsing and diagnostics update
function validateDocument(document: TextDocument): void {
  const uri = document.uri;
  const doc = parser.parse(uri, document.getText(), document.version);
  parsedDocs.set(uri, doc);

  const diagnostics = diagnosticsManager.getFastDiagnostics(doc);
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
  validateDocument(change.document);
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
connection.onCompletion(params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return [];
  return completionProvider.getCompletions(doc, params.position);
});

// Hover
connection.onHover(params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return null;
  return hoverProvider.getHover(doc, params.position);
});

// Definition
connection.onDefinition(params => {
  const doc = parsedDocs.get(params.textDocument.uri);
  if (!doc) return null;
  return definitionProvider.getDefinition(doc, params.position);
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
  return codeActionsManager.getCodeActions(doc, params);
});

// Listen on the document connection and stdio
documents.listen(connection);
connection.listen();
