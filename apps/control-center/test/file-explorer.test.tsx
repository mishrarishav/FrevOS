import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { explorerLocation, FileExplorerEntries, folderEntryType } from "../src/FolderBrowser.js";

it("navigates typed locations only inside listed roots with platform case rules and no traversal or network shares", () => {
  expect(explorerLocation("c:\\Project\\src", ["C:\\", "C:\\Project"])).toEqual({
    root: "C:\\Project",
    path: "src",
  });
  expect(explorerLocation("C:\\", ["C:\\"])).toEqual({ root: "C:\\", path: "" });
  expect(explorerLocation("/home/alice/code", ["/home/alice"])).toEqual({
    root: "/home/alice",
    path: "code",
  });
  expect(explorerLocation("/", ["/"])).toEqual({ root: "/", path: "" });
  for (const value of [
    "D:\\unknown",
    "C:\\Project\\..\\other",
    "C:\\Project2",
    "C:Project",
    "\\\\server\\share",
    "/home/Alice/code",
    "/home/alice/../bob",
    "C:\\Project\\name:stream",
  ])
    expect(explorerLocation(value, ["C:\\Project", "/home/alice"])).toBeNull();
});

it("shows directories, ZIP archives and file metadata while keeping protected entries disabled", () => {
  const entries = [
    { name: "Project", path: "Project", excluded: false, kind: "directory" as const },
    {
      name: "release.zip",
      path: "release.zip",
      excluded: false,
      kind: "file" as const,
      size: 2048,
      modifiedAt: "2026-11-04T03:00:00Z",
    },
    { name: ".env", path: ".env", excluded: true, kind: "file" as const, size: 0 },
  ];
  const html = renderToStaticMarkup(
    <FileExplorerEntries
      entries={entries}
      selected="release.zip"
      busy={false}
      onOpen={() => {}}
      onSelect={() => {}}
    />,
  );
  expect(html).toContain("ZIP archive");
  expect(html).toContain("release.zip");
  expect(html).toContain("Date modified");
  expect(html).toContain("2 KB");
  expect(html).toContain('class="is-selected"');
  expect(html).toContain('disabled="" title="Protected entry"');
  expect(folderEntryType(entries[0]!)).toBe("Folder");
  expect(folderEntryType({ name: "old", path: "old", excluded: false })).toBe("Folder");
});
