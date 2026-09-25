import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, beforeEach } from 'vitest';
import { useNotificationsStore } from './notifications';

describe('useNotificationsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('push adds a notification and returns its id', () => {
    const notifications = useNotificationsStore();
    const id = notifications.push('Could not queue that upgrade.');
    expect(notifications.items).toEqual([{ id, message: 'Could not queue that upgrade.' }]);
  });

  it('supports multiple concurrent notifications, each independently dismissible', () => {
    const notifications = useNotificationsStore();
    const first = notifications.push('First failure');
    const second = notifications.push('Second failure');
    expect(notifications.items).toHaveLength(2);

    notifications.dismiss(first);
    expect(notifications.items).toEqual([{ id: second, message: 'Second failure' }]);
  });

  it('dismiss is a no-op for an unknown id', () => {
    const notifications = useNotificationsStore();
    notifications.push('Still here');
    notifications.dismiss('not-a-real-id');
    expect(notifications.items).toHaveLength(1);
  });
});
