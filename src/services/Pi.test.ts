import { beforeEach, describe, expect, test, vi } from "vitest";
import { Pi, loadPi } from "./Pi";
import { PiSdkError } from "./PiSdkError";
import type { PaymentCallbacks, PaymentData } from "./types";

const SCRIPT_URL = "https://sdk.minepi.com/pi-sdk.js";

function platformStub() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn().mockResolvedValue({
      accessToken: "token",
      user: { app_id: 1, uid: "u1", credentials: { scopes: [], valid_until: {} } },
    }),
    createPayment: vi.fn().mockReturnValue({ identifier: "p1" }),
    signIn: vi.fn(),
    Ads: {
      showAd: vi.fn().mockResolvedValue({ success: true, type: "rewarded", result: "AD_REWARDED" }),
      isAdReady: vi.fn().mockResolvedValue({ success: true, type: "rewarded", ready: true }),
      requestAd: vi.fn().mockResolvedValue({ success: true, type: "rewarded", result: "AD_LOADED" }),
    },
    nativeFeaturesList: vi.fn().mockResolvedValue(["ad_network"]),
    openShareDialog: vi.fn().mockResolvedValue(undefined),
    openUrlInSystemBrowser: vi.fn().mockResolvedValue(undefined),
    copyText: vi.fn().mockResolvedValue(undefined),
    openConversation: vi.fn().mockResolvedValue(undefined),
    requestPermission: vi.fn().mockResolvedValue(true),
  };
}

// Stands in for the browser: appending the tag publishes window.Pi, then fires load.
function autoLoadScripts(onAppend: () => void) {
  const add = document.head.appendChild.bind(document.head);
  const append = vi.spyOn(document.head, "appendChild");
  append.mockImplementation(((tag: HTMLScriptElement) => {
    const added = add(tag);
    onAppend();
    queueMicrotask(() => tag.dispatchEvent(new Event("load")));
    return added;
  }) as typeof document.head.appendChild);
  return append;
}

const V2 = { version: "2.0" } as const;

beforeEach(() => {
  vi.restoreAllMocks();
  delete window.Pi;
  document.head.innerHTML = "";
});

describe("initialization", () => {
  test("constructor options initialize the platform SDK", async () => {
    const pi = platformStub();
    autoLoadScripts(() => {
      window.Pi = pi as never;
    });

    await loadPi(V2);

    expect(pi.init).toHaveBeenCalledWith(V2);
  });

  test("init() initializes an instance constructed without options", async () => {
    const pi = platformStub();
    window.Pi = pi as never;

    const sdk = new Pi();
    await sdk.init(V2);

    expect(pi.init).toHaveBeenCalledWith(V2);
  });

  test("repeating init with the same options does not initialize twice", async () => {
    const pi = platformStub();
    window.Pi = pi as never;

    const sdk = await loadPi(V2);
    await sdk.init(V2);

    expect(pi.init).toHaveBeenCalledTimes(1);
  });

  test("passes the v2 sandbox flag straight through", async () => {
    const pi = platformStub();
    window.Pi = pi as never;

    await loadPi({ version: "2.0", sandbox: true });

    expect(pi.init).toHaveBeenCalledWith({ version: "2.0", sandbox: true });
  });

  test("the same options in a different key order are not a conflict", async () => {
    const pi = platformStub();
    window.Pi = pi as never;

    const sdk = await loadPi({ version: "2.0", sandbox: true });
    await sdk.init({ sandbox: true, version: "2.0" });

    expect(pi.init).toHaveBeenCalledTimes(1);
  });

  test("a failed platform init can be retried", async () => {
    const pi = platformStub();
    pi.init.mockRejectedValueOnce(new Error("host refused"));
    window.Pi = pi as never;

    const sdk = new Pi();
    await expect(sdk.init(V2)).rejects.toThrow("host refused");
    await sdk.init(V2);

    expect(pi.init).toHaveBeenCalledTimes(2);
  });

  test("init with different options throws rather than silently keeping the first", async () => {
    window.Pi = platformStub() as never;

    const sdk = await loadPi(V2);

    expect(() => sdk.init({ version: "3.0" })).toThrow(PiSdkError);
  });

  test("loadPi rejects when the platform SDK fails to initialize", async () => {
    const pi = platformStub();
    pi.init.mockRejectedValue(new Error("host refused"));
    window.Pi = pi as never;

    await expect(loadPi(V2)).rejects.toThrow("host refused");
  });

  test("an async method before init reports NOT_INITIALIZED", async () => {
    window.Pi = platformStub() as never;

    await expect(new Pi().nativeFeaturesList()).rejects.toMatchObject({
      code: "NOT_INITIALIZED",
    });
  });
});

