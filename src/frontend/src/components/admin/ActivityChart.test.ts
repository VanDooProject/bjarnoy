// @vitest-environment jsdom
//
// jsdom implements neither a canvas 2D context nor ResizeObserver, and
// Chart.js's responsive-attach/detach tracking additionally drives a real
// MutationObserver on `document` — all three are stubbed with just enough
// surface for Chart.js's construction/render/destroy path to run without
// throwing. The 2D context mock must return an object whose `.canvas` is
// the exact element `getContext` was called on — Chart.js's own sanity
// check (`context.canvas === canvas`) silently aborts construction
// otherwise, which is easy to get wrong with a single shared mock object.
// No precedent for this elsewhere in the repo (no other component renders
// a <canvas>), so this is written from scratch.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { Line } from 'vue-chartjs';
import ActivityChart from './ActivityChart.vue';
import type { ActivityBucket } from '../../api/types';

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);

  // Chart.js's attach/detach tracking uses a real MutationObserver whose
  // queued records don't reliably survive jsdom's mount/unmount teardown
  // (the canvas gets nulled by `chart.destroy()` a tick before jsdom would
  // deliver the "detach" record, throwing from a stale callback afterwards).
  // Stubbing it out removes that async path — the initial attach/detach
  // state Chart.js needs is still read synchronously at bind time, so this
  // doesn't affect anything under test here (the chart's rendered data).
  class MutationObserverStub {
    observe() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('MutationObserver', MutationObserverStub);

  const context2d = {
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: [] })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  // Chart.js's context-acquisition sanity check requires `context.canvas`
  // to be the exact element `getContext` was called on — a single shared
  // mock object would fail that check (`context.canvas !== canvas`) and
  // silently abort chart construction, so build a fresh one per canvas.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ): unknown {
    return { ...context2d, canvas: this };
  } as typeof HTMLCanvasElement.prototype.getContext);
});

function bucket(bucketStart: string, activeUserCount: number): ActivityBucket {
  return { bucketStart, activeUserCount };
}

// Chart.js needs the canvas attached to a real document (it reads computed
// style off it), so every mount here uses `attachTo: document.body` and is
// explicitly unmounted at the end of the test.
describe('ActivityChart', () => {
  it('renders a chart with the given buckets as line data', () => {
    const buckets = [bucket('2026-08-01T00:00:00Z', 3), bucket('2026-08-02T00:00:00Z', 7)];
    const wrapper = mount(ActivityChart, { props: { buckets, bucketUnit: 'day' } });

    const line = wrapper.findComponent(Line);
    expect(line.exists()).toBe(true);
    expect(line.props('data').datasets[0].data).toEqual([3, 7]);
    expect(line.props('data').labels).toHaveLength(2);
    wrapper.unmount();
  });

  it('shows an empty state instead of a chart when there are no buckets', () => {
    const wrapper = mount(ActivityChart, { props: { buckets: [] } });

    expect(wrapper.findComponent(Line).exists()).toBe(false);
    expect(wrapper.text()).toContain('No activity data');
    wrapper.unmount();
  });

  it('updates the chart data when the buckets prop changes', async () => {
    const wrapper = mount(ActivityChart, { props: { buckets: [bucket('2026-08-01T00:00:00Z', 1)] } });

    await wrapper.setProps({ buckets: [bucket('2026-08-01T00:00:00Z', 1), bucket('2026-08-02T00:00:00Z', 9)] });

    const line = wrapper.findComponent(Line);
    expect(line.props('data').datasets[0].data).toEqual([1, 9]);

    // vue-chartjs's own prop watcher schedules the underlying chart's
    // `update()` via an extra, un-awaited `nextTick()` beyond the one
    // `setProps` already waits for — unmounting (and destroying the chart)
    // before that fires races Chart.js's internals against a canvas it has
    // already nulled out. Flush it out here while the chart is still alive.
    await flushPromises();
    wrapper.unmount();
  });

  it('formats hour-bucket labels differently from day buckets', () => {
    const buckets = [bucket('2026-08-01T14:00:00Z', 5)];
    const dayWrapper = mount(ActivityChart, { props: { buckets, bucketUnit: 'day' } });
    const hourWrapper = mount(ActivityChart, { props: { buckets, bucketUnit: 'hour' } });

    const dayLabel: unknown = dayWrapper.findComponent(Line).props('data').labels?.[0];
    const hourLabel: unknown = hourWrapper.findComponent(Line).props('data').labels?.[0];
    expect(dayLabel).not.toEqual(hourLabel);
    dayWrapper.unmount();
    hourWrapper.unmount();
  });
});
