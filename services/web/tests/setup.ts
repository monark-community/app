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

// Strip the rendered DOM between tests so a leftover dialog / drawer
// from one test doesn't leak into the next. Testing-library handles
// this automatically when vitest's `globals` is on but the explicit
// hook makes the contract obvious + keeps it working if `globals`
// gets toggled later.
afterEach(() => {
  cleanup();
});
