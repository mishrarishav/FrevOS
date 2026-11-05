import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { codeLocation, Readme, SourceFile } from "../src/CodePage.js";

it("escapes committed source and README instead of running repository scripts or images", () => {
  const code = renderToStaticMarkup(
    <SourceFile
      blob={{
        repositoryId: "gitrepo_" + "a".repeat(32),
        path: "app.html",
        head: "b".repeat(40),
        sha: "b".repeat(40),
        bytes: 32,
        text: '<script>alert("fixture")</script>\nline 2',
        binary: false,
        tooLarge: false,
      }}
    />,
  );
  expect(code).toContain("&lt;script&gt;");
  expect(code).not.toContain("<script>");
  expect(code).toContain('aria-label="Source file"');
  const readme = renderToStaticMarkup(
    <Readme text={'# Project\n<img src="https://example.invalid/a">\n<script>fixture</script>'} />,
  );
  expect(readme).toContain("<h3>Project</h3>");
  expect(readme).not.toContain("<img");
  expect(readme).not.toContain("<script>");
  const meta = renderToStaticMarkup(
    <SourceFile
      blob={{
        repositoryId: "gitrepo_" + "a".repeat(32),
        path: "image.bin",
        head: "b".repeat(40),
        sha: "b".repeat(40),
        bytes: 32,
        text: null,
        binary: true,
        tooLarge: false,
      }}
    />,
  );
  expect(meta).toContain("Binary file");
});
it("restores a repository/branch/path URL without treating an unknown repository reference as valid", () => {
  expect(
    codeLocation(
      "?repository=gitrepo_" + "a".repeat(32) + "&branch=feature%2Fwork&path=src%2Fapp.ts&file=1",
    ),
  ).toEqual({
    repository: "gitrepo_" + "a".repeat(32),
    branch: "feature/work",
    path: "src/app.ts",
    file: true,
  });
  expect(codeLocation("?repository=../../private").repository).toBe("");
});
