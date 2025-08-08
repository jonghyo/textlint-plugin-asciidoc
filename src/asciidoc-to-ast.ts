// LICENSE : MIT
"use strict";
import {
  ASTNodeTypes,
  AnyTxtNode,
  TxtNodeLocation,
  TxtNodeRange,
  TxtNodePosition,
} from "@textlint/ast-node-types";
import asciidoctor, { Asciidoctor } from "@asciidoctor/core";
import { convert } from "html-to-text";

const doctor = asciidoctor();

export function parse(text: string): AnyTxtNode {
  return new Converter(text).convert();
}

interface LineCursor {
  min: number;
  max: number;
  startIdx?: number;
}

export class Converter {
  text: string;
  lines: string[];
  chars: number[];

  constructor(text: string) {
    this.text = text;
    this.lines = text.split(/\n/);
    this.chars = [0];
    for (const line of this.lines) {
      this.chars.push(this.chars.at(-1)! + line.length + 1);
    }
  }

  convert(): AnyTxtNode {
    const doc = doctor.load(this.text, { sourcemap: true });
    const elements = this.convertElement(doc, {
      min: 1,
      max: this.lines.length,
    });
    if (elements.length === 0) {
      return this.createEmptyDocument();
    }
    return elements[0]!;
  }

  convertElement(
    elem: Asciidoctor.AbstractBlock,
    cursor: LineCursor
  ): AnyTxtNode[] {
    const context = elem.getContext();
    if (context === "document") {
      return this.convertDocument(elem as Asciidoctor.Document, cursor);
    } else if (
      context === "paragraph" ||
      context === "admonition" ||
      context === "example" ||
      context === "literal"
    ) {
      return this.convertParagraph(elem as Asciidoctor.Block, cursor);
    } else if (
      context === "ulist" ||
      context === "olist" ||
      context === "colist"
    ) {
      return this.convertList(elem as Asciidoctor.List, cursor);
    } else if (context === "list_item") {
      return this.convertListItem(elem as Asciidoctor.ListItem, cursor);
    } else if (context === "dlist") {
      return this.convertDescriptionList(elem, cursor);
    } else if (context === "quote" || context === "verse") {
      return this.convertQuote(elem as Asciidoctor.Block, cursor);
    } else if (context === "section" || context === "floating_title") {
      return this.convertSection(elem as Asciidoctor.Section, cursor);
    } else if (context === "table") {
      return this.convertTable(elem as Asciidoctor.Table, cursor);
    } else if (context === "listing" || context === "stem") {
      return this.convertListing(elem as Asciidoctor.Block, cursor);
    } else if (
      context === "open" ||
      context === "pass" ||
      context === "sidebar"
    ) {
      return this.convertParagraph(elem as Asciidoctor.Block, cursor);
    } else if (context === "comment") {
      return this.convertComment(elem as Asciidoctor.Block, cursor);
    }
    return [];
  }

