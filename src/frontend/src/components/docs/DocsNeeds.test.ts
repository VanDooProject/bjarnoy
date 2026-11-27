// @vitest-environment jsdom
//
// DocsNeeds: a building's prerequisites in a docs table cell — the plain ones first, then what another soil needs instead.
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import DocsNeeds from "./DocsNeeds.vue";
import { useBuildingCatalogueStore } from "../../stores/buildingCatalogue";
import catalogue from "../../data/building-catalogue.json";
import type {
  BuildingDefinitionResponse,
  BuildingPrerequisiteResponse,
} from "../../api/types";
import { createTestI18n } from "../../test/i18n";
import enDocs from "../../i18n/locales/en/docs.json";
import deDocs from "../../i18n/locales/de/docs.json";

function render(
  needs: BuildingPrerequisiteResponse[],
  bullet = false,
  docs: unknown = enDocs,
): string {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/docs/tech-tree", component: { template: "<div />" } },
    ],
  });
  const wrapper = mount(
    defineComponent({
      render: () => h("div", [h(DocsNeeds, { needs, bullet })]),
    }),
    {
      global: { plugins: [createTestI18n({ docs }), router] },
    },
  );
  return wrapper.text().replace(/\s+/g, " ").trim();
}

describe("DocsNeeds", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useBuildingCatalogueStore().definitions =
      catalogue.data as BuildingDefinitionResponse[];
  });

  it("lists what every island needs as plain entries", () => {
    expect(render([{ type: "harbour", level: 10 }])).toBe("Harbour 10");
  });

  it("reads the wheat prerequisite as the plain one and puts the pumpkin one in brackets", () => {
    const text = render([
      { type: "cropmill", level: 5, soil: "wheat" },
      { type: "pumpkinfarm", level: 15, soil: "pumpkin" },
    ]);
    expect(text).toBe("Crop Mill 5 (pumpkin soil: Pumpkin Farm 15)");
  });

  it("prefixes each part with a bullet in a cell that already holds another entry", () => {
    const text = render(
      [
        { type: "farm", level: 5, soil: "wheat" },
        { type: "pumpkinfarm", level: 5, soil: "pumpkin" },
      ],
      true,
    );
    expect(text).toBe("· Farm 5 · (pumpkin soil: Pumpkin Farm 5)");
  });

  it("words the variant in German", () => {
    const text = render(
      [
        { type: "cropmill", level: 5, soil: "wheat" },
        { type: "pumpkinfarm", level: 15, soil: "pumpkin" },
      ],
      false,
      deDocs,
    );
    expect(text).toContain("(auf Kürbisboden:");
  });
});
