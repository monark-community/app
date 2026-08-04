import { describe, expect, it } from "vitest";
import { NODE_SLUG_RE, slugifyLabel, uniqueNodeSlug } from "../src/contracts/slug";

describe("slugifyLabel", () => {
  it("lowercases and underscores a human label", () => {
    expect(slugifyLabel("Find Record")).toBe("find_record");
    expect(slugifyLabel("Send Email!")).toBe("send_email");
    expect(slugifyLabel("Create   Record")).toBe("create_record");
  });

  it("trims leading/trailing separators and collapses runs", () => {
    expect(slugifyLabel("  Hello -- World  ")).toBe("hello_world");
    expect(slugifyLabel("A/B/C")).toBe("a_b_c");
  });

  it("guarantees a letter-leading, non-empty identifier", () => {
    expect(slugifyLabel("123")).toBe("n_123");
    expect(slugifyLabel("!!!")).toBe("n_");
    expect(slugifyLabel("")).toBe("n_");
  });

  it("always produces a valid slug", () => {
    for (const label of ["Find Record", "9 Lives", "  ", "Über Node", "x".repeat(80)]) {
      expect(NODE_SLUG_RE.test(slugifyLabel(label))).toBe(true);
    }
  });
});

describe("uniqueNodeSlug", () => {
  it("returns the base when it is free", () => {
    expect(uniqueNodeSlug("find_record", ["other"])).toBe("find_record");
  });

  it("suffixes _2, _3 … on collision", () => {
    expect(uniqueNodeSlug("find_record", ["find_record"])).toBe("find_record_2");
    expect(uniqueNodeSlug("find_record", ["find_record", "find_record_2"])).toBe("find_record_3");
  });
});
