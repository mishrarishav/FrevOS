// biome-ignore-all lint/complexity/useLiteralKeys: XML nodes are intentionally unknown index-signature objects.
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { unzipSync } from "fflate";

export type ReviewWorkbookCell = {
  column: string;
  address: string;
  text: string;
  hyperlink?: string;
  formula?: boolean;
};
export type ReviewWorkbook = {
  sourceHash: string;
  fileName: string;
  sheets: {
    name: string;
    hidden: boolean;
    maxRow: number;
    maxColumn: number;
    hiddenRows: number[];
    hiddenColumns: string[];
    rows: { row: number; cells: ReviewWorkbookCell[] }[];
  }[];
};
export class ReviewWorkbookError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
const fail = (code: string): never => {
  throw new ReviewWorkbookError(code);
};
const MAX_COMPRESSED = 5 * 1024 * 1024;
const MAX_EXPANDED = 40 * 1024 * 1024;
const MAX_XML = 12 * 1024 * 1024;
const MAX_ROWS = 2000;
const MAX_COLUMNS = 40;
type Xml = Record<string, unknown>;
const object = (value: unknown): Xml =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Xml) : {};
const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const scalar = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return scalarText(object(value)["#text"]);
};
const scalarText = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
function plainText(value: unknown): string {
  const node = object(value);
  if ("t" in node) return scalar(node["t"]);
  if ("r" in node) return list(node["r"]).map(plainText).join("");
  return scalar(value);
}
function columnNumber(column: string): number {
  let result = 0;
  for (const ch of column) result = result * 26 + ch.charCodeAt(0) - 64;
  return result;
}
function columnName(number: number): string {
  let value = number;
  let result = "";
  while (value > 0) {
    value--;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}
function safeText(value: string, length = 4096): string {
  if (
    value.length > length ||
    [...value].some((char) => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))
  )
    return fail("workbook-cell-limit");
  return value;
}
function internalPart(base: string, target: string): string {
  if (
    !target ||
    target.includes("\\") ||
    target.includes(String.fromCharCode(0)) ||
    /^(?:[a-z]+:|\/\/)/i.test(target)
  )
    return fail("workbook-relationship-denied");
  const part = posix.normalize(
    target.startsWith("/") ? target.slice(1) : posix.join(posix.dirname(base), target),
  );
  if (!part.startsWith("xl/") || part.includes("../")) return fail("workbook-relationship-denied");
  return part;
}

