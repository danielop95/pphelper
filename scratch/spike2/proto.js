const protobuf = require('protobufjs');
const path = require('node:path');
exports.load = () => protobuf.load(path.join(__dirname, '../../proto/presentation.proto'));
exports.decode = (type, bytes) => {
  const reader = protobuf.Reader.create(bytes);
  reader.discardUnknown = false;
  return type.decode(reader);
};
