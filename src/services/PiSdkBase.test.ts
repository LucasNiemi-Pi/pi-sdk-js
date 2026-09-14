import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PiSdkBase } from "./PiSdkBase";
import { PiSdkError } from "./PiSdkError";

const authResponse = {
  accessToken: "access-token",
  user: { uid: "user-id", username: "demo" },
};

function createPiMock() {
  return {
    authenticate: vi.fn().mockResolvedValue(authResponse),
    createPayment: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
  };
}

function mockFetch(data: unknown = { result: "ok" }, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: () => Promise.resolve(data),
    ok,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PiSdkBase", () => {
  beforeEach(() => {
    PiSdkBase.accessToken = null;
    PiSdkBase.connected = false;
    PiSdkBase.paymentBasePath = "tbd";
    PiSdkBase.scopes = ["payments", "username"];
    PiSdkBase.grantedScopes = [];
    PiSdkBase.user = null;
    PiSdkBase.version = "2.0";
    (window as any).Pi = undefined;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("throws a typed error when the Pi browser SDK is missing", async () => {
    await expect(new PiSdkBase().authenticate()).rejects.toMatchObject({
      code: "PI_SDK_NOT_LOADED",
      message: "Pi SDK not loaded.",
    });
    expect(console.error).toHaveBeenCalledWith("[PiSDK]", "Pi SDK not loaded.");
  });

  test("initializes before authentication", async () => {
    let initialized = false;
    const fakePi = createPiMock();
    fakePi.init.mockImplementation(async () => {
      await Promise.resolve();
      initialized = true;
    });
    fakePi.authenticate.mockImplementation(async () => {
      expect(initialized).toBe(true);
      return authResponse;
    });
    (window as any).Pi = fakePi;

    const result = await new PiSdkBase().authenticate();

    expect(fakePi.init).toHaveBeenCalledWith({ version: "2.0" });
    expect(fakePi.authenticate).toHaveBeenCalledWith(
      ["payments", "username"],
      PiSdkBase.onIncompletePaymentFound,
    );
    // Pi's own authenticate() response uses `uid`; connect() remaps it to
    // `user_uid` before returning — result is not the raw mock.
    expect(result).toEqual({
      accessToken: "access-token",
      user: { user_uid: "user-id", username: "demo" },
    });
    expect(PiSdkBase.connected).toBe(true);
  });

  test("requests the scopes the consumer configured", async () => {
    const fakePi = createPiMock();
    (window as any).Pi = fakePi;

    await new PiSdkBase({
      scopes: ["payments", "username", "wallet_address"],
    }).authenticate();

    expect(fakePi.authenticate).toHaveBeenCalledWith(
      ["payments", "username", "wallet_address"],
      PiSdkBase.onIncompletePaymentFound,
    );
  });

  test("re-authenticates when the configured scopes widen past the session", async () => {
    const fakePi = createPiMock();
    (window as any).Pi = fakePi;

    await new PiSdkBase().authenticate();
    // A2U needs wallet_address; the cached session predates it and cannot pay out.
    await new PiSdkBase({
      scopes: ["payments", "username", "wallet_address"],
    }).authenticate();

    expect(fakePi.authenticate).toHaveBeenCalledTimes(2);
    expect(fakePi.authenticate).toHaveBeenLastCalledWith(
      ["payments", "username", "wallet_address"],
      PiSdkBase.onIncompletePaymentFound,
    );
  });

  test("re-authenticates when Pi granted less than was requested", async () => {
    const fakePi = createPiMock();
    fakePi.authenticate.mockResolvedValue({
      accessToken: "access-token",
      user: {
        uid: "user-id",
        username: "demo",
        credentials: { scopes: ["username"] },
      },
    });
    (window as any).Pi = fakePi;

    const sdk = new PiSdkBase();
    await sdk.authenticate();
    await sdk.authenticate();

    expect(fakePi.authenticate).toHaveBeenCalledTimes(2);
  });

  test("reuses the session when Pi granted every requested scope", async () => {
    const fakePi = createPiMock();
    fakePi.authenticate.mockResolvedValue({
      accessToken: "access-token",
      user: {
        uid: "user-id",
        username: "demo",
        credentials: { scopes: ["payments", "username", "wallet_address"] },
      },
    });
    (window as any).Pi = fakePi;

    const sdk = new PiSdkBase({ scopes: ["payments", "wallet_address"] });
    await sdk.authenticate();
    await sdk.authenticate();

    expect(fakePi.authenticate).toHaveBeenCalledTimes(1);
  });

  test("passes Pi's credentials through the remap unchanged", async () => {
    const credentials = {
      scopes: ["payments", "username"],
      valid_until: { timestamp: 9999999999, iso8601: "2286-11-20T17:46:39Z" },
    };
    const fakePi = createPiMock();
    fakePi.authenticate.mockResolvedValue({
      accessToken: "access-token",
      user: { uid: "user-id", username: "demo", credentials },
    });
    (window as any).Pi = fakePi;

    const result = await new PiSdkBase().authenticate();

    expect(result).toEqual({
      accessToken: "access-token",
      user: { user_uid: "user-id", username: "demo", credentials },
    });
  });

  test("omits credentials entirely when Pi's response doesn't include it", async () => {
    const fakePi = createPiMock();
    fakePi.authenticate.mockResolvedValue(authResponse); // no `credentials` key
    (window as any).Pi = fakePi;

    const result = await new PiSdkBase().authenticate();

    expect(result.user).not.toHaveProperty("credentials");
  });

  test("only calls Pi init and auth once across parallel authenticate calls", async () => {
    const fakePi = createPiMock();
    (window as any).Pi = fakePi;

    const sdk = new PiSdkBase();

    const [first, , third] = await Promise.all([
      sdk.authenticate(),
      sdk.authenticate(),
      sdk.authenticate(),
    ]);

    expect(fakePi.init).toHaveBeenCalledTimes(1);
    expect(fakePi.authenticate).toHaveBeenCalledTimes(1);
    // The 2nd/3rd calls take the cached fast path (PiSdkBase.ts:78-84),
    // returning the already-remapped user rather than re-deriving it --
    // confirm the cache serves the correct remapped shape, not just "a" cache.
    expect(third).toEqual(first);
    expect(first.user).toEqual({ user_uid: "user-id", username: "demo" });
  });

  test("throws a typed error when auth fails", async () => {
    const authError = new Error("denied");
    const fakePi = createPiMock();
    fakePi.authenticate.mockRejectedValue(authError);
    (window as any).Pi = fakePi;

    await expect(new PiSdkBase().authenticate()).rejects.toMatchObject({
      cause: authError,
      code: "AUTH_FAILED",
      message: "Auth failed",
    });
    expect(PiSdkBase.connected).toBe(false);
  });

  test("exposes connection state as fields, not accessor methods", () => {
    expect(PiSdkBase.connected).toBe(false);
    expect(PiSdkBase.user).toBeNull();
    expect("get_connected" in PiSdkBase).toBe(false);
    expect("get_user" in PiSdkBase).toBe(false);
  });

  test.each([
    {
      body: { accessToken: "access-token", payment_id: "payment-id" },
      call: () =>
        PiSdkBase.onReadyForServerApproval("payment-id", "access-token"),
      path: "approve",
    },
    {
      body: { payment_id: "payment-id", transaction_id: "tx-id" },
      call: () =>
        PiSdkBase.onReadyForServerCompletion("payment-id", "tx-id"),
      path: "complete",
    },
    {
      body: { payment_id: "payment-id" },
      call: () => PiSdkBase.onCancel("payment-id"),
      path: "cancel",
    },
    {
      body: { error: "cancelled by user", payment_id: "payment-id" },
      call: () =>
        PiSdkBase.onError(new Error("cancelled by user"), {
          identifier: "payment-id",
        }),
      path: "error",
    },
  ])("posts $path payloads", async ({ body, call, path }) => {
    const fetchMock = mockFetch();
    new PiSdkBase({ paymentBasePath: "/pi_payment" });

    await call();

    expect(fetchMock).toHaveBeenCalledWith(`/pi_payment/${path}`, {
      body: JSON.stringify(body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  test("posts incomplete payloads with a nullable transaction id", async () => {
    const fetchMock = mockFetch();
    new PiSdkBase({ paymentBasePath: "/pi_payment" });

    await PiSdkBase.onIncompletePaymentFound({ identifier: "payment-id" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/pi_payment/incomplete",
      expect.objectContaining({
        body: JSON.stringify({ payment_id: "payment-id", transaction_id: null }),
      }),
    );
  });

  test("auto-detects Next.js payment base path", () => {
    (window as { __NEXT_DATA__?: object }).__NEXT_DATA__ = {};
    PiSdkBase.checkPaymentBasePath();
    expect(PiSdkBase.paymentBasePath).toBe("api/pi_payment");
  });

  test("throws a typed server error when lifecycle post fails", async () => {
    mockFetch({ error: "bad request" }, false);
    new PiSdkBase({ paymentBasePath: "/pi_payment" });

    await expect(PiSdkBase.onCancel("payment-id")).rejects.toMatchObject({
      cause: { error: "bad request" },
      code: "SERVER_REQUEST_FAILED",
    });
  });

  test("throws a typed error when creating payment before auth", () => {
    expect(() =>
      new PiSdkBase().createPayment({
        amount: 1,
        memo: "memo",
        metadata: { productId: "product-id" },
      }),
    ).toThrow(PiSdkError);
  });

  test("rejects invalid payment data", () => {
    (window as any).Pi = createPiMock();
    PiSdkBase.connected = true;

    expect(() =>
      new PiSdkBase().createPayment({
        amount: 1,
        memo: "memo",
        metadata: {},
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_PAYMENT_DATA" }),
    );
  });

  test("passes payment callbacks to the Pi browser SDK", () => {
    const fakePi = createPiMock();
    (window as any).Pi = fakePi;
    PiSdkBase.connected = true;
    PiSdkBase.accessToken = "access-token";

    const paymentData = {
      amount: 1,
      memo: "memo",
      metadata: { productId: "product-id" },
    };

    new PiSdkBase().createPayment(paymentData);

    expect(fakePi.createPayment).toHaveBeenCalledWith(paymentData, {
      onCancel: PiSdkBase.onCancel,
      onError: PiSdkBase.onError,
      onIncompletePaymentFound: PiSdkBase.onIncompletePaymentFound,
      onReadyForServerApproval: expect.any(Function),
      onReadyForServerCompletion: PiSdkBase.onReadyForServerCompletion,
    });
  });
});
