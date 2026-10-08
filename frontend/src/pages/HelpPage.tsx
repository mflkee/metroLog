import { Fragment, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { WhatsNewModal } from "@/components/WhatsNewModal";

import userGuideMarkdown from "@/content/user-guide.ru.txt?raw";

type MarkdownBlock =
  | {
      type: "heading";
      id: string;
      level: 1 | 2 | 3;
      text: string;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "unordered_list";
      items: string[];
    }
  | {
      type: "ordered_list";
      items: string[];
    };

type TocEntry = {
  id: string;
  level: 2 | 3;
  text: string;
};

type DocumentChapter = {
  id: string;
  title: string;
  blocks: MarkdownBlock[];
  subheadings: TocEntry[];
};

type ParsedDocument = {
  title: string;
  chapters: DocumentChapter[];
  chapterIdByHeadingId: Record<string, string>;
};

function createHeadingId(text: string, index: number): string {
  const slug = text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  return `section-${index + 1}${slug ? `-${slug}` : ""}`;
}

function parseMarkdown(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  let headingIndex = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";

    if (!line) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const text = headingMatch[2].trim();
      const id = createHeadingId(text, headingIndex);
      headingIndex += 1;
      blocks.push({ type: "heading", id, level, text });
      index += 1;
      continue;
    }

    const unorderedMatch = line.match(/^-\s+(.+)$/);
    if (unorderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = (lines[index] ?? "").trim();
        const itemMatch = itemLine.match(/^-\s+(.+)$/);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1].trim());
        index += 1;
      }
      blocks.push({ type: "unordered_list", items });
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const itemLine = (lines[index] ?? "").trim();
        const itemMatch = itemLine.match(/^\d+\.\s+(.+)$/);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1].trim());
        index += 1;
      }
      blocks.push({ type: "ordered_list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const paragraphLine = (lines[index] ?? "").trim();
      if (
        !paragraphLine ||
        /^(#{1,3})\s+/.test(paragraphLine) ||
        /^-\s+/.test(paragraphLine) ||
        /^\d+\.\s+/.test(paragraphLine)
      ) {
        break;
      }
      paragraphLines.push(paragraphLine);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join(" "),
      });
      continue;
    }

    index += 1;
  }

  return blocks;
}

function buildDocumentModel(blocks: MarkdownBlock[]): ParsedDocument {
  let title = "Руководство пользователя";
  const chapters: DocumentChapter[] = [];
  const chapterIdByHeadingId: Record<string, string> = {};
  let currentChapter: DocumentChapter | null = null;

  blocks.forEach((block) => {
    if (block.type === "heading" && block.level === 1) {
      title = block.text;
      return;
    }

    if (block.type === "heading" && block.level === 2) {
      currentChapter = {
        id: block.id,
        title: block.text,
        blocks: [block],
        subheadings: [],
      };
      chapters.push(currentChapter);
      chapterIdByHeadingId[block.id] = block.id;
      return;
    }

    if (!currentChapter) {
      return;
    }

    currentChapter.blocks.push(block);
    if (block.type === "heading" && block.level === 3) {
      currentChapter.subheadings.push({
        id: block.id,
        level: 3,
        text: block.text,
      });
      chapterIdByHeadingId[block.id] = currentChapter.id;
    }
  });

  return {
    title,
    chapters,
    chapterIdByHeadingId,
  };
}

