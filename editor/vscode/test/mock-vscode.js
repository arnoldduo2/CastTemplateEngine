"use strict";
// Just enough of the VS Code API for extension.js: the providers are captured so the tests can call them.
const path = require("node:path");

class Position {
  constructor(line, character) {
    this.line = line;
    this.character = character;
  }
}
class Range {
  constructor(start, end) {
    this.start = start;
    this.end = end;
  }
  contains(p) {
    const after = (a, b) => a.line > b.line || (a.line === b.line && a.character >= b.character);
    return after(p, this.start) && after(this.end, p);
  }
}
class Uri {
  constructor(fsPath) {
    this.fsPath = fsPath;
  }
  static file(p) {
    return new Uri(p);
  }
}
class Location {
  constructor(uri, position) {
    this.uri = uri;
    this.position = position;
  }
}
class DocumentLink {
  constructor(range, target) {
    this.range = range;
    this.target = target;
  }
}
class MarkdownString {
  constructor() {
    this.value = "";
  }
  appendMarkdown(s) {
    this.value += s;
    return this;
  }
}
class Hover {
  constructor(contents, range) {
    this.contents = contents;
    this.range = range;
  }
}

class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
}
class SnippetString {
  constructor(value) {
    this.value = value;
  }
}
class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}
class CodeAction {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
  }
}
class TextEdit {
  constructor(range, newText) {
    this.range = range;
    this.newText = newText;
  }
  static replace(range, newText) {
    return new TextEdit(range, newText);
  }
}
class WorkspaceEdit {
  constructor() {
    this.edits = [];
  }
  insert(uri, position, text) {
    this.edits.push({ type: "insert", position, text });
  }
  replace(uri, range, text) {
    this.edits.push({ type: "replace", range, text });
  }
}

function create({ root, settings = {} }) {
  const providers = {};
  const collections = {};
  const handlers = {};
  const applied = [];
  const api = {
    Position,
    Range,
    Uri,
    Location,
    DocumentLink,
    MarkdownString,
    Hover,
    providers,
    collections,
    handlers,
    applied,
    commands: { registerCommand: (id, fn) => ((handlers[id] = fn), { dispose() {} }) },
    CompletionItem,
    CompletionItemKind: { Class: 6, Property: 9, EnumMember: 19, Field: 4 },
    SnippetString,
    Diagnostic,
    CodeAction,
    CodeActionKind: { QuickFix: "quickfix" },
    WorkspaceEdit,
    TextEdit,
    languages: {
      registerDocumentLinkProvider: (selector, p) => ((providers.links = p), { dispose() {} }),
      // several providers of a kind may register: tests look at them by role
      registerDefinitionProvider: (selector, p) => ((providers[p.constructor.name === "PropDefinitions" ? "propDefinition" : "definition"] = p), { dispose() {} }),
      registerHoverProvider: (selector, p) => ((providers[p.constructor.name === "ComponentHovers" ? "componentHover" : "hover"] = p), { dispose() {} }),
      registerCompletionItemProvider: (selector, p) => ((providers.completion = p), { dispose() {} }),
      registerDocumentFormattingEditProvider: (selector, p) => ((providers.formatting = p), { dispose() {} }),
      registerDocumentRangeFormattingEditProvider: (selector, p) => ((providers.rangeFormatting = p), { dispose() {} }),
      registerCodeActionsProvider: (selector, p) => ((providers.codeActions = p), { dispose() {} }),
      createDiagnosticCollection: (name) => {
        const store = new Map();
        collections[name] = store;
        return { set: (uri, list) => store.set(uri.fsPath, list), delete: (uri) => store.delete(uri.fsPath), dispose() {} };
      },
    },
    workspace: {
      onDidChangeTextDocument: (fn) => ((handlers.change = fn), { dispose() {} }),
      applyEdit: async (edit) => (applied.push(edit), true),
      getWorkspaceFolder: () => (root ? { uri: Uri.file(root) } : undefined),
      getConfiguration: () => ({ get: (key, fallback) => (key in settings ? settings[key] : fallback) }),
    },
  };
  return api;
}

/** A TextDocument for `text` at `file`. */
function document(file, text) {
  const lines = text.split("\n");
  const starts = [];
  let offset = 0;
  for (const l of lines) {
    starts.push(offset);
    offset += l.length + 1;
  }
  const positionAt = (o) => {
    let line = 0;
    while (line + 1 < starts.length && starts[line + 1] <= o) line++;
    return new Position(line, o - starts[line]);
  };
  return { uri: Uri.file(file), getText: () => text, positionAt, offsetAt: (p) => starts[p.line] + p.character };
}

module.exports = { create, document, Position, Range, path };
