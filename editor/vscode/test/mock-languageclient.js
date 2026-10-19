"use strict";
// A controllable stand-in for "vscode-languageclient/node": just enough for extension.js's startLanguageClient to
// construct a client, start it, and react to state changes - the real package can't construct against
// mock-vscode.js's lightweight surface (see extension.test.js's "no LSP client could start" test), so every
// existing test takes the "no client" branch. This mock exists so Task 9's precedence-switch tests can exercise
// the "client started and reported Running/Stopped" branch too.

const State = { Stopped: 1, Starting: 2, Running: 3 };

/** One fake client module per test project, so `fire` only ever affects that project's own client. */
function create() {
  const listeners = [];

  class LanguageClient {
    constructor(id, name, serverOptions, clientOptions) {
      this.id = id;
      this.name = name;
      this.serverOptions = serverOptions;
      this.clientOptions = clientOptions;
    }
    start() {
      return Promise.resolve();
    }
    stop() {
      return Promise.resolve();
    }
    onDidChangeState(listener) {
      listeners.push(listener);
      return { dispose() {} };
    }
  }

  /** Test-only: simulates the client reporting a new state, e.g. fire('Running') after a successful handshake. */
  function fire(stateName) {
    const newState = State[stateName];
    listeners.slice().forEach((l) => l({ oldState: State.Starting, newState }));
  }

  return { LanguageClient, State, fire };
}

module.exports = { create, State };
