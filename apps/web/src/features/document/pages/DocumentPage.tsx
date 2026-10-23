import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { handleOnlyName, humanizeKey } from '../../../utils/format.js';
import { useDocumentPage } from '../hooks/useDocumentPage.js';

const DECLARATION: PageDeclaration = {
  page: 'document',
  regions: [{ role: 'body', priority: 1 }],
};

const BACK = { to: '/community', label: 'Community' } as const;

export function DocumentPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useDocumentPage(slug);

  if (page.status !== 'ready') {
    const regions: PageRegionRenderers = {
      body: () =>
        page.status === 'error' ? (
          <StatePanel
            status="error"
            error={page.error}
            action={
              <Link className="btn" to="/community">
                Back to Community
              </Link>
            }
          />
        ) : (
          <StatePanel status="loading" />
        ),
    };
    return (
      <PageShell title="Community post" back={BACK}>
        <PageHost declaration={DECLARATION} regions={regions} />
      </PageShell>
    );
  }

  const doc = page.view;
  const kind = humanizeKey(doc.category ?? doc.kind);
  const author = doc.authorHandle ? handleOnlyName(doc.authorHandle) : null;
  const rail = author ? (
    <Card as="section" pad={5} aria-label="Author">
      <div className="row" data-gap="3" data-align="center">
        <Avatar name={author} size="md" online={false} />
        <div className="stack" data-gap="1">
          <span className="type-title">{author}</span>
          <span className="type-caption">Posted this {kind.toLowerCase()}</span>
        </div>
      </div>
      <p className="type-caption">
        <Link to="/community">More from Community</Link>
      </p>
    </Card>
  ) : null;

  const regions: PageRegionRenderers = {
    body: () => (
      <DetailLayout rail={rail} railLabel="About this post">
        <DetailLayout.Reading>
          <Card as="article" pad={6}>
            {doc.body ? (
              <ContentRenderer body={doc.body} />
            ) : (
              <p className="type-caption">No body available for this viewer.</p>
            )}
          </Card>
        </DetailLayout.Reading>
      </DetailLayout>
    ),
  };

  return (
    <PageShell>
      <PageHeader
        back={BACK}
        title={doc.title}
        meta={
          <Chip size="sm" tone="line">
            {kind}
          </Chip>
        }
      />
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
