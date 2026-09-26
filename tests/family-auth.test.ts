import assert from "node:assert/strict";
import test from "node:test";
import {
  sendFamilyLoginEmail,
  verifyFamilyEmailCode,
} from "../lib/family-repository";

test("sends and verifies an email OTP for Home Screen app login", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mammalog.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = typeof init?.body === "string"
      ? JSON.parse(init.body) as Record<string, unknown>
      : {};
    requests.push({ url, body });
    const isVerifyRequest = url.endsWith("/verify");
    return new Response(JSON.stringify(isVerifyRequest
      ? { message: "Invalid token", code: "otp_expired" }
      : {}), {
      status: isVerifyRequest ? 400 : 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await sendFamilyLoginEmail(" parent@example.com ", "https://mammalog.test/");
    await assert.rejects(
      verifyFamilyEmailCode(" parent@example.com ", "123456"),
      /invalid token/i,
    );

    assert.equal(requests.length, 2);
    assert.equal(new URL(requests[0].url).pathname, "/auth/v1/otp");
    assert.equal(requests[0].body.email, "parent@example.com");
    assert.equal(new URL(requests[1].url).pathname, "/auth/v1/verify");
    assert.equal(requests[1].body.email, "parent@example.com");
    assert.equal(requests[1].body.token, "123456");
    assert.equal(requests[1].body.type, "email");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