function readWorkbook(input: { fileName: string; contentBase64: string }): ReviewWorkbook {
  if (
    !/\.xlsx$/i.test(input.fileName) ||
    input.fileName.length > 180 ||
    /[\\/]/u.test(input.fileName) ||
    [...input.fileName].some((char) => char.charCodeAt(0) < 32) ||
    !input.contentBase64 ||
    input.contentBase64.length > Math.ceil(MAX_COMPRESSED / 3) * 4 ||
    input.contentBase64.length % 4 !== 0
  )
    return fail("workbook-invalid-upload");
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (
    bytes.length < 4 ||
    bytes.length > MAX_COMPRESSED ||
    bytes.toString("base64") !== input.contentBase64 ||
    bytes.readUInt32LE(0) !== 0x04034b50
  )
    return fail("workbook-invalid-upload");
  let entries: ReturnType<typeof unzipSync>;
  const seen = new Set<string>();
  let expanded = 0;
  try {
    entries = unzipSync(bytes, {
      filter(entry) {
        if (
          seen.has(entry.name) ||
          seen.size >= 256 ||
          entry.name.startsWith("/") ||
          entry.name.includes("\\") ||
          entry.name.split("/").includes("..") ||
          /(?:vbaProject|externalLinks|macrosheets)/i.test(entry.name)
        )
          return fail("workbook-archive-denied");
        seen.add(entry.name);
        expanded += entry.originalSize;
        if (!Number.isSafeInteger(expanded) || expanded > MAX_EXPANDED)
          return fail("workbook-expanded-limit");
        if (entry.name.endsWith(".xml") || entry.name.endsWith(".rels")) {
          if (entry.originalSize > MAX_XML) return fail("workbook-xml-limit");
          return true;
        }
        return false;
      },
    });
  } catch (error) {
    if (error instanceof ReviewWorkbookError) throw error;
    return fail("workbook-invalid-archive");
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    // XML declarations/entities are rejected before parsing. Decode only the
    // XML built-ins/numeric references so names and ordinary ampersands survive.
    processEntities: true,
  });
  function xml(part: string, optional = false): Xml {
    const data = entries[part];
    if (!data) return optional ? {} : fail("workbook-missing-part");
    const source = new TextDecoder("utf-8", { fatal: true }).decode(data);
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(source)) return fail("workbook-xml-entity-denied");
    let cursor = 0;
    let depth = 0;
    let tags = 0;
    while (cursor < source.length) {
      const open = source.indexOf("<", cursor);
      if (open < 0) break;
      const special = source.startsWith("<![CDATA[", open)
        ? "]]>"
        : source.startsWith("<!--", open)
          ? "-->"
          : null;
      if (special) {
        const ending = source.indexOf(special, open + 4);
        if (ending < 0) return fail("workbook-invalid-xml");
        cursor = ending + special.length;
        continue;
      }
      const close = source.indexOf(">", open + 1);
      if (close < 0) return fail("workbook-invalid-xml");
      if (++tags > 240000) return fail("workbook-xml-limit");
      if (source[open + 1] === "/") depth--;
      else if (!["?", "!"].includes(source[open + 1] ?? "") && source[close - 1] !== "/") depth++;
      if (depth > 64 || depth < 0) return fail("workbook-xml-limit");
      cursor = close + 1;
    }
    if (XMLValidator.validate(source) !== true) return fail("workbook-invalid-xml");
    return object(parser.parse(source));
  }
  const contentTypes = xml("[Content_Types].xml");
  if (/macroEnabled|vbaProject/i.test(JSON.stringify(contentTypes)))
    return fail("workbook-macros-denied");
  const wb = object(xml("xl/workbook.xml")["workbook"]);
  const relations = list(
    object(xml("xl/_rels/workbook.xml.rels")["Relationships"])["Relationship"],
  );
  const targets = new Map<string, string>();
  for (const value of relations) {
    const relation = object(value);
    const type = scalar(relation["@Type"]);
    if (/externalLink/i.test(type)) return fail("workbook-external-links-denied");
    if (type.endsWith("/worksheet")) {
      if (relation["@TargetMode"] === "External") return fail("workbook-relationship-denied");
      targets.set(
        scalar(relation["@Id"]),
        internalPart("xl/workbook.xml", scalar(relation["@Target"])),
      );
    }
  }
  const sharedNodes = list(object(xml("xl/sharedStrings.xml", true)["sst"])["si"]);
  if (sharedNodes.length > MAX_ROWS * MAX_COLUMNS) return fail("workbook-shared-strings-limit");
  const shared = sharedNodes.map((node) => safeText(plainText(node)));
  const sheets = list(object(wb["sheets"])["sheet"]);
  if (!sheets.length || sheets.length > 10) return fail("workbook-sheet-limit");
  const names = new Set<string>();
  const output: ReviewWorkbook["sheets"] = [];
  let totalCells = 0;
  let totalRows = 0;
  for (const value of sheets) {
    const sheet = object(value);
    const name = safeText(scalar(sheet["@name"]), 120);
    if (!name || names.has(name)) return fail("workbook-duplicate-sheet");
    names.add(name);
    const part = targets.get(scalar(sheet["@id"]));
    if (!part) return fail("workbook-missing-sheet");
    const root = object(xml(part)["worksheet"]);
    const relationshipsPart = posix.join(
      posix.dirname(part),
      "_rels",
      posix.basename(part) + ".rels",
    );
    const relationships = list(
      object(xml(relationshipsPart, true)["Relationships"])["Relationship"],
    );
    const hyperlinks = new Map<string, string>();
    for (const relValue of relationships) {
      const rel = object(relValue);
      if (scalar(rel["@Type"]).endsWith("/hyperlink")) {
        const target = scalar(rel["@Target"]);
        // Preserve inert external links for mapping; never dereference file/mail/document targets.
        if (/^https?:\/\//i.test(target))
          hyperlinks.set(scalar(rel["@Id"]), safeText(target, 2048));
      }
    }
    const byAddress = new Map<string, string>();
    for (const linkValue of list(object(root["hyperlinks"])["hyperlink"])) {
      const link = object(linkValue);
      const target = hyperlinks.get(scalar(link["@id"]));
      const address = scalar(link["@ref"]);
      if (target && /^[A-Z]{1,2}[1-9]\d{0,3}$/.test(address)) byAddress.set(address, target);
    }
    const hiddenRows: number[] = [];
    const hiddenColumns: string[] = [];
    for (const colValue of list(object(root["cols"])["col"])) {
      const col = object(colValue);
      if (col["@hidden"] === "1" || col["@hidden"] === "true") {
        const min = Number(col["@min"]);
        const max = Number(col["@max"]);
        if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 16384 || max < min)
          return fail("workbook-invalid-column");
        for (let c = min; c <= Math.min(max, MAX_COLUMNS); c++) hiddenColumns.push(columnName(c));
      }
    }
    const rows: ReviewWorkbook["sheets"][number]["rows"] = [];
    let maxRow = 0;
    let maxColumn = 0;
    const seenRows = new Set<number>();
    for (const rowValue of list(object(root["sheetData"])["row"])) {
      const row = object(rowValue);
      const rowNumber = Number(row["@r"]);
      if (
        !Number.isInteger(rowNumber) ||
        rowNumber < 1 ||
        rowNumber > MAX_ROWS ||
        seenRows.has(rowNumber)
      )
        return fail("workbook-row-limit");
      seenRows.add(rowNumber);
      totalRows++;
      if (totalRows > MAX_ROWS) return fail("workbook-row-limit");
      if (row["@hidden"] === "1" || row["@hidden"] === "true") hiddenRows.push(rowNumber);
      const cells: ReviewWorkbookCell[] = [];
      const addresses = new Set<string>();
      for (const cellValue of list(row["c"])) {
        const cell = object(cellValue);
        const address = scalar(cell["@r"]);
        const match = /^([A-Z]{1,2})([1-9]\d{0,3})$/.exec(address);
        if (!match || Number(match[2]) !== rowNumber || addresses.has(address))
          return fail("workbook-invalid-cell");
        const column = match[1] ?? fail("workbook-invalid-cell");
        const colNumber = columnNumber(column);
        if (colNumber > MAX_COLUMNS || ++totalCells > MAX_ROWS * MAX_COLUMNS)
          return fail("workbook-cell-limit");
        addresses.add(address);
        maxColumn = Math.max(maxColumn, colNumber);
        const type = scalar(cell["@t"]);
        let content = scalar(cell["v"]);
        if (type === "s") {
          const index = Number(content);
          if (!Number.isInteger(index) || index < 0 || shared[index] === undefined)
            return fail("workbook-invalid-shared-string");
          content = shared[index] ?? fail("workbook-invalid-shared-string");
        } else if (type === "inlineStr") content = plainText(cell["is"]);
        else if (type === "b") content = content === "1" ? "TRUE" : "FALSE";
        const hyperlink = byAddress.get(address);
        cells.push({
          column,
          address,
          text: safeText(content),
          ...(hyperlink ? { hyperlink } : {}),
          ...("f" in cell ? { formula: true } : {}),
        });
      }
      maxRow = Math.max(maxRow, rowNumber);
      rows.push({ row: rowNumber, cells });
    }
    output.push({
      name,
      hidden: sheet["@state"] === "hidden" || sheet["@state"] === "veryHidden",
      maxRow,
      maxColumn,
      hiddenRows,
      hiddenColumns: [...new Set(hiddenColumns)],
      rows,
    });
  }
  return {
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    fileName: input.fileName,
    sheets: output,
  };
}

/** Reads values only. Formulae, workbook links and document instructions are never executed. */
export function parseReviewWorkbook(input: {
  fileName: string;
  contentBase64: string;
}): ReviewWorkbook {
  try {
    return readWorkbook(input);
  } catch (error) {
    if (error instanceof ReviewWorkbookError) throw error;
    throw new ReviewWorkbookError("workbook-invalid-upload");
  }
}
