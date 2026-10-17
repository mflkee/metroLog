import { Children, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { splitMentionText } from "@/lib/mentions";

type MarkdownTextProps = {
  text: string | null | undefined;
  className?: string;
};

/**
 * Человеческий текст (комментарии, сообщения, описания, «Что нового») рендерится как Markdown.
 *
 * `@упоминания` подсвечиваются внутри любого блока — абзаца, заголовка, пункта списка, — поэтому
 * разбор упоминаний идёт по текстовым узлам: renderer не знает про них ничего лишнего.
 * Сырой HTML не выполняется: без rehype-raw теги остаются текстом.
 */
function withMentions(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== "string") {
      return child;
    }

    return splitMentionText(child).map((part, index) =>
      part.type === "mention" ? (
        <span className="mention" key={`${part.value}-${index}`}>
          {part.value}
        </span>
      ) : (
        <span key={`text-${index}`}>{part.value}</span>
      ),
    );
  });
}

const components: Components = {
  p: ({ children }) => <p className="md-p">{withMentions(children)}</p>,
  h1: ({ children }) => <p className="md-h md-h1">{withMentions(children)}</p>,
  h2: ({ children }) => <p className="md-h md-h2">{withMentions(children)}</p>,
  h3: ({ children }) => <p className="md-h md-h3">{withMentions(children)}</p>,
  h4: ({ children }) => <p className="md-h md-h4">{withMentions(children)}</p>,
  h5: ({ children }) => <p className="md-h md-h5">{withMentions(children)}</p>,
  h6: ({ children }) => <p className="md-h md-h6">{withMentions(children)}</p>,
  ul: ({ children }) => <ul className="md-list">{children}</ul>,
  ol: ({ children }) => <ol className="md-list md-list-ordered">{children}</ol>,
  li: ({ children }) => <li className="md-list-item">{withMentions(children)}</li>,
  strong: ({ children }) => <strong className="md-strong">{withMentions(children)}</strong>,
  em: ({ children }) => <em className="md-em">{withMentions(children)}</em>,
  del: ({ children }) => <del className="md-del">{withMentions(children)}</del>,
  blockquote: ({ children }) => <blockquote className="md-quote">{children}</blockquote>,
  hr: () => <hr className="md-hr" />,
  code: ({ children, className }) => (
    <code className={["md-code", className ?? ""].join(" ").trim()}>{children}</code>
  ),
  pre: ({ children }) => <pre className="md-pre">{children}</pre>,
  a: ({ children, href }) => (
    <a className="md-link" href={href} rel="noreferrer noopener" target="_blank">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table className="md-table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="md-th">{withMentions(children)}</th>,
  td: ({ children }) => <td className="md-td">{withMentions(children)}</td>,
  input: ({ checked }) => <input checked={Boolean(checked)} disabled readOnly type="checkbox" />,
  img: () => null,
};

export function MarkdownText({ text, className }: MarkdownTextProps) {
  if (!text || !text.trim()) {
    return null;
  }

  return (
    <div className={["markdown-text", className ?? ""].join(" ").trim()}>
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
