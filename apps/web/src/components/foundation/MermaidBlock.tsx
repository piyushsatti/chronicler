import DOMPurify from 'dompurify';
import { useEffect, useId, useState } from 'react';

type DiagramState =
  { status: 'loading' } | { status: 'ready'; svg: string } | { status: 'error' };

export function sanitizeDiagram(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject'],
  });
}

export function MermaidBlock({ code }: { code: string }): React.JSX.Element {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [state, setState] = useState<DiagramState>({ status: 'loading' });
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((value) => value + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode', 'data-theme', 'data-colorblind'],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          htmlLabels: false,
          theme: 'base',
          themeVariables: {
            primaryColor: getComputedStyle(document.documentElement)
              .getPropertyValue('--color-bg-surface')
              .trim(),
            primaryTextColor: getComputedStyle(document.documentElement)
              .getPropertyValue('--color-text')
              .trim(),
            primaryBorderColor: getComputedStyle(document.documentElement)
              .getPropertyValue('--color-accent')
              .trim(),
            lineColor: getComputedStyle(document.documentElement)
              .getPropertyValue('--color-text-muted')
              .trim(),
          },
          suppressErrorRendering: true,
        });
        const result = await mermaid.render(`diagram${id}`, code);
        if (alive) setState({ status: 'ready', svg: sanitizeDiagram(result.svg) });
      })
      .catch(() => {
        if (alive) setState({ status: 'error' });
      });
    return () => {
      alive = false;
    };
  }, [code, id, themeVersion]);
  if (state.status === 'error')
    return (
      <div className="cr-mmd cr-mmd-err">
        <p className="cr-mmd-err-h">Diagram could not be rendered</p>
        <pre>{code}</pre>
      </div>
    );
  if (state.status === 'loading')
    return (
      <p className="cr-mmd-loading" role="status">
        Rendering diagram…
      </p>
    );
  return (
    <figure className="cr-mmd" aria-label="Diagram">
      <div dangerouslySetInnerHTML={{ __html: state.svg }} />
    </figure>
  );
}
