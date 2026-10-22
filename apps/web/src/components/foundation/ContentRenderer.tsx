import { type ReactNode } from 'react';
import ReactMarkdown, { type Components, defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import {
  BannerMediaEmbed,
  classifyBannerMedia,
  isSafeHttpsUrl,
} from './contentMedia.js';
import { MermaidBlock } from './MermaidBlock.js';
import { remarkContent } from './contentMarkdown.js';

export type ContentRendererProps = {
  body?: string;
  children?: ReactNode;
  className?: string;
};

export function safeContentUrl(value: string): string {
  if (
    value.trimStart().startsWith('//') ||
    [...value].some(
      (character) =>
        character === '\\' ||
        character.charCodeAt(0) < 32 ||
        character.charCodeAt(0) === 127,
    )
  )
    return '';
  return defaultUrlTransform(value);
}

const components: Components = {
  table: ({ children }) => (
    <div className="cr-table-scroll">
      <table>{children}</table>
    </div>
  ),
  a: ({ href, children, className }) => {
    if (!href) return <span>{children}</span>;
    if (href.startsWith('/') && !href.startsWith('//'))
      return (
        <Link className={className} to={href}>
          {children}
        </Link>
      );
    const external = /^https?:/i.test(href);
    return (
      <a
        href={href}
        className={external ? 'cr-ext' : className}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) =>
    src && (src.startsWith('/') || isSafeHttpsUrl(src)) ? (
      <img className="cr-img" src={src} alt={alt ?? ''} loading="lazy" />
    ) : (
      <span className="type-caption">Image unavailable{alt ? ` · ${alt}` : ''}</span>
    ),
  blockquote: ({ node, children }) => {
    const variant = node?.properties.calloutVariant;
    if (typeof variant !== 'string') return <blockquote>{children}</blockquote>;
    return (
      <aside className="cr-callout" data-variant={variant}>
        <span className="cr-callout-ic" aria-hidden="true">
          {variant === 'warn'
            ? '⚠'
            : variant === 'tip'
              ? '◇'
              : variant === 'dm'
                ? '◈'
                : 'ⓘ'}
        </span>
        <div>
          <p className="cr-callout-title">
            {String(node?.properties.calloutTitle ?? 'Note')}
          </p>
          <div className="cr-callout-body">{children}</div>
        </div>
      </aside>
    );
  },
  pre: ({ node, children }) => {
    const code = node?.children[0];
    if (
      code?.type === 'element' &&
      Array.isArray(code.properties.className) &&
      code.properties.className.includes('language-mermaid')
    ) {
      return (
        <MermaidBlock
          code={code.children
            .map((child) => (child.type === 'text' ? child.value : ''))
            .join('')
            .trimEnd()}
        />
      );
    }
    return <pre>{children}</pre>;
  },
  figure: ({ node, children }) => {
    const props = node?.properties;
    const media =
      typeof props?.mediaRequest === 'string' &&
      typeof props.mediaUrl === 'string' &&
      typeof props.mediaLabel === 'string'
        ? classifyBannerMedia(props.mediaRequest, props.mediaUrl, props.mediaLabel)
        : null;
    return media ? <BannerMediaEmbed media={media} /> : <figure>{children}</figure>;
  },
};

export function ContentRenderer({
  body,
  children,
  className,
}: ContentRendererProps): React.JSX.Element {
  return (
    <div
      className={['cr-prose', className].filter(Boolean).join(' ')}
      data-component="ContentRenderer"
    >
      {body != null ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkContent]}
          components={components}
          urlTransform={safeContentUrl}
          skipHtml
        >
          {body}
        </ReactMarkdown>
      ) : (
        children
      )}
    </div>
  );
}
