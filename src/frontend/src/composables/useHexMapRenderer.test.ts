// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";

// HexMapRenderer needs Pixi + a real GPU context; the composable's mount/
// retry orchestration is what's under test here, so the renderer is a fake
// whose mount() outcome each test scripts.
const mountResults: Array<Error | null> = [];
const instances: Array<{
  mount: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("../lib/map/HexMapRenderer", () => ({
  READY_LOAD_STATE: { phase: "ready" },
  HexMapRenderer: class {
    mount = vi.fn(async () => {
      const failure = mountResults.shift();
      if (failure) throw failure;
    });
    destroy = vi.fn();
    resize = vi.fn();
    setAnimationsEnabled = vi.fn();
    constructor() {
      instances.push(this);
    }
  },
}));

import { useHexMapRenderer } from "./useHexMapRenderer";

function mountHost(mode: "settlement" | "world" = "settlement") {
  let api!: ReturnType<typeof useHexMapRenderer>;
  const container = ref<HTMLElement | null>(null);
  const canvas = ref<HTMLCanvasElement | null>(null);
  const Host = defineComponent({
    setup() {
      api = useHexMapRenderer(canvas, container, { mode } as never);
      return () => h("div", { ref: container }, [h("canvas", { ref: canvas })]);
    },
  });
  const wrapper = mount(Host, { attachTo: document.body });
  return { wrapper, api, container };
}

async function flush() {
  // waitForRealSize polls requestAnimationFrame while the jsdom box is 0x0.
  for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 5));
}

describe("useHexMapRenderer mount failure + retry", () => {
  beforeEach(() => {
    mountResults.length = 0;
    instances.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes the error (and destroys the half-built renderer) when mount rejects", async () => {
    const boom = new Error("atlas failed");
    mountResults.push(boom);
    const { wrapper, api, container } = mountHost();
    await flush();

    expect(api.mountError.value).toBe(boom);
    expect(api.renderer.value).toBeNull();
    expect(instances[0]!.destroy).toHaveBeenCalled();
    expect(container.value!.dataset.mapReady).toBeUndefined();
    wrapper.unmount();
  });

  it("retry() re-runs the mount, clears the error and marks the map ready on success", async () => {
    mountResults.push(new Error("atlas failed"), null);
    const { wrapper, api, container } = mountHost();
    await flush();
    expect(api.mountError.value).not.toBeNull();

    await api.retry();

    expect(instances).toHaveLength(2);
    expect(api.mountError.value).toBeNull();
    expect(api.renderer.value).toBe(instances[1]);
    expect(container.value!.dataset.mapReady).toBe("true");
    wrapper.unmount();
    expect(instances[1]!.destroy).toHaveBeenCalled();
  });

  it("retry() can fail again and surfaces the new error", async () => {
    const second = new Error("still down");
    mountResults.push(new Error("first"), second);
    const { wrapper, api } = mountHost();
    await flush();
    await api.retry();
    expect(api.mountError.value).toBe(second);
    wrapper.unmount();
  });
});
