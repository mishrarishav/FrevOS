import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseReviewWorkbook } from "../src/review-workbook.js";

function fixture(overrides: Record<string, string> = {}) {
  const parts = {
    "[Content_Types].xml":
      '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    "xl/workbook.xml":
      '<workbook xmlns:r="urn:relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      "<sst><si><t>Name</t></si><si><r><t>Ops &amp; </t></r><r><t>Support</t></r></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet xmlns:r="urn:relationships"><cols><col min="2" max="2" hidden="1"/></cols><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>URL</t></is></c></row><row r="2" hidden="1"><c r="A2" t="s"><v>1</v></c><c r="B2" t="inlineStr"><is><t>Displayed link</t></is></c><c r="C2" t="str"><f>HYPERLINK("https://never-follow.invalid/")</f><v>Cached only</v></c></row></sheetData><hyperlinks><hyperlink ref="B2" r:id="link1"/></hyperlinks></worksheet>',
    "xl/worksheets/_rels/sheet1.xml.rels":
      '<Relationships><Relationship Id="link1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://review.invalid/app" TargetMode="External"/></Relationships>',
    ...overrides,
  };
  return {
    fileName: "inventory.xlsx",
    contentBase64: Buffer.from(
      zipSync(
        Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, strToU8(value)])),
      ),
    ).toString("base64"),
  };
}

describe("read-only review workbook extraction", () => {
  it("keeps source cells, hidden fields, rich strings, cached values and actual hyperlinks without evaluating formulae", () => {
    const input = fixture();
    const result = parseReviewWorkbook(input);
    expect(result.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toEqual(parseReviewWorkbook(input));
    expect(result.sheets[0]).toMatchObject({
      name: "Applications",
      hiddenRows: [2],
      hiddenColumns: ["B"],
      maxRow: 2,
      maxColumn: 3,
    });
    expect(result.sheets[0]?.rows[1]?.cells).toEqual([
      { address: "A2", column: "A", text: "Ops & Support" },
      {
        address: "B2",
        column: "B",
        text: "Displayed link",
        hyperlink: "https://review.invalid/app",
      },
      { address: "C2", column: "C", text: "Cached only", formula: true },
    ]);
  });

  it("rejects malformed upload, path escape, macros, external workbook parts and XML entity instructions", () => {
    for (const input of [
      { fileName: "inventory.xlsx", contentBase64: "AA==" },
      { ...fixture(), fileName: "../inventory.xlsx" },
      fixture({ "../escape.xml": "<x/>" }),
      fixture({ "xl/vbaProject.bin": "secret" }),
      fixture({ "xl/externalLinks/externalLink1.xml": "<externalLink/>" }),
      fixture({
        "xl/sharedStrings.xml":
          '<!DOCTYPE x [<!ENTITY payload SYSTEM "file:///private">]><sst><si><t>&payload;</t></si></sst>',
      }),
      fixture({
        "[Content_Types].xml":
          '<Types><Override ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>',
      }),
    ])
      expect(() => parseReviewWorkbook(input)).toThrow();
  });

  it("denies external or traversing sheet relationships instead of reading local/network targets", () => {
    for (const target of [
      "../../../secret.xml",
      "https://private.invalid/sheet.xml",
      "file:///private.xml",
    ]) {
      expect(() =>
        parseReviewWorkbook(
          fixture({
            "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${target}"/></Relationships>`,
          }),
        ),
      ).toThrow();
    }
  });

  it("bounds sheet rows, columns, individual cell text and decompressed XML before import", () => {
    for (const value of [
      '<worksheet><sheetData><row r="2001"><c r="A2001"><v>1</v></c></row></sheetData></worksheet>',
      '<worksheet><sheetData><row r="1"><c r="AO1"><v>1</v></c></row></sheetData></worksheet>',
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${"x".repeat(4097)}</t></is></c></row></sheetData></worksheet>`,
      `<worksheet>${" ".repeat(12 * 1024 * 1024)}</worksheet>`,
      `<worksheet>${"<nested>".repeat(65)}${"</nested>".repeat(65)}</worksheet>`,
    ])
      expect(() => parseReviewWorkbook(fixture({ "xl/worksheets/sheet1.xml": value }))).toThrow();
  });

  it("rejects duplicate cell and row identities, preserving unambiguous provenance", () => {
    for (const value of [
      '<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="A1"><v>2</v></c></row></sheetData></worksheet>',
      '<worksheet><sheetData><row r="1"/><row r="1"/></sheetData></worksheet>',
    ])
      expect(() => parseReviewWorkbook(fixture({ "xl/worksheets/sheet1.xml": value }))).toThrow();
  });
});