describe("script loading", () => {
  test("injects the script tag when window.Pi is absent", async () => {
    const pi = platformStub();
    autoLoadScripts(() => {
      window.Pi = pi as never;
    });

    await loadPi(V2);

    expect(document.querySelector(`script[src="${SCRIPT_URL}"]`)).not.toBeNull();
  });

  test("reuses an existing window.Pi instead of injecting", async () => {
    const append = autoLoadScripts(() => {});
    window.Pi = platformStub() as never;

    await loadPi(V2);

    expect(append).not.toHaveBeenCalled();
  });

  test("waits for a script tag the page already added rather than adding a second", async () => {
    const append = autoLoadScripts(() => {});
    const tag = document.createElement("script");
    tag.src = SCRIPT_URL;
    document.head.append(tag);
    append.mockClear();

    const loaded = loadPi(V2);
    window.Pi = platformStub() as never;
    tag.dispatchEvent(new Event("load"));
    await loaded;

    expect(append).not.toHaveBeenCalled();
    expect(document.querySelectorAll(`script[src="${SCRIPT_URL}"]`)).toHaveLength(1);
  });

  test("reuses a script tag that carries a query string", async () => {
    const append = autoLoadScripts(() => {});
    const existing = document.createElement("script");
    existing.src = `${SCRIPT_URL}?foo=1`;
    document.head.append(existing);
    append.mockClear();

    const loaded = loadPi(V2);
    window.Pi = platformStub() as never;
    existing.dispatchEvent(new Event("load"));
    await loaded;

    expect(append).not.toHaveBeenCalled();
    expect(
      document.querySelectorAll(`script[src^="${SCRIPT_URL}"]`),
    ).toHaveLength(1);
  });

  test("a failed load can be retried rather than staying rejected", async () => {
    await expect(loadPi(V2, { inject: false })).rejects.toMatchObject({
      code: "PI_SDK_NOT_LOADED",
    });

    const sdk = new Pi({ inject: false });
    await expect(sdk.init(V2)).rejects.toThrow();

    const pi = platformStub();
    window.Pi = pi as never;
    await sdk.init(V2);

    expect(pi.init).toHaveBeenCalledWith(V2);
  });

  test("honours a custom script url", async () => {
    const custom = "https://cdn.example.com/pi-sdk.js";
    autoLoadScripts(() => {
      window.Pi = platformStub() as never;
    });

    await loadPi(V2, { url: custom });

    expect(document.querySelector(`script[src="${custom}"]`)).not.toBeNull();
  });

  test("reports a missing SDK when injection is turned off", async () => {
    await expect(loadPi(V2, { inject: false })).rejects.toMatchObject({
      code: "PI_SDK_NOT_LOADED",
    });
  });

  test("reports a script that loads without publishing window.Pi", async () => {
    autoLoadScripts(() => {});

    await expect(loadPi(V2)).rejects.toMatchObject({
      code: "PI_SDK_NOT_LOADED",
    });
  });
});

describe("delegation", () => {
  let pi: ReturnType<typeof platformStub>;
  let sdk: Pi;

  beforeEach(async () => {
    pi = platformStub();
    window.Pi = pi as never;
    sdk = await loadPi(V2);
  });

  test("authenticate passes the scopes and callback through", async () => {
    const onIncomplete = vi.fn();

    const result = await sdk.authenticate(["payments", "username"], onIncomplete);

    expect(pi.authenticate).toHaveBeenCalledWith(["payments", "username"], onIncomplete);
    expect(result.accessToken).toBe("token");
  });

  test("authenticate serializes concurrent calls", async () => {
    await Promise.all([
      sdk.authenticate(["username"], vi.fn()),
      sdk.authenticate(["username"], vi.fn()),
    ]);

    expect(pi.authenticate).toHaveBeenCalledTimes(2);
  });

  test("createPayment forwards both arguments and returns the handle", () => {
    const data: PaymentData = { amount: 1, memo: "m", metadata: { orderId: 7 } };
    const callbacks = {
      onReadyForServerApproval: vi.fn(),
      onReadyForServerCompletion: vi.fn(),
      onCancel: vi.fn(),
      onError: vi.fn(),
    } satisfies PaymentCallbacks;

    const payment = sdk.createPayment(data, callbacks);

    expect(pi.createPayment).toHaveBeenCalledWith(data, callbacks);
    expect(payment).toEqual({ identifier: "p1" });
  });

  test("signIn passes its options through", () => {
    const options = { clientId: "abc", redirectUri: "https://app.example.com/callback" };

    sdk.signIn(options);

    expect(pi.signIn).toHaveBeenCalledWith(options);
  });

  test("the native feature methods reach the platform SDK", async () => {
    await sdk.nativeFeaturesList();
    await sdk.openShareDialog("title", "message");
    await sdk.openUrlInSystemBrowser("https://example.com");
    await sdk.copyText("hello");
    await sdk.openConversation(42);
    await sdk.requestPermission("camera");

    expect(pi.nativeFeaturesList).toHaveBeenCalled();
    expect(pi.openShareDialog).toHaveBeenCalledWith("title", "message");
    expect(pi.openUrlInSystemBrowser).toHaveBeenCalledWith("https://example.com");
    expect(pi.copyText).toHaveBeenCalledWith("hello");
    expect(pi.openConversation).toHaveBeenCalledWith(42);
    expect(pi.requestPermission).toHaveBeenCalledWith("camera");
  });

  test.each(["showAd", "isAdReady", "requestAd"] as const)(
    "Ads.%s reaches the platform SDK",
    async (method) => {
      await sdk.Ads[method]("rewarded");

      expect(pi.Ads[method]).toHaveBeenCalledWith("rewarded");
    },
  );
});

describe("use before the SDK is available", () => {
  test("loadPi without options loads the script but does not initialize, so signIn works", async () => {
    const pi = platformStub();
    autoLoadScripts(() => {
      window.Pi = pi as never;
    });

    const sdk = await loadPi();
    sdk.signIn({ clientId: "abc", redirectUri: "https://app.example.com/callback" });

    expect(pi.init).not.toHaveBeenCalled();
    expect(pi.signIn).toHaveBeenCalled();
  });

  test("createPayment throws when the SDK is not loaded", () => {
    const sdk = new Pi({ inject: false });

    expect(() => sdk.createPayment({ amount: 1, memo: "m", metadata: {} }, {
      onReadyForServerApproval: vi.fn(),
      onReadyForServerCompletion: vi.fn(),
      onCancel: vi.fn(),
      onError: vi.fn(),
    })).toThrow(PiSdkError);
  });

  test("signIn throws when the SDK is not loaded", () => {
    const sdk = new Pi({ inject: false });

    expect(() =>
      sdk.signIn({ clientId: "abc", redirectUri: "https://app.example.com/callback" }),
    ).toThrow(PiSdkError);
  });
});
