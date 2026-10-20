"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhpactorClient = void 0;
const child_process_1 = require("child_process");
const node_js_1 = require("vscode-jsonrpc/node.js");
const vscode_uri_1 = require("vscode-uri");
/** A persistent LSP client for Phpactor; Cast files are synchronized as virtual PHP documents. */
class PhpactorClient {
    command;
    process = null;
    connection = null;
    openedVersions = new Map();
    diagnostics = new Map();
    constructor(command) {
        this.command = command;
    }
    async start(workspaceFolders) {
        if (this.connection)
            return;
        this.process = (0, child_process_1.spawn)(this.command.command, this.command.args, { stdio: 'pipe', windowsHide: true });
        let stderrOutput = '';
        this.process.stderr.on('data', (chunk) => {
            stderrOutput += chunk.toString();
        });
        this.process.once('error', () => this.dispose());
        this.process.once('exit', () => this.dispose());
        const connection = (0, node_js_1.createMessageConnection)(new node_js_1.StreamMessageReader(this.process.stdout), new node_js_1.StreamMessageWriter(this.process.stdin));
        connection.onNotification('textDocument/publishDiagnostics', (params) => {
            this.diagnostics.set(params.uri, params.diagnostics ?? []);
        });
        connection.listen();
        this.connection = connection;
        const rootUri = workspaceFolders[0] ? vscode_uri_1.URI.file(workspaceFolders[0]).toString() : null;
        const folders = workspaceFolders.map((folder) => ({
            uri: vscode_uri_1.URI.file(folder).toString(),
            name: folder.split(/[\\/]/).pop() ?? folder
        }));
        try {
            await connection.sendRequest('initialize', {
                processId: process.pid,
                rootUri,
                workspaceFolders: folders,
                capabilities: { textDocument: { publishDiagnostics: { relatedInformation: true } } },
            });
            await connection.sendNotification('initialized', {});
        }
        catch (error) {
            this.dispose();
            const detail = stderrOutput.trim() ? ` (${stderrOutput.trim()})` : '';
            throw new Error(`${error instanceof Error ? error.message : 'unknown error'}${detail}`);
        }
    }
    async synchronize(virtual, version = 1) {
        const connection = this.connection;
        if (!connection)
            return [];
        const priorVersion = this.openedVersions.get(virtual.uri);
        if (priorVersion === undefined) {
            await connection.sendNotification('textDocument/didOpen', { textDocument: { uri: virtual.uri, languageId: 'php', version, text: virtual.text } });
        }
        else if (priorVersion !== version) {
            await connection.sendNotification('textDocument/didChange', { textDocument: { uri: virtual.uri, version }, contentChanges: [{ text: virtual.text }] });
        }
        this.openedVersions.set(virtual.uri, version);
        return this.diagnostics.get(virtual.uri) ?? [];
    }
    async request(method, params) {
        if (!this.connection)
            return null;
        try {
            return await this.connection.sendRequest(method, params);
        }
        catch {
            return null;
        }
    }
    async stop() {
        if (!this.connection)
            return;
        try {
            await this.connection.sendRequest('shutdown');
            await this.connection.sendNotification('exit');
        }
        finally {
            this.dispose();
        }
    }
    dispose() {
        this.connection?.dispose();
        this.connection = null;
        this.process?.kill();
        this.process = null;
        this.openedVersions.clear();
    }
}
exports.PhpactorClient = PhpactorClient;
//# sourceMappingURL=phpactorClient.js.map