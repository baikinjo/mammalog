import assert from "node:assert/strict";
import test from "node:test";
import {
  linkFamilyAccountEmail,
  refreshFamilySession,
  setFamilyPassword,
  signInFamilyAnonymously,
  signInFamilyWithPassword,
  sendFamilyLoginEmail,
  verifyFamilyEmailCode,
} from "../lib/family-repository";

test("supports email link, OTP, password login, and setting an account password", async () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const emailUser = {
    id: "user-123",
    aud: "authenticated",
    role: "authenticated",
    email: "parent@example.com",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-09-25T00:00:00.000Z",
    is_anonymous: false,
  };
  const anonymousUser = {
    ...emailUser,
    email: null,
    app_metadata: { provider: "anonymous", providers: [] },
    identities: [],
    is_anonymous: true,
  };
  let currentUser: typeof emailUser | typeof anonymousUser = anonymousUser;
  const createSession = (user: typeof emailUser | typeof anonymousUser) => ({
    access_token: `access-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: `refresh-${user.id}`,
    user,
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mammalog.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const body = typeof init?.body === "string"
      ? JSON.parse(init.body) as Record<string, unknown>
      : {};
    requests.push({ url, method, body });
    const pathname = new URL(url).pathname;
    const isVerifyRequest = pathname.endsWith("/verify");
    const isTokenRequest = pathname.endsWith("/token");
    const responseBody = isVerifyRequest
      ? { message: "Invalid token", code: "otp_expired" }
      : pathname.endsWith("/signup")
        ? createSession(anonymousUser)
        : isTokenRequest
          ? createSession(currentUser)
        : pathname.endsWith("/user")
          ? currentUser
          : {};
    return new Response(JSON.stringify(responseBody), {
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
    await signInFamilyAnonymously();
    await linkFamilyAccountEmail(" parent@example.com ", "https://mammalog.test/");
    await assert.rejects(setFamilyPassword("not-verified-yet"), /이메일 계정으로 로그인해야/);

    currentUser = emailUser;
    const refreshedAccount = await refreshFamilySession();
    assert.deepEqual(refreshedAccount, { email: "parent@example.com", isAnonymous: false });
    await signInFamilyWithPassword(" parent@example.com ", "password-for-test");
    await setFamilyPassword("a-new-test-password");

    assert.equal(new URL(requests[0].url).pathname, "/auth/v1/otp");
    assert.equal(requests[0].body.email, "parent@example.com");
    assert.equal(new URL(requests[1].url).pathname, "/auth/v1/verify");
    assert.equal(requests[1].body.email, "parent@example.com");
    assert.equal(requests[1].body.token, "123456");
    assert.equal(requests[1].body.type, "email");
    const userUpdates = requests.filter((request) =>
      new URL(request.url).pathname.endsWith("/user") && request.method === "PUT",
    );
    assert.equal(userUpdates[0].body.email, "parent@example.com");
    assert.equal(new URL(userUpdates[0].url).searchParams.get("redirect_to"), "https://mammalog.test/");
    assert.equal(userUpdates[1].body.password, "a-new-test-password");
    assert.equal(
      requests.some((request) =>
        new URL(request.url).searchParams.get("grant_type") === "password"
        && request.body.password === "password-for-test",
      ),
      true,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
});
