function parsePreservedPaths(input) {
  if (!Array.isArray(input) || input.length > 64) throw Error("invalid-preserved-paths");
  return input.map((value) => {
    if (typeof value !== "string" || !value.length || value.length > 180)
      throw Error("invalid-preserved-path");
    const normalized = value.replaceAll("\\", "/");
    if (
      !normalized
        .split("/")
        .every(
          (p) =>
            /^[A-Za-z0-9_. -]+$/.test(p) &&
            ![".", ".."].includes(p) &&
            !/[. ]$/.test(p) &&
            !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p),
        )
    )
      throw Error("invalid-preserved-path");
    return normalized;
  });
}
function isPreserved(relative, paths) {
  const value = relative.replaceAll("\\", "/").toLowerCase();
  return (
    value
      .split("/")
      .some(
        (p) =>
          [
            "uploads",
            "database",
            "assets-data",
            "node_modules",
            ".runtime",
            "logs",
            "backups",
          ].includes(p) || p.startsWith(".env"),
      ) || paths.some((p) => value === p.toLowerCase() || value.startsWith(p.toLowerCase() + "/"))
  );
}
module.exports = { parsePreservedPaths, isPreserved };
