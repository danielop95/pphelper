const assert = require('node:assert/strict');
const path = require('node:path');
const protobuf = require('protobufjs');

const root = protobuf.loadSync(path.join(__dirname, '../proto/presentation.proto'));
root.resolveAll();
const presentation = root.lookupType('rv.data.Presentation');
assert.equal(presentation.fullName, '.rv.data.Presentation');
console.log(presentation.fullName.slice(1));
