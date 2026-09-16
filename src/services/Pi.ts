import { Mutex } from "async-mutex";
import { PiSdkError } from "./PiSdkError";
import type {
  AdType,
  AuthResult,
  IsAdReadyResponse,
  NativeFeature,
  NativePermission,
  Payment,
  PaymentCallbacks,
  PaymentData,
  PaymentDto,
  PiInitOptions,
  RequestAdResponse,
  Scope,
  ScriptOptions,
  ShowAdResponse,
  SignInOptions,
} from "./types";

const SCRIPT_URL = "https://sdk.minepi.com/pi-sdk.js";

// Key order must not decide whether two option objects count as the same.
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

interface PiPlatform {
  init(options: PiInitOptions): Promise<void>;
  authenticate(
    scopes: Scope[],
    onIncompletePaymentFound: (payment: PaymentDto) => void,
  ): Promise<AuthResult>;
  createPayment(paymentData: PaymentData, callbacks: PaymentCallbacks): Payment;
  signIn(options: SignInOptions): void;
  Ads: {
    showAd(type: AdType): Promise<ShowAdResponse>;
    isAdReady(type: AdType): Promise<IsAdReadyResponse>;
    requestAd(type: AdType): Promise<RequestAdResponse>;
  };
  nativeFeaturesList(): Promise<NativeFeature[]>;
  openShareDialog(title: string, message: string): Promise<void>;
  openUrlInSystemBrowser(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  openConversation(conversationId: number): Promise<void>;
  requestPermission(permission: NativePermission): Promise<boolean | null>;
}

declare global {
  interface Window {
    Pi?: PiPlatform;
  }
}

// Compared without the query string, so a tag carrying a cache-buster still counts as loaded.
function sameSource(a: string, b: string): boolean {
  const normalize = (url: string) => {
    try {
      return new URL(url, document.baseURI).href.split("?")[0];
    } catch {
      return url.split("?")[0];
    }
  };
  return normalize(a) === normalize(b);
}

function findScript(url: string): HTMLScriptElement | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>("script[src]");
  return (
    Array.from(scripts).find((script) => sameSource(script.src, url)) ?? null
  );
}

function loadScript(url: string): Promise<void> {
  const existing = findScript(url);
  const tag = existing ?? document.createElement("script");

  const settled = new Promise<void>((resolve, reject) => {
    tag.addEventListener("load", () => resolve(), { once: true });
    tag.addEventListener(
      "error",
      () =>
        reject(new PiSdkError("PI_SDK_NOT_LOADED", `Could not load ${url}`)),
      { once: true },
    );
  });

  if (!existing) {
    const parent = document.head || document.body;
    if (!parent) {
      return Promise.reject(
        new PiSdkError("PI_SDK_NOT_LOADED", "The document has no <head> or <body> to load the Pi SDK into."),
      );
    }
    tag.src = url;
    tag.async = true;
    parent.appendChild(tag);
  }
  return settled;
}

export class Pi {
  private readonly script: ScriptOptions;
  private readonly authLock = new Mutex();
  private loading: Promise<PiPlatform> | null = null;
  private started: Promise<void> | null = null;
  private startedWith: PiInitOptions | null = null;

  readonly Ads = {
    showAd: (type: AdType) => this.use((pi) => pi.Ads.showAd(type)),
    isAdReady: (type: AdType) => this.use((pi) => pi.Ads.isAdReady(type)),
    requestAd: (type: AdType) => this.use((pi) => pi.Ads.requestAd(type)),
  };

  constructor(script: ScriptOptions = {}) {
    this.script = script;
  }

  init(options: PiInitOptions): Promise<void> {
    if (this.started) {
      if (stableJson(this.startedWith) !== stableJson(options)) {
        throw new PiSdkError(
          "ALREADY_INITIALIZED",
          "The SDK is already initialized with different options.",
        );
      }
      return this.started;
    }
    this.startedWith = options;
    this.started = this.platform()
      .then((pi) => pi.init(options))
      .catch((error) => {
        this.started = null;
        this.startedWith = null;
        throw error;
      });
    return this.started;
  }

  authenticate(
    scopes: Scope[],
    onIncompletePaymentFound: (payment: PaymentDto) => void,
  ): Promise<AuthResult> {
    return this.authLock.runExclusive(() =>
      this.use((pi) => pi.authenticate(scopes, onIncompletePaymentFound)),
    );
  }

  // Synchronous on the platform, so these two throw rather than wait for a missing SDK.
  createPayment(paymentData: PaymentData, callbacks: PaymentCallbacks): Payment {
    return this.loaded().createPayment(paymentData, callbacks);
  }

  signIn(options: SignInOptions): void {
    this.loaded().signIn(options);
  }

  nativeFeaturesList(): Promise<NativeFeature[]> {
    return this.use((pi) => pi.nativeFeaturesList());
  }

  openShareDialog(title: string, message: string): Promise<void> {
    return this.use((pi) => pi.openShareDialog(title, message));
  }

  openUrlInSystemBrowser(url: string): Promise<void> {
    return this.use((pi) => pi.openUrlInSystemBrowser(url));
  }

  copyText(text: string): Promise<void> {
    return this.use((pi) => pi.copyText(text));
  }

  openConversation(conversationId: number): Promise<void> {
    return this.use((pi) => pi.openConversation(conversationId));
  }

  requestPermission(permission: NativePermission): Promise<boolean | null> {
    return this.use((pi) => pi.requestPermission(permission));
  }

  // Loads pi-sdk.js without initializing. Only signIn is usable before init().
  load(): Promise<void> {
    return this.platform().then(() => undefined);
  }

  private platform(): Promise<PiPlatform> {
    this.loading ??= this.resolvePlatform().catch((error) => {
      this.loading = null;
      this.started = null;
      this.startedWith = null;
      throw error;
    });
    return this.loading;
  }

  private async resolvePlatform(): Promise<PiPlatform> {
    if (typeof window === "undefined") {
      throw new PiSdkError(
        "PI_SDK_NOT_LOADED",
        "The Pi SDK needs a browser environment.",
      );
    }
    if (window.Pi) return window.Pi;

    const url = this.script.url ?? SCRIPT_URL;
    if (this.script.inject === false) {
      throw new PiSdkError(
        "PI_SDK_NOT_LOADED",
        `window.Pi is absent and script injection is turned off. Add a script tag for ${url}.`,
      );
    }
    await loadScript(url);

    if (!window.Pi) {
      throw new PiSdkError(
        "PI_SDK_NOT_LOADED",
        `Loaded ${url} but window.Pi is still absent.`,
      );
    }
    return window.Pi;
  }

  private loaded(): PiPlatform {
    const pi = typeof window === "undefined" ? undefined : window.Pi;
    if (!pi) {
      throw new PiSdkError(
        "PI_SDK_NOT_LOADED",
        "The Pi SDK is not loaded. Call loadPi() first.",
      );
    }
    return pi;
  }

  private async use<T>(call: (pi: PiPlatform) => Promise<T>): Promise<T> {
    if (!this.started) {
      throw new PiSdkError("NOT_INITIALIZED", "Call init() before using the SDK.");
    }
    await this.started;
    return call(this.loaded());
  }
}

export async function loadPi(
  options?: PiInitOptions,
  script?: ScriptOptions,
): Promise<Pi> {
  const pi = new Pi(script);
  await (options ? pi.init(options) : pi.load());
  return pi;
}