  convertElementList(
    elements: Asciidoctor.AbstractBlock[],
    cursor: LineCursor
  ): AnyTxtNode[] {
    let children = new Array<AnyTxtNode>();
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      if (!element) {
        continue;
      }

      const next = { min: cursor.min, max: cursor.max };
      const lineNumber = element.getLineNumber();
      if (lineNumber !== undefined && lineNumber !== null) {
        next.min = lineNumber;
      }
      if (i + 1 < elements.length) {
        const nextElement = elements[i + 1];
        if (nextElement) {
          const nextLineNumber = nextElement.getLineNumber();
          if (nextLineNumber !== undefined && nextLineNumber !== null) {
            next.max = nextLineNumber;
          }
        }
      }
      children = children.concat(this.convertElement(element, next));
    }
    return children;
  }

  convertDocument(
    elem: Asciidoctor.Document,
    cursor: LineCursor
  ): AnyTxtNode[] {
    const raw = elem.getSource();
    let children = this.convertElementList(elem.getBlocks(), cursor);

    const header = elem.getHeader() as any;
    if (header?.getTitle && header?.getLevel) {
      children = [
        ...this.convertHeader(header as Asciidoctor.Section, cursor),
        ...children,
      ];
    }
    if (children.length === 0) {
      return [];
    }

    const firstChild = children.find((child) => child.loc);
    const lastChild = children
      .slice()
      .reverse()
      .find((child) => child.loc);

    if (!firstChild || !lastChild) {
      return [];
    }

    const loc = {
      start: firstChild.loc.start,
      end: lastChild.loc.end,
    };
    const range = [0, raw.length] as TxtNodeRange;
    const node = {
      type: ASTNodeTypes.Document,
      children,
      loc,
      range,
      raw,
    } as AnyTxtNode;
    return [node];
  }

  convertHeader(elem: Asciidoctor.Section, cursor: LineCursor): AnyTxtNode[] {
    const raw = (elem as any).title; // .title returns raw string.
    const loc = this.findLocation([raw], cursor, ASTNodeTypes.Header);
    if (!loc) {
      return [];
    }
    const value = this.convertValue(elem.getTitle() || ""); // .getTitle() returns converted string.
    const range = this.locationToRange(loc);
    const node = {
      type: ASTNodeTypes.Header,
      depth: elem.getLevel() + 1,
      children: [{ type: ASTNodeTypes.Str, value, loc, range, raw }],
      loc,
      range,
      raw,
    } as AnyTxtNode;
    return [node];
  }

  convertSection(elem: Asciidoctor.Section, cursor: LineCursor): AnyTxtNode[] {
    const raw = (elem as any).title; // .title returns raw string.
    const loc = this.findLocation([raw], cursor, ASTNodeTypes.Header);
    if (!loc) {
      return [];
    }
    const value = this.convertValue(elem.getTitle() || ""); // .getTitle() returns converted string.
    const range = this.locationToRange(loc);
    const header = {
      type: ASTNodeTypes.Header,
      depth: elem.getLevel() + 1,
      children: [{ type: ASTNodeTypes.Str, value, loc, range, raw }],
      loc,
      range,
      raw,
    } as AnyTxtNode;
    const children = this.convertElementList(elem.getBlocks(), cursor);
    return [header, ...children];
  }

  convertParagraph(elem: Asciidoctor.Block, cursor: LineCursor): AnyTxtNode[] {
    if (elem.getBlocks().length > 0) {
      const raw = ""; // TODO: fix asciidoc/asciidoc
      const children = this.convertElementList(elem.getBlocks(), cursor);
      if (children.length === 0) {
        return [];
      }
      const node: AnyTxtNode = {
        type: ASTNodeTypes.Paragraph,
        children: children as any,
        raw,
        ...this.locAndRangeFrom(children),
      } as AnyTxtNode;

      if (elem.hasTitle()) {
        (node as any).title = elem.getTitle();
      }

      return [node];
    }

    const raw = elem.getSource();
    const loc = this.findLocation(
      elem.getSourceLines(),
      cursor,
      ASTNodeTypes.Paragraph
    );
    if (!loc) {
      return [];
    }

    const value = this.convertValue(
      elem.getContent(),
      ["literal"].includes(elem.getStyle())
    );
    const range = this.locationToRange(loc);
    const node: AnyTxtNode = {
      type: ASTNodeTypes.Paragraph,
      children: [
        { type: ASTNodeTypes.Str, value, loc, range, raw } as AnyTxtNode,
      ],
      loc,
      range,
      raw,
    } as AnyTxtNode;

    if (elem.hasTitle()) {
      (node as any).title = elem.getTitle();
    }

    return [node];
  }

  convertQuote(elem: Asciidoctor.Block, cursor: LineCursor): AnyTxtNode[] {
    const raw = elem.getSource();
    if (elem.getBlocks().length > 0) {
      const children = this.convertElementList(elem.getBlocks(), cursor);
      if (children.length === 0) {
        return [];
      }
      const node = {
        type: ASTNodeTypes.BlockQuote,
        children,
        raw,
        ...this.locAndRangeFrom(children),
      } as AnyTxtNode;
      return [node];
    }

    const loc = this.findLocation(
      elem.getSourceLines(),
      cursor,
      ASTNodeTypes.Paragraph
    );
    if (!loc) {
      return [];
    }
    const value = this.convertValue(
      elem.getContent(),
      ["verse"].includes(elem.getStyle())
    );
    const range = this.locationToRange(loc);
    const node = {
      type: ASTNodeTypes.BlockQuote,
      children: [
        {
          type: ASTNodeTypes.Paragraph,
          children: [{ type: ASTNodeTypes.Str, value, loc, range, raw }],
          loc,
          range,
          raw,
        },
      ],
      loc,
      range,
      raw,
    } as AnyTxtNode;
    return [node];
  }

  convertList(elem: Asciidoctor.List, cursor: LineCursor): AnyTxtNode[] {
    const raw = ""; // TODO: fix asciidoc/asciidoc
    const children = this.convertElementList(elem.getItems(), cursor);
    if (children.length === 0) {
      return [];
    }
    const node = {
      type: ASTNodeTypes.List,
      children,
      raw,
      ...this.locAndRangeFrom(children),
    } as AnyTxtNode;
    return [node];
  }

  convertDescriptionList(
    elem: Asciidoctor.AbstractBlock,
    cursor: LineCursor
  ): AnyTxtNode[] {
    const raw = ""; // TODO: fix asciidoc/asciidoc
    const blocks = Array.prototype.concat.apply(
      [],
      elem.getBlocks().map(([terms, item]) => [...terms, item])
    );
    const children = this.convertElementList(blocks, cursor);
    if (children.length === 0) {
      return [];
    }
    const node = {
      type: ASTNodeTypes.List,
      children,
      raw,
      ...this.locAndRangeFrom(children),
    } as AnyTxtNode;
    return [node];
  }

  convertListItem(
    elem: Asciidoctor.ListItem,
    cursor: LineCursor
  ): AnyTxtNode[] {
    const raw = ""; // TODO: fix asciidoc/asciidoc
    let children = this.convertElementList(elem.getBlocks(), cursor);
    if (elem.hasText()) {
      children = [
        ...this.createParagraph((elem as any).text, elem.getText(), cursor),
        ...children,
      ];
    }
    if (children.length === 0) {
      return [];
    }
    const node = {
      type: ASTNodeTypes.ListItem,
      children,
      raw,
      ...this.locAndRangeFrom(children),
    } as AnyTxtNode;
    return [node];
  }

  convertTableCell(
    cell: Asciidoctor.Table.Cell,
    cursor: LineCursor
  ): AnyTxtNode[] {
    const raw = cell.getSource();
    if (!raw) {
      return [];
    }
    const loc = this.findLocation(raw.split(/\n/), cursor, "TableCell");
    if (!loc) {
      return [];
    }
    const range = this.locationToRange(loc);
    const value = this.convertValue(cell.getText());
    const children =
      cell.getStyle() === "asciidoc"
        ? this.convertElementList(
            cell.getInnerDocument()?.getBlocks() || [],
            cursor
          )
        : [{ type: ASTNodeTypes.Str, value, loc, range, raw }];

    const node = { type: "TableCell", children, loc, range, raw } as AnyTxtNode;
    return [node];
  }

  // filepath: [asciidoc-to-ast.ts](http://_vscodecontentref_/1)
  convertTableRow(
    row: Asciidoctor.Table.Cell[],
    cursor: LineCursor
  ): AnyTxtNode[] {
    let children = new Array<AnyTxtNode>();
    for (let cell of row) {
      const lineNumber = cell.getLineNumber();
      if (lineNumber === undefined) {
        continue;
      }
      const cellLine = { ...cursor, min: lineNumber };
      // If the cell has a preceding sibling and the sibling is on the same
      // line number, add an offset to the lineno variable so that
      // findLocation() begins its search from the end of the preceding sibling.
      if (children.length > 0) {
        const sibling = children[children.length - 1];
        if (sibling && sibling.loc && sibling.loc.end.line === cellLine.min) {
          cellLine.startIdx = sibling.loc.end.column;
        } else {
          cellLine.startIdx = 0; // Else, search from the beginning of the line.
        }
      }
      children = [...children, ...this.convertTableCell(cell, cellLine)];
    }
    if (children.length === 0) {
      return [];
    }

    const firstChild = children.find((child) => child.loc);
    const lastChild = children
      .slice()
      .reverse()
      .find((child) => child.loc);

    if (!firstChild || !lastChild) {
      return [];
    }

    const loc = {
      start: firstChild.loc.start,
      end: lastChild.loc.end,
    };
    const range = this.locationToRange(loc);
    const node = {
      type: "TableRow",
      children,
      loc,
      range,
      raw: "",
    } as AnyTxtNode;
    return [node];
  }

  convertTable(table: Asciidoctor.Table, cursor: LineCursor): AnyTxtNode[] {
    let children = new Array<AnyTxtNode>();
    const rows = table
      .getHeadRows()
      .concat(table.getBodyRows())
      .concat(table.getFootRows());

    for (let row of rows) {
      if (row.length === 0) {
        continue;
      }
      const lineNumber = row[0]?.getLineNumber();
      if (lineNumber === undefined) {
        continue;
      }
      const cellLine = { ...cursor, min: lineNumber };
      // Set the minimum line number to the line number of
      // the first cell.  Making this change prevents the
      // findLocation() function from locating text in this
      // row as a substring of a preceding row.
      children = [...children, ...this.convertTableRow(row, cellLine)];
    }
    if (children.length === 0) {
      return [];
    }

    const firstChild = children.find((child) => child.loc);
    const lastChild = children
      .slice()
      .reverse()
      .find((child) => child.loc);

    if (!firstChild || !lastChild) {
      return [];
    }

    const raw = ""; // TODO: fix asciidoc/asciidoc
    const loc = {
      start: firstChild.loc.start,
      end: lastChild.loc.end,
    };
    const range = this.locationToRange(loc);
    const node = { type: "Table", children, loc, range, raw } as AnyTxtNode;
    return [node];
  }

  convertListing(elem: Asciidoctor.Block, cursor: LineCursor): AnyTxtNode[] {
    const raw = elem.getSource();
    const loc = this.findLocation(
      elem.getSourceLines(),
      cursor,
      ASTNodeTypes.CodeBlock
    );
    if (!loc) {
      return [];
    }
    const value = this.convertValue(elem.getContent(), true);
    const range = this.locationToRange(loc);
    const node: AnyTxtNode = {
      type: ASTNodeTypes.CodeBlock,
      value,
      loc,
      range,
      raw,
    } as AnyTxtNode;

    if (elem.hasTitle()) {
      (node as any).title = elem.getTitle();
    }

    const attributes = elem.getAttributes();
    if (attributes && attributes.language) {
      (node as any).lang = attributes.language;
    }

    return [node];
  }

  convertComment(elem: Asciidoctor.Block, cursor: LineCursor): AnyTxtNode[] {
    const raw = elem.getSource() || "";
    const loc = this.findLocation(
      raw.split(/\n/),
      cursor,
      ASTNodeTypes.Comment
    );
    if (!loc) return [];
    const range = this.locationToRange(loc);
    const node = {
      type: ASTNodeTypes.Comment,
      value: raw.replace(/^\/\//, "").trim(),
      loc,
      range,
      raw,
    } as AnyTxtNode;
    return [node];
  }

  extractLineComments(cursor: LineCursor): AnyTxtNode[] {
    const nodes = [];
    for (let i = cursor.min; i <= cursor.max; i++) {
      const line = this.lines[i - 1];
      if (line && /^\/\//.test(line.trim())) {
        const raw = line;
        const loc = {
          start: { line: i, column: 0 },
          end: { line: i, column: line.length },
        };
        const range = this.locationToRange(loc);
        nodes.push({
          type: ASTNodeTypes.Comment,
          value: raw.replace(/^\/\//, "").trim(),
          loc,
          range,
          raw,
        } as AnyTxtNode);
      }
    }
    return nodes;
  }

  createParagraph(
    raw: string,
    content: string,
    cursor: LineCursor
  ): AnyTxtNode[] {
    const loc = this.findLocation(
      raw.split(/\n/),
      cursor,
      ASTNodeTypes.Paragraph
    );
    if (!loc) {
      return [];
    }
    const value = this.convertValue(content);
    const range = this.locationToRange(loc);
    return [
      {
        type: ASTNodeTypes.Paragraph,
        children: [{ type: ASTNodeTypes.Str, value, loc, range, raw }],
        loc,
        range,
        raw,
      },
    ];
  }

  locAndRangeFrom(children: AnyTxtNode[]) {
    const firstChild = children.find((child) => child.loc);
    const lastChild = children
      .slice()
      .reverse()
      .find((child) => child.loc);

    if (!firstChild || !lastChild) {
      return {
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        range: [0, 0] as TxtNodeRange,
      };
    }

    const loc = {
      start: firstChild.loc.start,
      end: lastChild.loc.end,
    };
    const range = this.locationToRange(loc);
    return { loc, range };
  }

  positionToIndex(position: TxtNodePosition): number {
    const lineIndex = position.line - 1;
    return (this.chars[lineIndex] ?? 0) + position.column;
  }

  locationToRange(location: TxtNodeLocation): TxtNodeRange {
    return [
      this.positionToIndex(location.start),
      this.positionToIndex(location.end),
    ];
  }

  findLocation(
    lines: string[],
    cursor: LineCursor,
    _type: string
  ): TxtNodeLocation | null {
    if (lines.length === 0) {
      return null;
    }

    let found = false;

    for (let i = cursor.min; i + lines.length - 1 <= cursor.max; i++) {
      found = true;
      let offset = 0; // see "comment in paragraph" test case.
      const startIdx = cursor.startIdx || 0; // index into the line to begin the search

      for (let j = 0; j < lines.length; j++) {
        let line = this.lines[i + j - 1 + offset];
        if (line === undefined) {
          found = false;
          break;
        }
        // Calicurate the offset for the line number
        // while (type !== ASTNodeTypes.CodeBlock && line && line.match(/^\/\//)) {
        //   offset++;
        //   line = this.lines[i + j - 1 + offset];
        //   if (line === undefined) {
        //     found = false;
        //     break;
        //   }
        // }
        if (
          !found ||
          !line ||
          lines[j] === undefined ||
          line.indexOf(lines[j]!, startIdx) === -1
        ) {
          found = false;
          break;
        }
      }

      if (!found) {
        continue;
      }

      const lastLine = lines[lines.length - 1] || "";
      const endLineNo = i + lines.length - 1 + offset;
      const endLineText = this.lines[endLineNo - 1];
      const startLineText = this.lines[i - 1];

      if (!endLineText || !startLineText) {
        continue;
      }

      const endColumn = endLineText.indexOf(lastLine) + lastLine.length;
      const firstLine = lines[0];
      if (!firstLine) {
        continue;
      }
      const column = startLineText.indexOf(firstLine);
      return {
        // If the lines starts with //, set 0 instead of -1
        start: { line: i, column: column === -1 ? 0 : column },
        end: { line: endLineNo, column: endColumn },
      };
    }
    return null;
  }

  createEmptyDocument(): AnyTxtNode {
    const node = {
      type: ASTNodeTypes.Document,
      children: [],
      range: [0, 0] as TxtNodeRange,
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      raw: "",
    } as AnyTxtNode;
    return node;
  }

  convertValue(content: string, preformatted: boolean = false): string {
    if (preformatted) {
      content = "<pre>" + content + "</pre>";
    }
    return convert(content, {
      preserveNewlines: preformatted,
      wordwrap: false,
    });
  }
}
