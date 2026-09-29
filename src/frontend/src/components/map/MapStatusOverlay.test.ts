// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import MapStatusOverlay from "./MapStatusOverlay.vue";
import { ApiError } from "../../api/client";
import { createTestI18n } from "../../test/i18n";
import enHud from "../../i18n/locales/en/hud.json";

function mountOverlay(props: {
  step: string | null;
  error: unknown | null;
  errorTitle?: string;
}) {
  return mount(MapStatusOverlay, {
    props,
    global: { plugins: [createTestI18n({ hud: enHud })] },
  });
}

describe("MapStatusOverlay", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders nothing when idle", () => {
    const wrapper = mountOverlay({ step: null, error: null });
    expect(wrapper.find('[data-testid="map-status-overlay"]').exists()).toBe(
      false,
    );
  });

  it("shows the step label as a polite status while loading", () => {
    const wrapper = mountOverlay({ step: "Joining world…", error: null });
    const root = wrapper.get('[data-testid="map-status-overlay"]');
    expect(root.attributes("data-state")).toBe("loading");
    expect(wrapper.get('[role="status"]').attributes("aria-live")).toBe(
      "polite",
    );
    expect(wrapper.text()).toContain("Joining world…");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("shows which call failed plus the detail, and emits retry on click", async () => {
    const error = new ApiError(
      503,
      { detail: "db down" },
      "GET",
      "/worlds/abc/islands",
    );
    const wrapper = mountOverlay({ step: null, error });
    expect(
      wrapper
        .get('[data-testid="map-status-overlay"]')
        .attributes("data-state"),
    ).toBe("error");
    expect(wrapper.get('[role="alert"]')).toBeTruthy();
    expect(wrapper.text()).toContain(enHud.mapStatus.errorTitle);
    expect(wrapper.text()).toContain("GET /worlds/abc/islands → 503");
    expect(wrapper.text()).toContain("db down");

    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });

  it("prefers an error over a loading step and honours a custom title", () => {
    const wrapper = mountOverlay({
      step: "Loading…",
      error: new Error("atlas failed"),
      errorTitle: "Custom",
    });
    expect(
      wrapper
        .get('[data-testid="map-status-overlay"]')
        .attributes("data-state"),
    ).toBe("error");
    expect(wrapper.text()).toContain("Custom");
    expect(wrapper.text()).toContain("atlas failed");
  });
});
