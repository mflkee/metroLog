import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { MarkdownEditor, type MarkdownEditorHandle } from "@/components/MarkdownEditor";

describe("MarkdownEditor", () => {
  it("оформляет строку сразу после того, как она набрана", () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { container } = render(<MarkdownEditor onChange={() => undefined} ref={ref} value="" />);

    ref.current?.insertAtSelection("# Заголовок");
    ref.current?.insertAtSelection("\n\nтекст **жирный** и @ИвановИИ");

    const lines = Array.from(container.querySelectorAll(".cm-line"));
    expect(lines[0]?.classList.contains("cm-md-h1")).toBe(true);
    expect(container.querySelector(".cm-md-strong")?.textContent).toBe("жирный");
    expect(container.querySelector(".cm-md-mention")?.textContent).toBe("@ИвановИИ");
  });

  it("показывает подсказку, пока поле пустое", () => {
    const { container } = render(
      <MarkdownEditor onChange={() => undefined} placeholder="Сообщение, @упоминание…" value="" />,
    );

    expect(container.querySelector(".markdown-editor__placeholder")?.textContent).toBe(
      "Сообщение, @упоминание…",
    );
  });
});
