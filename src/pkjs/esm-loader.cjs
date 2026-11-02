// Build-time adapter for SDK 4.33.1's webpack 1 (which does not lower ESM).
// Only the named imports, function/var exports and named export lists used by
// our phone modules are accepted. Third-party code is untouched.
module.exports = function (source) {
  this.cacheable();
  var names = [], index = 0;
  source = source.replace(/^export (function|var) (\w+)/gm, function (_, kind, name) {
    names.push(name);
    return kind + " " + name;
  });
  source = source.replace(/^export \{ ([\w, ]+) \};$/gm, function (_, bindings) {
    names = names.concat(bindings.split(",").map(function (name) { return name.trim(); }));
    return "";
  });
  source = source.replace(/^import \{ ([\w, ]+) \} from "([^"]+)";$/gm, function (_, bindings, request) {
    var local = "__metroImport" + index++;
    return "var " + local + " = require(" + JSON.stringify(__filename + "!" + request) + ");\n" +
      bindings.split(",").map(function (binding) {
        var name = binding.trim();
        return "var " + name + " = " + local + "." + name + ";";
      }).join("\n");
  });
  if (/^\s*(import|export)\s/m.test(source)) throw new Error("Unsupported Metro module syntax");
  return source + "\n" + names.map(function (name) { return "exports." + name + " = " + name + ";"; }).join("\n");
};
