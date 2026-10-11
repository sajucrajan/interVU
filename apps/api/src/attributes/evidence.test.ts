import { describe, expect, it } from "vitest";
import { bareExtreme } from "./evidence";

describe("bareExtreme", () => {
  it("lets a middle rating through without a note", () => {
    expect(bareExtreme([{ attribute_id: "a", rating: 3 }])).toBeNull();
    expect(bareExtreme([{ attribute_id: "a", rating: 2, note: "" }])).toBeNull();
    expect(bareExtreme([{ attribute_id: "a", rating: 4, note: null }])).toBeNull();
  });

  it("lets 'not assessed' through", () => {
    expect(bareExtreme([{ attribute_id: "a", rating: null }])).toBeNull();
  });

  it("refuses a 1 or a 5 with no note, or a whitespace note", () => {
    expect(bareExtreme([{ attribute_id: "a", rating: 5 }])?.attribute_id).toBe("a");
    expect(bareExtreme([{ attribute_id: "b", rating: 1, note: "   " }])?.attribute_id).toBe("b");
  });

  it("accepts a 1 or a 5 that says what was seen", () => {
    expect(
      bareExtreme([
        { attribute_id: "a", rating: 5, note: "Credited the on-call engineer unprompted" },
        { attribute_id: "b", rating: 1, note: "Talked over the interviewer three times" },
      ]),
    ).toBeNull();
  });

  it("names the first offender in order", () => {
    const first = bareExtreme([
      { attribute_id: "ok", rating: 5, note: "seen" },
      { attribute_id: "first", rating: 1 },
      { attribute_id: "second", rating: 5 },
    ]);
    expect(first?.attribute_id).toBe("first");
  });
});
