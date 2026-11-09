// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FeatureList from './FeatureList.vue';
import ImpressumLink from './ImpressumLink.vue';
describe('FeatureList', () => {
    it('lists the three features with title and text in both languages', () => {
        const en = mount(FeatureList, { props: { locale: 'en' } });
        expect(en.findAll('.usp').map((c) => c.find('b').text())).toEqual(['Multiplayer', 'No pay to win', 'Ad-free']);
        expect(en.findAll('.usp').every((c) => c.find('span').text().length > 0)).toBe(true);
        const de = mount(FeatureList, { props: { locale: 'de' } });
        expect(de.findAll('.usp').map((c) => c.find('b').text())).toEqual(['Mehrspieler', 'Kein Pay-to-Win', 'Werbefrei']);
    });
});
describe('ImpressumLink', () => {
    it('links to /impressum', () => {
        const a = mount(ImpressumLink, { props: { locale: 'en' } }).get('a');
        expect(a.attributes('href')).toBe('/impressum');
        expect(a.text()).toBe('Impressum');
    });
});
