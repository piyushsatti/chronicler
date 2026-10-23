import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { BackstoriesPanel } from '../../../src/features/admin/components/BackstoriesPanel.js';
import { CreationCatalogPanel } from '../../../src/features/admin/components/CreationCatalogPanel.js';
import { useBackstoriesPanel } from '../../../src/features/admin/hooks/useBackstoriesPanel.js';
import { useCreationCatalogPanel } from '../../../src/features/admin/hooks/useCreationCatalogPanel.js';
import { AdminPeoplePage } from '../../../src/features/admin/pages/AdminSectionPage.js';
import { renderWithProviders } from '../../test-utils.js';
import { signIn } from './authority-test-utils.js';

function Backstories() { return <BackstoriesPanel view={useBackstoriesPanel()} />; }
function Catalog() { return <CreationCatalogPanel view={useCreationCatalogPanel()} />; }
async function choose(label: string, option: string) {
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${label}`) }));
  await userEvent.click(await screen.findByRole('menuitem', { name: option }));
  expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toHaveTextContent(option);
}
beforeEach(() => signIn());

it('keeps catalog region filtering and optional introduced-by region choices', async () => {
  renderWithProviders(<Catalog />);
  await choose('Region filter', 'Lightfall');
  await userEvent.click(screen.getByRole('button', { name: 'New option' }));
  await choose('Introduced by region', 'Lightfall');
  await choose('Introduced by region', 'None');
});

it('keeps backstory region filtering and source region choices', async () => {
  renderWithProviders(<Backstories />);
  await choose('Region filter', 'Lightfall');
  await userEvent.click(screen.getByRole('button', { name: 'New backstory' }));
  await choose('Source region', 'Lightfall');
  await choose('Source region', 'Select…');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('uses the base-role menu to mark a bulk role choice as changed', async () => {
  renderWithProviders(<AdminPeoplePage />, { route: '/admin/people' });
  await userEvent.click(await screen.findByRole('checkbox', { name: 'Select Mira' }));
  await choose('Base role', 'Spectator');
  expect(screen.getByRole('button', { name: 'Apply roles to selection' })).toBeEnabled();
});
