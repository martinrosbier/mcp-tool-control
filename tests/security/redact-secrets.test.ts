import { describe, it, expect } from "vitest";
import { redactSecrets } from "../../src/utils/security";

describe("redactSecrets()", () => {
  it("redacts generic sk- keys", () => {
    const input =
      "Auth failed for sk-abcdefghijklmnopqrstuvwxyz0123456789 — check key";
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("redacts project-scoped sk-proj- keys", () => {
    const input = "Bad key: sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAA was rejected";
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  it("redacts Anthropic sk-ant- keys", () => {
    const input =
      "Authentication error with sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_ABC at line 1";
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain(
      "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_ABC"
    );
  });

  it("redacts Bearer tokens", () => {
    const input =
      'Upstream returned 401 for header "Authorization: Bearer abc123DEF456ghi789JKL"';
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("Bearer abc123DEF456ghi789JKL");
  });

  it("leaves non-secret text untouched", () => {
    const input = "request_id=12345 status=429 message=rate limit exceeded";
    expect(redactSecrets(input)).toBe(input);
  });

  it("handles empty strings safely", () => {
    expect(redactSecrets("")).toBe("");
  });

  it("redacts multiple secrets in the same string", () => {
    const input =
      "Tried sk-abcdefghijklmnopqrstuvwxyz0123456789 then Bearer xyz123ABC456def789GHI; both failed.";
    const out = redactSecrets(input);
    const matches = out.match(/\[REDACTED\]/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
