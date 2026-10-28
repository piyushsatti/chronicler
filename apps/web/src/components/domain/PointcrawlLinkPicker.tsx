import { useId, useState } from 'react';
import { Button } from '../primitives/Button.js';
import { Checkbox } from '../primitives/Checkbox.js';
import { Select } from '../primitives/Select.js';
import { isHexCode } from '../../utils/hexCode.js';
import styles from './PointcrawlLinkPicker.module.css';

export type PointcrawlRole = 'expected' | 'visited';
export type PointcrawlLinkValue = { pointcrawlNodeId: string; role: PointcrawlRole };

const ROLE_LABEL: Record<PointcrawlRole, string> = {
  expected: 'Expected destination',
  visited: 'Visited',
};
/** A hexflower holds over a hundred places; show a short list of matches, never all of them. */
const MATCH_LIMIT = 12;

/**
 * Picks the map places a quest heads to or has visited. The viewer searches a
 * map's places by name instead of scrolling every hex; chosen places stay listed
 * above the search, including ones from other maps.
 */
export function PointcrawlLinkPicker({
  maps,
  atlasCode,
  onAtlasChange,
  nodes,
  nodesLoading,
  links,
  onChange,
  roles,
  canMarkVisited,
  disabled = false,
}: {
  maps: readonly { atlasCode: string; name: string }[] | undefined;
  atlasCode: string;
  onAtlasChange: (atlasCode: string) => void;
  nodes: readonly { id: string; name: string }[] | undefined;
  nodesLoading: boolean;
  links: readonly PointcrawlLinkValue[];
  onChange: (links: PointcrawlLinkValue[]) => void;
  /** Roles this form offers: a new quest has only expected destinations. */
  roles: readonly PointcrawlRole[];
  canMarkVisited: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  const id = useId();
  const [search, setSearch] = useState('');
  const names = new Map((nodes ?? []).map((node) => [node.id, node.name]));
  const has = (nodeId: string, role: PointcrawlRole) =>
    links.some((link) => link.pointcrawlNodeId === nodeId && link.role === role);
  const toggle = (nodeId: string, role: PointcrawlRole, checked: boolean) =>
    onChange(
      checked
        ? [...links, { pointcrawlNodeId: nodeId, role }]
        : links.filter((link) => link.pointcrawlNodeId !== nodeId || link.role !== role),
    );
  const query = search.trim().toLowerCase();
  const matches = query
    ? (nodes ?? []).filter((node) => node.name.toLowerCase().includes(query))
    : [];
  // The search matches the place's code, so name the code the map's places use.
  const hexPlaces = Boolean(nodes?.length) && (nodes ?? []).every((node) => isHexCode(node.name));
  const elsewhere = links.filter((link) => !names.has(link.pointcrawlNodeId)).length;
  const roleDisabled = (role: PointcrawlRole) =>
    disabled || (role === 'visited' && !canMarkVisited);
  return (
    <div className="stack" data-component="PointcrawlLinkPicker">
      <div className="stack">
        <span id={`${id}-map`}>Pointcrawl map</span>
        <Select
          label="Pointcrawl map"
          labelId={`${id}-map`}
          value={atlasCode}
          disabled={disabled || !maps}
          onValueChange={(code) => {
            setSearch('');
            onAtlasChange(code);
          }}
          options={[
            { value: '', label: 'Choose a map' },
            ...(maps ?? []).map((map) => ({ value: map.atlasCode, label: map.name })),
          ]}
        />
      </div>
      {links.length > 0 ? (
        <ul className={styles.selected} aria-label="Chosen places">
          {links
            .filter((link) => names.has(link.pointcrawlNodeId))
            .map((link) => {
              const name = names.get(link.pointcrawlNodeId) ?? '';
              return (
                <li key={`${link.pointcrawlNodeId}-${link.role}`} className={styles.chosen}>
                  <span>
                    <strong>{name}</strong>{' '}
                    <span className={styles.role}>{ROLE_LABEL[link.role]}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${name} as ${ROLE_LABEL[link.role].toLowerCase()}`}
                    disabled={roleDisabled(link.role)}
                    onClick={() => toggle(link.pointcrawlNodeId, link.role, false)}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          {elsewhere > 0 ? (
            <li className={styles.chosen}>
              <span>
                {elsewhere === 1 ? '1 place' : `${elsewhere} places`} on other maps
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}
      {atlasCode && nodesLoading ? <p role="status">Loading map places…</p> : null}
      {atlasCode && nodes?.length === 0 ? <p>This map has no places yet.</p> : null}
      {nodes && nodes.length > 0 ? (
        <label className="field">
          <span className="field-label">Find a place</span>
          <input
            className="field-input"
            type="search"
            placeholder={
              hexPlaces ? 'Hex code, e.g. LFR7008' : 'Hex or location code, e.g. LFR7008'
            }
            value={search}
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      ) : null}
      {query && matches.length === 0 ? (
        <p className="type-caption">No places on this map match “{search.trim()}”.</p>
      ) : null}
      {matches.length > 0 ? (
        <ul className={styles.matches} aria-label="Matching places">
          {matches.slice(0, MATCH_LIMIT).map((node) => (
            <li key={node.id} className={styles.match}>
              <span className={styles.matchName}>{node.name}</span>
              {roles.map((role) => (
                <Checkbox
                  key={role}
                  label={ROLE_LABEL[role]}
                  checked={has(node.id, role)}
                  disabled={roleDisabled(role)}
                  onCheckedChange={(checked) => toggle(node.id, role, checked)}
                />
              ))}
            </li>
          ))}
        </ul>
      ) : null}
      {matches.length > MATCH_LIMIT ? (
        <p className="type-caption">
          Showing {MATCH_LIMIT} of {matches.length} matches. Type more of the name to narrow
          the list.
        </p>
      ) : null}
    </div>
  );
}
