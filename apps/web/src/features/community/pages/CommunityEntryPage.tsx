import type { PageDeclaration } from '@pi/react-imposition';
import { PageHost, type PageRegionRenderers } from '@pi/react-imposition/react';
import { Link, useParams } from 'react-router-dom';
import { ContentRenderer } from '../../../components/foundation/ContentRenderer.js';
import { PageHeader } from '../../../components/primitives/PageHeader.js';
import { PageShell } from '../../../components/foundation/PageShell.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Avatar } from '../../../components/primitives/Avatar.js';
import { Card } from '../../../components/primitives/Card.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { Button } from '../../../components/primitives/Button.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import { useMemberHref } from '../../../hooks/useMemberHref.js';
import { useMemberProfile } from '../../../hooks/useMemberProfile.js';
import type { AppError } from '../../../errors/types.js';
import { useCommunityEntryPage, useCommunityEntryRelated } from '../hooks/useCommunityEntryPage.js';
import { DetailLayout } from '../../../components/primitives/DetailLayout.js';
import { handleLabel, humanizeKey, isSentinelDate, personLabels } from '../../../utils/format.js';
import { documentHref } from '../../../utils/documentHref.js';
import { toAppError } from '../../../errors/toAppError.js';

const DECLARATION: PageDeclaration = {
  page: 'community-entry',
  regions: [{ role: 'body', priority: 1 }],
};

const BACK = { to: '/community', label: 'Community' } as const;

function EntryFailure({ error }: { error: AppError }): React.JSX.Element {
  const action = (
    <Link className="btn" to="/community">
      Back to Community
    </Link>
  );
  return error.kind === 'not_found' ? (
    <StatePanel
      status="empty"
      title="Post not found"
      emptyMessage="This community post doesn't exist, or it isn't shared with you."
      action={action}
    />
  ) : (
    <StatePanel status="error" title="Post unavailable" error={error} action={action} />
  );
}

export function CommunityEntryPage(): React.JSX.Element {
  const { slug = '' } = useParams();
  const page = useCommunityEntryPage(slug);
  const { formatDate } = useDateFormatter();
  const memberHref = useMemberHref();
  const authorProfile = useMemberProfile(page.status === 'ready' ? page.view.author?.handle ?? '' : '');
  const related = useCommunityEntryRelated(page.status === 'ready' ? page.view.authorId : '');

  if (page.status !== 'ready') {
    const regions: PageRegionRenderers = {
      body: () =>
        page.status === 'error' ? (
          <EntryFailure error={page.error} />
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

  const view = page.view;
  const author = view.author ? { ...authorProfile.data?.member, handle: view.author.handle } : null;
  const authorName = author ? personLabels([author])[0] : null;
  const authorIdentity = author && authorName ? (
    <Link className="type-link" to={memberHref(author, 'player')}>
      {authorName}
      {handleLabel(author.handle) && !authorName.includes(handleLabel(author.handle) ?? '') ? (
        <span className="type-caption"> · {handleLabel(author.handle)}</span>
      ) : null}
    </Link>
  ) : null;
  const when = [view.publishedAt, view.updatedAt].find((value) => value && !isSentinelDate(value));
  const otherPosts = related.data?.filter((post) => post.id !== view.id) ?? [];
  const rail = (
    <div className="stack" data-gap="4">
      {author && authorName ? (
        <Card
          as="section"
          pad={5}
          className="stack"
          data-gap="3"
          aria-label="Posted by"
        >
          <span className="type-label">Posted by</span>
          <div className="row" data-gap="3" data-align="center">
            <Avatar name={authorName} src={author.avatarUrl ?? undefined} size="md" online={false} />
            {authorIdentity}
          </div>
        </Card>
      ) : null}
      <Card as="section" pad={5} className="stack" data-gap="3" aria-label="More by this author">
        <h2 className="type-title">More by this author</h2>
        {related.isError ? (
          <StatePanel status="error" error={toAppError(related.error, 'community:related')} action={<Button variant="secondary" size="sm" onClick={related.retry}>Retry posts</Button>} />
        ) : related.isPending ? <StatePanel status="loading" /> : otherPosts.length ? (
          <ul className="stack" data-gap="3">
            {otherPosts.map((post) => <li key={post.id}><Link className="type-link" to={documentHref(post) ?? '/community'}>{post.title}</Link></li>)}
          </ul>
        ) : <EmptyState message="There are no other shared posts by this author yet." action={<Link className="type-link" to="/search?kinds=community">Find community posts</Link>} />}
      </Card>
    </div>
  );
  const regions: PageRegionRenderers = {
    body: () => (
      <DetailLayout rail={rail} railLabel="About this post">
        <DetailLayout.Reading>
          <Card as="article" pad={6}>
            {view.effectiveBody ? (
              <div className="summary-prose">
                <ContentRenderer body={view.effectiveBody} />
              </div>
            ) : (
              <EmptyState message="Nothing to read here yet." action={<Link className="type-link" to="/search?kinds=community">Find community posts</Link>} />
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
        title={view.title}
        meta={
          <>
            {authorIdentity}
            {view.category ? (
              <Chip size="sm" tone="category">
                {humanizeKey(view.category)}
              </Chip>
            ) : null}
            {when ? (
              <time dateTime={when}>
                {view.publishedAt ? 'Posted ' : 'Updated '}
                {formatDate(when)}
              </time>
            ) : null}
          </>
        }
      />
      <PageHost declaration={DECLARATION} regions={regions} />
    </PageShell>
  );
}
