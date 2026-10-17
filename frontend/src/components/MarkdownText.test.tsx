import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownText } from "@/components/MarkdownText";

describe("MarkdownText", () => {
  it("рендерит заголовок, список и выделение", () => {
    const { container } = render(
      <MarkdownText text={"# Заголовок\n\n- первый пункт\n- второй\n\n**жирный** и *курсив*"} />,
    );

    expect(container.querySelector(".md-h1")?.textContent).toBe("Заголовок");
    expect(container.querySelectorAll(".md-list-item")).toHaveLength(2);
    expect(container.querySelector(".md-strong")?.textContent).toBe("жирный");
    expect(container.querySelector(".md-em")?.textContent).toBe("курсив");
    expect(container.textContent).not.toContain("#");
  });

  it("не выполняет сырой HTML: тег остаётся текстом", () => {
    const { container } = render(<MarkdownText text={"<b>важное</b>"} />);

    expect(container.textContent).toBe("<b>важное</b>");
    expect(container.querySelector("b")).toBeNull();
  });

  it("подсвечивает упоминание и внутри списка, и в абзаце", () => {
    const { container } = render(
      <MarkdownText text={"- уточнить у @ИвановИИ\n\nи ещё @ПетровПП в абзаце"} />,
    );

    const mentions = Array.from(container.querySelectorAll(".mention")).map((node) => node.textContent);
    expect(mentions).toEqual(["@ИвановИИ", "@ПетровПП"]);
  });

  it("не считает упоминанием адрес почты", () => {
    const { container } = render(<MarkdownText text={"пиши на ivanov@mkair.ru"} />);

    expect(container.querySelector(".mention")).toBeNull();
    expect(screen.getByText(/ivanov@mkair\.ru/)).toBeTruthy();
  });

  it("ничего не рендерит на пустом тексте", () => {
    const { container } = render(<MarkdownText text={"   "} />);

    expect(container.firstChild).toBeNull();
  });
});
