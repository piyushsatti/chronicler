import { ProtectedRoute } from '../../../auth/ProtectedRoute.js';
import { SingleRegionPage } from '../../../chrome/singleRegion.js';
import { useTheme } from '../../../context/ThemeContext.js';
import { RULED_THEMES, type BgEffectId } from '../../../context/theme.utils.js';
import { Chip } from '../../../components/primitives/Chip.js';
import { Button } from '../../../components/primitives/Button.js';
import { Card } from '../../../components/primitives/Card.js';
import { EmptyState } from '../../../components/primitives/EmptyState.js';
import { StatePanel } from '../../../components/foundation/StatePanel.js';
import { Tabs } from '../../../components/primitives/Tabs.js';
import { toAppError } from '../../../errors/toAppError.js';
import { usePersonalizePage } from '../hooks/usePersonalizePage.js';
import type { CatalogItemView } from '../types.js';

const EFFECTS: readonly BgEffectId[] = [
  'none',
  'starfield-twinkle',
  'glow-pulse',
  'gradient-sweep',
];

function CatalogGroup({
  title,
  items,
  onEquip,
  pending,
}: {
  title: string;
  items: CatalogItemView[];
  onEquip: (item: CatalogItemView) => void;
  pending: boolean;
}): React.JSX.Element {
  if (items.length === 0) {
    return (
      <section className="stack" aria-label={title}>
        <h2 className="type-heading">{title}</h2>
        <EmptyState kind="generic" message={`No ${title.toLowerCase()} in catalog.`} />
      </section>
    );
  }
  return (
    <section className="stack" aria-label={title}>
      <h2 className="type-heading">{title}</h2>
      <ul className="stack">
        {items.map((item) => (
          <li key={item.id}>
            <Card
              className="stack pz-catalog-item"
              data-rarity={item.rarity ?? undefined}
              data-owned={item.owned ? '1' : '0'}
            >
              <div className="row" data-justify="between">
                <p className="type-title">{item.name}</p>
                {item.rarity ? (
                  <Chip tone="accent" size="sm">
                    {item.rarity}
                  </Chip>
                ) : null}
              </div>
              {item.description ? (
                <p className="type-caption">{item.description}</p>
              ) : null}
              {!item.owned && item.unlockHint ? (
                <p className="type-caption pz-unlock-hint">{item.unlockHint}</p>
              ) : null}
              <p className="type-caption">
                {item.owned ? 'Owned' : 'Locked'}
                {item.equipped ? ' · Equipped' : ''}
              </p>
              <Button
                type="button"
                variant={item.equipped ? 'secondary' : 'primary'}
                disabled={!item.owned || item.equipped || pending}
                onClick={() => onEquip(item)}
              >
                {item.equipped ? 'Equipped' : item.owned ? 'Equip' : 'Locked'}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PersonalizeBody(): React.JSX.Element {
  const { prefs, setTheme, setBgEffect, setMode } = useTheme();
  const { personalization, settingsMutation, equipMutation } =
    usePersonalizePage();

  if (personalization.isError) {
    return (
      <StatePanel
        status="error"
        error={toAppError(personalization.error, 'personalize:page')}
      />
    );
  }

  const catalog = personalization.data?.catalog ?? [];
  const themes = catalog.filter((item) => item.cosmeticType === 'theme');
  const flair = catalog.filter((item) => item.cosmeticType !== 'theme');

  return (
    <Tabs
      items={[
        {
          id: 'look',
          label: 'Look',
          panel: (
            <section className="stack">
              <h2 className="type-heading">Theme</h2>
              <Chip.Row>
                {RULED_THEMES.map((theme) => (
                  <Chip
                    key={theme}
                    selected={prefs.theme === theme}
                    onClick={() => {
                      setTheme(theme);
                      settingsMutation.mutate({ themePalette: theme });
                    }}
                    tone="accent"
                  >
                    {theme}
                  </Chip>
                ))}
              </Chip.Row>
              <h2 className="type-heading">Color mode</h2>
              <Chip.Row>
                {(['system', 'dark', 'light'] as const).map((mode) => (
                  <Chip
                    key={mode}
                    selected={prefs.mode === mode}
                    onClick={() => {
                      setMode(mode);
                      settingsMutation.mutate({ colorMode: mode });
                    }}
                  >
                    {mode}
                  </Chip>
                ))}
              </Chip.Row>
              <h2 className="type-heading">Ambient effect</h2>
              <Chip.Row>
                {EFFECTS.map((effect) => (
                  <Chip
                    key={effect}
                    selected={prefs.bgEffect === effect}
                    onClick={() => {
                      setBgEffect(effect);
                      settingsMutation.mutate({ bgEffect: effect });
                    }}
                  >
                    {effect}
                  </Chip>
                ))}
              </Chip.Row>
              {personalization.data ? (
                <p className="type-caption">
                  Progress · {personalization.data.driverProgress.playerQuestsCount}{' '}
                  quests · {personalization.data.driverProgress.dmSessionsCount} DM
                  sessions · tier {personalization.data.dmTier}
                </p>
              ) : (
                <StatePanel status="loading" />
              )}
            </section>
          ),
        },
        {
          id: 'catalog',
          label: 'Catalog',
          panel: personalization.isLoading ? (
            <StatePanel status="loading" />
          ) : (
            <div className="stack">
              <CatalogGroup
                title="Themes"
                items={themes}
                pending={equipMutation.isPending}
                onEquip={(item) =>
                  equipMutation.mutate({ unlockableId: item.id, slot: 'theme' })
                }
              />
              <CatalogGroup
                title="Flair"
                items={flair}
                pending={equipMutation.isPending}
                onEquip={(item) =>
                  equipMutation.mutate({
                    unlockableId: item.id,
                    slot: item.cosmeticType,
                  })
                }
              />
            </div>
          ),
        },
      ]}
    />
  );
}

export function PersonalizePage(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <SingleRegionPage page="personalize">
        <p className="eyebrow">You</p>
        <h1 className="type-display">Personalize</h1>
        <PersonalizeBody />
      </SingleRegionPage>
    </ProtectedRoute>
  );
}