function renderInlineMarkdown(text: string) {
  const parts: Array<string | { type: "code" | "link"; text: string; href?: string }> = [];
  const pattern = /(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      parts.push({ type: "code", text: match[2] });
    } else if (match[4] && match[5]) {
      parts.push({ type: "link", text: match[4], href: match[5] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.map((part, index) => {
    if (typeof part === "string") {
      return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
    }

    if (part.type === "code") {
      return (
        <code
          key={`${part.text}-${index}`}
          className="rounded-lg bg-[color:var(--surface-inline)] px-1.5 py-0.5 text-[0.95em] text-ink"
        >
          {part.text}
        </code>
      );
    }

    const isExternal = /^https?:\/\//.test(part.href ?? "");
    return (
      <a
        key={`${part.text}-${index}`}
        className="text-signal-info underline decoration-signal-info/40 underline-offset-4 transition hover:text-ink"
        href={part.href}
        rel={isExternal ? "noreferrer" : undefined}
        target={isExternal ? "_blank" : undefined}
      >
        {part.text}
      </a>
    );
  });
}

function renderMarkdownBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    if (block.level === 2) {
      return null;
    }

    if (block.level === 3) {
      return (
        <h3
          key={block.id}
          id={block.id}
          className="scroll-mt-24 text-lg font-semibold text-ink"
        >
          {block.text}
        </h3>
      );
    }

    return (
      <h2
        key={block.id}
        id={block.id}
        className="scroll-mt-24 text-2xl font-semibold tracking-tight text-ink"
      >
        {block.text}
      </h2>
    );
  }

  if (block.type === "paragraph") {
    return (
      <p key={`paragraph-${index}`} className="text-sm leading-7 text-steel">
        {renderInlineMarkdown(block.text)}
      </p>
    );
  }

  if (block.type === "unordered_list") {
    return (
      <ul key={`unordered-${index}`} className="space-y-2 pl-0 text-sm leading-7 text-ink">
        {block.items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-[0.68rem] h-1.5 w-1.5 shrink-0 rounded-full bg-signal-info" />
            <span>{renderInlineMarkdown(item)}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ol key={`ordered-${index}`} className="space-y-3 pl-0 text-sm leading-7 text-ink">
      {block.items.map((item, itemIndex) => (
        <li key={`${item}-${itemIndex}`} className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line bg-white/60 text-xs font-semibold text-ink">
            {itemIndex + 1}
          </span>
          <span>{renderInlineMarkdown(item)}</span>
        </li>
      ))}
    </ol>
  );
}

export function HelpPage() {
  const blocks = useMemo(() => parseMarkdown(userGuideMarkdown), []);
  const { title, chapters, chapterIdByHeadingId } = useMemo(() => buildDocumentModel(blocks), [blocks]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>(chapters[0]?.id ?? "");
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  const selectedChapter =
    chapters.find((chapter) => chapter.id === selectedChapterId) ?? chapters[0] ?? null;
  const selectedChapterIndex = selectedChapter
    ? chapters.findIndex((chapter) => chapter.id === selectedChapter.id)
    : -1;
  const previousChapter = selectedChapterIndex > 0 ? chapters[selectedChapterIndex - 1] : null;
  const nextChapter =
    selectedChapterIndex >= 0 && selectedChapterIndex < chapters.length - 1
      ? chapters[selectedChapterIndex + 1]
      : null;

  useEffect(() => {
    if (chapters.length === 0 || typeof window === "undefined") {
      return;
    }

    const applyHash = () => {
      const rawHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!rawHash) {
        setSelectedChapterId((currentId) => currentId || chapters[0].id);
        return;
      }

      const matchingChapterId =
        chapterIdByHeadingId[rawHash] ?? chapters.find((chapter) => chapter.id === rawHash)?.id;

      if (matchingChapterId) {
        setSelectedChapterId(matchingChapterId);
        requestAnimationFrame(() => {
          const element = document.getElementById(rawHash);
          element?.scrollIntoView({ block: "start" });
        });
      }
    };

    applyHash();
    window.addEventListener("hashchange", applyHash);

    return () => {
      window.removeEventListener("hashchange", applyHash);
    };
  }, [chapterIdByHeadingId, chapters]);

  function openChapter(chapterId: string) {
    setSelectedChapterId(chapterId);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${chapterId}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function openSubheading(headingId: string) {
    const matchingChapterId = chapterIdByHeadingId[headingId];
    if (matchingChapterId) {
      setSelectedChapterId(matchingChapterId);
    }

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${headingId}`);
      requestAnimationFrame(() => {
        const element = document.getElementById(headingId);
        element?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
  }

  const chapterContent =
    selectedChapter?.blocks.filter(
      (block, index) => !(index === 0 && block.type === "heading" && block.level === 2),
    ) ?? [];

  return (
    <section className="space-y-6">
      <PageHeader
        title="Документация"
        description="Справка в формате читалки: разбивка по страницам, быстрое переключение разделов и последовательное чтение без длинного монолита."
        action={
          <button
            className="rounded-xl border border-line px-3 py-2 text-sm text-steel"
            onClick={() => setWhatsNewOpen(true)}
            type="button"
          >
            Что нового
          </button>
        }
      />
      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="tone-parent rounded-[28px] border border-line p-4 shadow-panel">
            <div className="border-b border-line/70 px-2 pb-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-steel/80">
                Страницы
              </div>
              <p className="mt-2 text-sm leading-6 text-steel">
                Выбирай страницу слева и читай документацию по разделам, без длинного полотна.
              </p>
            </div>

            <nav className="mt-3 space-y-2">
              {chapters.map((chapter) => {
                const isActive = selectedChapter?.id === chapter.id;
                return (
                  <button
                    key={chapter.id}
                    className={`block w-full rounded-2xl border px-3 py-3 text-left transition ${
                      isActive
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-ink shadow-xs"
                        : "border-line bg-[color:var(--surface-2)] text-steel hover:bg-[color:var(--surface-3)] hover:text-ink"
                    }`}
                    type="button"
                    onClick={() => openChapter(chapter.id)}
                  >
                    <div className="text-sm font-medium leading-6">{chapter.title}</div>
                  </button>
                );
              })}
            </nav>
          </div>

        </aside>

        <article className="tone-parent rounded-[32px] border border-line shadow-panel">
          <div className="border-b border-line/70 px-6 py-5 xl:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-steel">
                {title}
              </span>
              {selectedChapter ? (
                <span className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-steel">
                  Страница {selectedChapterIndex + 1} из {chapters.length}
                </span>
              ) : null}
            </div>

            {selectedChapter ? (
              <>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                  {selectedChapter.title}
                </h2>
                <p className="mt-2 max-w-[72ch] text-sm leading-6 text-steel">
                  Режим чтения показывает только текущую страницу. Следующие разделы открываются
                  через список страниц или кнопки навигации внизу.
                </p>
              </>
            ) : null}
          </div>

          <div className="space-y-6 px-6 py-6 xl:px-8 xl:py-8">
            {selectedChapter?.subheadings.length ? (
              <section className="tone-child rounded-2xl border border-line p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-steel/80">
                  На странице
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedChapter.subheadings.map((subheading) => (
                    <button
                      key={subheading.id}
                      className="btn-secondary btn-sm"
                      type="button"
                      onClick={() => openSubheading(subheading.id)}
                    >
                      {subheading.text}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="space-y-6">
              {chapterContent.map((block, index) => renderMarkdownBlock(block, index))}
            </div>

            {selectedChapter ? (
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <button
                  className="btn-secondary btn-sm disabled:opacity-60"
                  disabled={!previousChapter}
                  type="button"
                  onClick={() => previousChapter && openChapter(previousChapter.id)}
                >
                  Предыдущая страница
                </button>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-steel/80">
                  Страница {selectedChapterIndex + 1} из {chapters.length}
                </span>
                <button
                  className="btn-secondary btn-sm disabled:opacity-60"
                  disabled={!nextChapter}
                  type="button"
                  onClick={() => nextChapter && openChapter(nextChapter.id)}
                >
                  Следующая страница
                </button>
              </footer>
            ) : null}
          </div>
        </article>
      </div>
    </section>
  );
}
