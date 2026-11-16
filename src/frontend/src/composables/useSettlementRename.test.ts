// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useWorldStore } from '../stores/world';
import { createTestI18n } from '../test/i18n';
import enHud from '../i18n/locales/en/hud.json';
import { ApiError } from '../api/client';
import { useSettlementRename, type SettlementRename } from './useSettlementRename';

const renameSettlement = vi.hoisted(() => vi.fn());

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return { ...actual, DEMO_MODE: false };
});
vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { ...actual.api, renameSettlement } };
});

function setup(): { rename: SettlementRename; world: ReturnType<typeof useWorldStore> } {
  const world = useWorldStore();
  world.model.registerSettlement({
    id: 's1',
    ownerId: 'p1',
    ownerName: 'Ulf',
    name: 'Bjornstad',
    q: 0,
    r: 0,
    level: 1,
    resources: { wood: 0, stone: 0, food: 0, iron: 0 },
    rates: { wood: 0, stone: 0, food: 0, iron: 0 },
    foundedAt: Date.now(),
    islandId: 'island-home',
  });
  world.selectedSettlementId = 's1';
  world.syncHud();
  let rename!: SettlementRename;
  mount(
    defineComponent({
      setup() {
        rename = useSettlementRename();
        return () => null;
      },
    }),
    { global: { plugins: [createTestI18n({ hud: enHud })] } },
  );
  return { rename, world };
}

describe('useSettlementRename', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    renameSettlement.mockReset();
  });

  it('starts from the current name and counts its length', () => {
    const { rename } = setup();
    rename.begin();
    expect(rename.editing).toBe(true);
    expect(rename.draft).toBe('Bjornstad');
    expect(rename.counter).toBe('9 / 100');
    expect(rename.error).toBeNull();
    expect(rename.canSave).toBe(true);
  });

  it('refuses under two characters after trimming, with the error line and a disabled save', async () => {
    const { rename } = setup();
    rename.begin();
    rename.setDraft('  a ');
    expect(rename.error).toBe('At least 2 characters');
    expect(rename.canSave).toBe(false);
    expect(await rename.save()).toBe(false);
    expect(renameSettlement).not.toHaveBeenCalled();
    rename.setDraft('   ');
    expect(rename.canSave).toBe(false);
  });

  it('refuses over 100 characters', () => {
    const { rename } = setup();
    rename.begin();
    rename.setDraft('x'.repeat(101));
    expect(rename.error).toBe('At most 100 characters');
    expect(rename.canSave).toBe(false);
    rename.setDraft(' ' + 'x'.repeat(100) + ' ');
    expect(rename.canSave).toBe(true);
  });

  it('saves the trimmed name, updates the bar and the model, and closes', async () => {
    const { rename, world } = setup();
    renameSettlement.mockResolvedValue({ name: 'Nyhavn' });
    rename.begin();
    rename.setDraft('  Nyhavn ');

    expect(await rename.save()).toBe(true);

    expect(renameSettlement).toHaveBeenCalledWith('s1', 'Nyhavn', undefined);
    expect(world.hud.settlementName).toBe('Nyhavn');
    expect(world.model.getSettlement('s1')?.name).toBe('Nyhavn');
    expect(rename.editing).toBe(false);
  });

  it('locks while saving', async () => {
    const { rename } = setup();
    let resolve!: (v: { name: string }) => void;
    renameSettlement.mockReturnValue(new Promise((r) => (resolve = r)));
    rename.begin();
    rename.setDraft('Nyhavn');

    const saving = rename.save();
    expect(rename.saving).toBe(true);
    expect(rename.canSave).toBe(false);
    rename.cancel();
    expect(rename.editing).toBe(true);

    resolve({ name: 'Nyhavn' });
    await saving;
    expect(rename.saving).toBe(false);
  });

  it('stays open with the refusal when the server says no, and keeps the old name', async () => {
    const { rename, world } = setup();
    renameSettlement.mockRejectedValue(new ApiError(409, { title: 'paused', status: 409 }));
    rename.begin();
    rename.setDraft('Nyhavn');

    expect(await rename.save()).toBe(false);

    expect(rename.editing).toBe(true);
    expect(rename.error).toBe('The settlement could not be renamed.');
    expect(world.hud.settlementName).toBe('Bjornstad');
    rename.setDraft('Nyhavn2');
    expect(rename.error).toBeNull();
  });

  it('cancel closes without a request', () => {
    const { rename } = setup();
    rename.begin();
    rename.setDraft('Nyhavn');
    rename.cancel();
    expect(rename.editing).toBe(false);
    expect(renameSettlement).not.toHaveBeenCalled();
  });
});
