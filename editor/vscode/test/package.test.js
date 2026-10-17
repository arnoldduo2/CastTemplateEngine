"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

test("packaged language core exports analyzeCast", () => {
  const core = require("cast-language-core");
  assert.equal(typeof core.analyzeCast, "function");
});
