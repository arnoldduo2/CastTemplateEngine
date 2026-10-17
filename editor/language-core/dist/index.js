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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePropsBlock = exports.splitUnion = exports.newProp = exports.finish = exports.readType = exports.spell = exports.camel = exports.parseComponent = exports.indentString = exports.indentPrefix = exports.indentFor = exports.formatCast = exports.computeIndents = exports.buildEmbeddedVirtuals = exports.buildPhpVirtual = exports.SourceMap = exports.firstMarkupOffset = exports.analyzeCast = void 0;
__exportStar(require("./types.js"), exports);
var regions_js_1 = require("./regions.js");
Object.defineProperty(exports, "analyzeCast", { enumerable: true, get: function () { return regions_js_1.analyzeCast; } });
Object.defineProperty(exports, "firstMarkupOffset", { enumerable: true, get: function () { return regions_js_1.firstMarkupOffset; } });
var sourceMap_js_1 = require("./sourceMap.js");
Object.defineProperty(exports, "SourceMap", { enumerable: true, get: function () { return sourceMap_js_1.SourceMap; } });
var virtualPhp_js_1 = require("./virtualPhp.js");
Object.defineProperty(exports, "buildPhpVirtual", { enumerable: true, get: function () { return virtualPhp_js_1.buildPhpVirtual; } });
var virtualEmbedded_js_1 = require("./virtualEmbedded.js");
Object.defineProperty(exports, "buildEmbeddedVirtuals", { enumerable: true, get: function () { return virtualEmbedded_js_1.buildEmbeddedVirtuals; } });
var indent_js_1 = require("./indent.js");
Object.defineProperty(exports, "computeIndents", { enumerable: true, get: function () { return indent_js_1.computeIndents; } });
Object.defineProperty(exports, "formatCast", { enumerable: true, get: function () { return indent_js_1.formatCast; } });
Object.defineProperty(exports, "indentFor", { enumerable: true, get: function () { return indent_js_1.indentFor; } });
Object.defineProperty(exports, "indentPrefix", { enumerable: true, get: function () { return indent_js_1.indentPrefix; } });
Object.defineProperty(exports, "indentString", { enumerable: true, get: function () { return indent_js_1.indentString; } });
var docblock_js_1 = require("./componentSpec/docblock.js");
Object.defineProperty(exports, "parseComponent", { enumerable: true, get: function () { return docblock_js_1.parseComponent; } });
var propHelpers_js_1 = require("./componentSpec/propHelpers.js");
Object.defineProperty(exports, "camel", { enumerable: true, get: function () { return propHelpers_js_1.camel; } });
Object.defineProperty(exports, "spell", { enumerable: true, get: function () { return propHelpers_js_1.spell; } });
Object.defineProperty(exports, "readType", { enumerable: true, get: function () { return propHelpers_js_1.readType; } });
Object.defineProperty(exports, "finish", { enumerable: true, get: function () { return propHelpers_js_1.finish; } });
Object.defineProperty(exports, "newProp", { enumerable: true, get: function () { return propHelpers_js_1.newProp; } });
Object.defineProperty(exports, "splitUnion", { enumerable: true, get: function () { return propHelpers_js_1.splitUnion; } });
var propsBlock_js_1 = require("./componentSpec/propsBlock.js");
Object.defineProperty(exports, "parsePropsBlock", { enumerable: true, get: function () { return propsBlock_js_1.parsePropsBlock; } });
//# sourceMappingURL=index.js.map