import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import type { ReactElement, ReactNode } from 'react';

function singleBodyDeclaration(page: string): PageDeclaration {
  return {
    page,
    regions: [{ role: 'body', priority: 1 }],
  };
}

export function SingleRegionPage({
  page,
  children,
}: {
  page: string;
  children: ReactNode;
}): ReactElement {
  const regions: PageRegionRenderers = {
    body: () => <>{children}</>,
  };
  return <PageHost declaration={singleBodyDeclaration(page)} regions={regions} />;
}
