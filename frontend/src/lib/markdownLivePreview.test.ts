import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { activeLineNumbers, planMarkdownDecorations, type MarkdownDecoration } from "@/lib/markdownLivePreview";

function plan(doc: string, caret = 0): MarkdownDecoration[] {
  const anchor = Math.max(0, Math.min(caret, doc.length));
  const state = EditorState.create({ doc, extensions: [markdown()], selection: { anchor } });
  return planMarkdownDecorations(state, [{ from: 0, to: doc.length }], activeLineNumbers(state));
}

function hidden(plan_: MarkdownDecoration[]): string[] {
  return plan_.filter((item) => item.kind === "hide").map((item) => item.from + ".." + item.to);
}

describe("живой предпросмотр Markdown", () => {
  it("заголовок получает строчное оформление, а пометка `#` скрывается на неактивной строке", () => {
    const result = plan("# Заголовок\n\nтекст", 15);

    expect(
      result.some((item) => item.kind === "line" && item.className === "cm-md-h1" && item.from === 0),
    ).toBe(true);
    expect(hidden(result)).toContain("0..1");
  });

  it("на строке с курсором разметка остаётся видимой", () => {
    const result = plan("# Заголовок", 3);

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

  it("у пункта списка пометка заменяется точкой, а не исчезает", () => {
    const doc = "- первый\n- второй\n\nтекст";
    const list = plan(doc, doc.length);

    const bullets = list.filter((item) => item.kind === "widget");
    expect(bullets).toHaveLength(2);
    expect(bullets[0].className).toBe("• ");
    expect(hidden(list)).toHaveLength(0);
  });

  it("у нумерованного списка номер остаётся видимым", () => {
    const doc = "1. первый\n\nтекст";
    const list = plan(doc, doc.length);

    expect(list.some((item) => item.kind === "widget")).toBe(false);
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
