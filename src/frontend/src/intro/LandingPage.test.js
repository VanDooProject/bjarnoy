// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import LandingPage from './LandingPage.vue';
const mountPage = (props = {}) => mount(LandingPage, { props: { locale: 'en', loadFraction: 0, ...props } });
const map = (w) => w.get('[data-testid="landing-map"]');
describe('LandingPage', () => {
    it('shows the title, the tagline and the three feature rows in English and German', () => {
        const en = mountPage();
        expect(en.get('h1').text()).toBe('BJARNØY');
        expect(en.text()).toContain('A saga of the north, played together.');
        expect(en.findAll('.usp').map((c) => c.find('b').text())).toEqual(['Multiplayer', 'No pay to win', 'Ad-free']);
        const de = mountPage({ locale: 'de' });
        expect(de.get('h1').text()).toBe('BJARNØY');
        expect(de.findAll('.usp').map((c) => c.find('b').text())).toEqual(['Mehrspieler', 'Kein Pay-to-Win', 'Werbefrei']);
        expect(de.get('[data-testid="landing-hear"]').text()).toBe('Saga anhören');
        expect(de.get('[data-testid="landing-muted"]').text()).toBe('oder ohne Ton abspielen');
    });
    it('renders the Impressum link in both languages', () => {
        const en = mountPage().get('[data-testid="landing-impressum"]');
        expect(en.attributes('href')).toBe('/impressum');
        expect(en.text()).toBe('Impressum');
        expect(mountPage({ locale: 'de' }).get('[data-testid="landing-impressum"]').text()).toBe('Impressum');
    });
    it('emits hear and muted from the two saga buttons', async () => {
        const w = mountPage();
        await w.get('[data-testid="landing-hear"]').trigger('click');
        await w.get('[data-testid="landing-muted"]').trigger('click');
        expect(w.emitted('hear')).toHaveLength(1);
        expect(w.emitted('muted')).toHaveLength(1);
    });
    it('shows the load percentage and the progress bar while loading', () => {
        const w = mountPage({ loadFraction: 0.624 });
        expect(map(w).attributes('data-load-state')).toBe('loading');
        expect(map(w).text()).toBe('Go to the map · loading 62 %');
        expect(w.get('.bar').attributes('style')).toContain('width: 62%');
        expect(w.find('.rtag').exists()).toBe(false);
    });
    it('shows the ready bubble and no bar once loaded', () => {
        const w = mountPage({ loadFraction: 1, locale: 'de' });
        expect(map(w).attributes('data-load-state')).toBe('ready');
        expect(map(w).text()).toBe('Zur Karte bereit');
        expect(w.get('.bar').attributes('style')).toContain('width: 0%');
    });
    it('opens the map at once when ready', async () => {
        const w = mountPage({ loadFraction: 1 });
        await map(w).trigger('click');
        expect(w.emitted('map')).toHaveLength(1);
    });
    it('arms while loading (label and state), opens when loading completes, and disarms on a second click', async () => {
        const w = mountPage({ loadFraction: 0.3 });
        await map(w).trigger('click');
        expect(map(w).attributes('data-load-state')).toBe('armed');
        expect(map(w).text()).toBe('Opens when loaded · 30 %');
        await map(w).trigger('click');
        expect(map(w).attributes('data-load-state')).toBe('loading');
        await map(w).trigger('click');
        await w.setProps({ loadFraction: 1 });
        expect(w.emitted('map')).toHaveLength(1);
    });
    it('does not open the map on its own when loading completes unarmed', async () => {
        const w = mountPage({ loadFraction: 0.3 });
        await w.setProps({ loadFraction: 1 });
        expect(w.emitted('map')).toBeUndefined();
    });
});
