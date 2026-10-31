import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VoiceChannelField } from '../../../src/features/editor/fields/FieldControls.js';
import { schemaForType } from '../../../src/features/editor/editorSchemas.js';

const items = [
  { name: 'Table 1', channelId: '444444444444444444' },
  { name: 'Table 2', channelId: '555555555555555555' },
];

describe('VoiceChannelField', () => {
  it('shows the picked channel by name', () => {
    render(
      <VoiceChannelField
        value="555555555555555555"
        onChange={vi.fn()}
        options={{ status: 'ready', items }}
      />,
    );
    expect(screen.getByText('Table 2')).toBeVisible();
  });

  it('shows no voice channel when none is picked', () => {
    render(
      <VoiceChannelField value="" onChange={vi.fn()} options={{ status: 'ready', items }} />,
    );
    expect(screen.getByText('No voice channel')).toBeVisible();
  });

  it('keeps a saved channel an admin has since removed, and says so', () => {
    render(
      <VoiceChannelField
        value="999999999999999999"
        onChange={vi.fn()}
        options={{ status: 'ready', items }}
      />,
    );
    expect(screen.getByText('Saved channel (no longer in the list)')).toBeVisible();
  });

  it('points to Admin when the list is empty', () => {
    render(
      <VoiceChannelField value="" onChange={vi.fn()} options={{ status: 'empty' }} />,
    );
    expect(screen.getByText(/No voice channels are listed yet/)).toBeVisible();
    expect(screen.getByText(/Admin, Delivery, Discord settings/)).toBeVisible();
  });
});

describe('quest schema voice channel field', () => {
  const field = (mode: 'new' | 'edit') =>
    schemaForType('quest', {}, {}, mode).find((f) => f.key === 'voiceChannelId');

  it.each(['new', 'edit'] as const)('is offered when %s a quest', (mode) => {
    expect(field(mode)?.type).toBe('voicechannel');
    expect(field(mode)?.required).not.toBe(true);
  });

  it('accepts none or a Discord id and refuses anything else', () => {
    const validate = field('new')?.validate;
    expect(validate?.('')).toBeNull();
    expect(validate?.(undefined)).toBeNull();
    expect(validate?.('444444444444444444')).toBeNull();
    expect(validate?.('general')).toMatch(/voice channel/i);
  });
});
