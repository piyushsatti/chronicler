import { useEffect, useId, useState } from 'react';
import type { Pointcrawl } from '../adapters/mapAdapter.js';
import { humanizeKey } from '../../../utils/format.js';
import { NODE_STATES, nodeStateLabel, nodeStateMeaning } from '../nodeState.js';
import { NodeStateSwatch } from './NodeStateSwatch.js';
import styles from '../pages/map.module.css';

/** Hex maps add the hex states to the key; their routes are hex adjacency and never drawn. */
export function MapKey({
  edges,
  hexStates = false,
}: {
  edges: Pointcrawl['edges'];
  hexStates?: boolean;
}) {
  const listId = useId();
  const stateListId = useId();
  const [mode, setMode] = useState<'auto' | 'pinned' | 'dismissed'>('auto');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const expanded = mode === 'pinned' || (mode === 'auto' && (hovered || focused));
  useEffect(() => {
    if (!hovered && !focused && mode === 'dismissed') setMode('auto');
  }, [hovered, focused, mode]);
  useEffect(() => {
    if (!expanded) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        (event.target instanceof Element && event.target.closest('[role="dialog"]'))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setMode('dismissed');
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [expanded]);
  const kinds = [...new Set(edges.map((edge) => edge.kind))];
  const routes = edges.length > 0;
  const controls = [routes ? listId : null, hexStates ? stateListId : null]
    .filter(Boolean)
    .join(' ');
  const toggleLabel =
    routes && hexStates
      ? 'Key to map symbols'
      : hexStates
        ? 'Key to hex states'
        : 'Key to route line styles';
  return (
    <div
      className={styles.mapKey}
      onPointerEnter={(event) => {
        if (
          event.pointerType === 'mouse' &&
          window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
        )
          setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className={styles.mapKeyToggle}
        aria-label={toggleLabel}
        aria-expanded={expanded}
        aria-controls={controls}
        onFocus={(event) => {
          if (
            window.matchMedia?.('(hover: hover) and (pointer: fine)').matches &&
            event.currentTarget.matches(':focus-visible')
          )
            setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onClick={() =>
          setMode((current) => (current === 'pinned' ? 'dismissed' : 'pinned'))
        }
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="6.5" cy="7" r="3.5" />
          <path d="m9 9.5 7 7M12 12.5l2-2M14 14.5l2-2" />
        </svg>
        <span>Key</span>
      </button>
      {routes ? (
        <ul
          className={styles.mapKeyList}
          id={listId}
          aria-label="Route line styles"
          hidden={!expanded}
        >
          {kinds.map((kind) => (
            <li key={kind}>
              <i data-edge-kind={kind} aria-hidden="true" />
              {humanizeKey(kind)}
            </li>
          ))}
          {edges.some((edge) => edge.directed) ? (
            <li>
              <i className={styles.oneWay} aria-hidden="true" />
              One-way
            </li>
          ) : null}
        </ul>
      ) : null}
      {hexStates ? (
        <ul
          className={styles.mapKeyList}
          id={stateListId}
          aria-label="Hex states"
          hidden={!expanded}
        >
          {NODE_STATES.map((state) => (
            <li key={state} data-node-state={state}>
              <NodeStateSwatch state={state} />
              {nodeStateLabel(state)}: {nodeStateMeaning(state).toLowerCase()}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
