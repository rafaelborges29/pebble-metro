// Build-time only: keep licence copies in the phone bundle, not watch resources.
var fs = require("fs"), path = require("path");

module.exports = function (source) {
  this.cacheable();
  var root = path.dirname(this.resourcePath);
  var files = ["THIRD_PARTY_NOTICES.md"].concat(
    fs.readdirSync(path.join(root, "LICENSES")).filter(function (name) { return /\.txt$/.test(name); })
      .sort().map(function (name) { return "LICENSES/" + name; })
  );
  var notices = "LICENSE\n\n" + source;
  files.forEach(function (name) {
    var file = path.join(root, name);
    this.addDependency(file);
    notices += "\n\n" + name + "\n\n" + fs.readFileSync(file, "utf8");
  }, this);
  if (notices.indexOf("*/") !== -1) throw new Error("Licence notices contain a JavaScript comment terminator");
  return "/*!\nMetro Lisboa bundled licences\n\n" + notices + "\n*/\n";
};
