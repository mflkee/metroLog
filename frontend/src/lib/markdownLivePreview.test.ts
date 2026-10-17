import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  planMarkdownDecorations,
  selectionRanges,
  type MarkdownDecoration,
} from "@/lib/markdownLivePreview";

function plan(doc: string, caret = 0): MarkdownDecoration[] {
  const anchor = Math.max(0, Math.min(caret, doc.length));
  const state = EditorState.create({ doc, extensions: [markdown()], selection: { anchor } });
  return planMarkdownDecorations(state, [{ from: 0, to: doc.length }], selectionRanges(state));
}

function hidden(plan_: MarkdownDecoration[]): string[] {
  return plan_.filter((item) => item.kind === "hide").map((item) => item.from + ".." + item.to);
}

function bullets(plan_: MarkdownDecoration[]): number {
  return plan_.filter((item) => item.kind === "widget").length;
}

describe("живой предпросмотр Markdown", () => {
  it("заголовок оформляется сразу, а пометка `#` скрыта, пока курсор не в ней", () => {
    const result = plan("# Заголовок\n\nтекст", 15);

    expect(
      result.some((item) => item.kind === "line" && item.className === "cm-md-h1" && item.from === 0),
    ).toBe(true);
    expect(hidden(result)).toContain("0..1");
  });

  it("пометка под курсором раскрывается, чтобы её можно было править", () => {
    const result = plan("# Заголовок", 0);

    expect(result.some((item) => item.kind === "line" && item.className === "cm-md-h1")).toBe(true);
    expect(hidden(result)).not.toContain("0..1");
  });

  it("жирный текст оформляется по содержимому, пометки скрываются рядом", () => {
    const doc = "до **жирный** после\n\nтекст";
    const result = plan(doc, doc.length);

    const strong = result.find((item) => item.className === "cm-md-strong");
    expect(strong).toBeTruthy();
    expect(doc.slice(strong!.from, strong!.to)).toBe("жирный");
    expect(hidden(result)).toEqual(["3..5", "11..13"]);
  });

  it("точка у пункта списка видна сразу, даже когда курсор в этой же строке", () => {
    const doc = "- первый пункт";
    const result = plan(doc, doc.length);

    expect(bullets(result)).toBe(1);
    expect(hidden(result)).toHaveLength(0);
  });

  it("пометка пункта под курсором показывается как есть", () => {
    const doc = "- первый пункт";
    const result = plan(doc, 0);

    expect(bullets(result)).toBe(0);
  });

  it("у нумерованного списка номер остаётся видимым", () => {
    const doc = "1. первый\n\nтекст";
    const list = plan(doc, doc.length);

    expect(bullets(list)).toBe(0);
    expect(hidden(list)).toHaveLength(0);
  });

  it("цитата получает оформление, а её пометка скрывается", () => {
    const quote = plan("> цитата\n\nтекст", 12);

    expect(quote.some((item) => item.kind === "line" && item.className === "cm-md-quote")).toBe(true);
    expect(hidden(quote).length).toBeGreaterThan(0);
  });

  it("упоминание подсвечивается прямо во время набора", () => {
    const result = plan("привет @ИвановИИ", 0);

    const mention = result.find((item) => item.className === "cm-md-mention");
    expect(mention).toBeTruthy();
    expect("привет @ИвановИИ".slice(mention!.from, mention!.to)).toBe("@ИвановИИ");
  });
});
