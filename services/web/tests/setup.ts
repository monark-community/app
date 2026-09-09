import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom's Blob / File don't ship `arrayBuffer()`. Polyfill so server
// actions that call `file.arrayBuffer()` (e.g. the org-logo upload)
// work in the test environment.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// jsdom has no `ResizeObserver`, which any component that measures its
// own content needs (the auth card's step transition, for one). A no-op
// stub is the right shape here : jsdom reports every box as 0x0 anyway,
// so a real implementation would observe nothing useful. Components get
// their initial measurement and simply never see a resize callback.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Strip the rendered DOM between tests so a leftover dialog / drawer
// from one test doesn't leak into the next. Testing-library handles
// this automatically when vitest's `globals` is on but the explicit
// hook makes the contract obvious + keeps it working if `globals`
// gets toggled later.
afterEach(() => {
  cleanup();
});
