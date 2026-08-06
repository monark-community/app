import { describe, expect, it } from "vitest";
import { isDiscordWebhookUrl } from "../src/contracts/discord";

describe("isDiscordWebhookUrl", () => {
  it("accepts a discord.com webhook URL", () => {
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/123456789/abc-DEF_123")).toBe(
      true,
    );
  });
  it("accepts the discordapp.com + versioned variants", () => {
    expect(isDiscordWebhookUrl("https://discordapp.com/api/webhooks/1/xyz")).toBe(true);
    expect(isDiscordWebhookUrl("https://discord.com/api/v10/webhooks/1/xyz")).toBe(false); // no /v10 in webhook URLs
  });
  it("rejects a non-Discord host (SSRF defence-in-depth)", () => {
    expect(isDiscordWebhookUrl("https://evil.example.com/api/webhooks/1/xyz")).toBe(false);
    expect(isDiscordWebhookUrl("http://discord.com/api/webhooks/1/xyz")).toBe(false); // http, not https
  });
  it("rejects malformed input", () => {
    expect(isDiscordWebhookUrl("not a url")).toBe(false);
    expect(isDiscordWebhookUrl("https://discord.com/api/webhooks/")).toBe(false);
  });
});
