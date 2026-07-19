import { describe, expect, it } from "vitest";
import { mergeSettingsPatch } from "./-settings-helpers";

describe("mergeSettingsPatch", () => {
  it("merges new values without dropping unrelated settings", () => {
    expect(mergeSettingsPatch({ currency: "GHS" }, { timezone: "Africa/Accra" })).toEqual({
      currency: "GHS",
      timezone: "Africa/Accra",
    });
  });

  it("deletes keys explicitly patched to null", () => {
    expect(mergeSettingsPatch({ keep: true, remove: "test" }, { remove: null })).toEqual({
      keep: true,
    });
  });
});
