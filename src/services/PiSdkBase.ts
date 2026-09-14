import { Mutex } from "async-mutex";
import { PiSdkError } from "./PiSdkError";
import type {
  PaymentData,
  PiAuthResponse,
  PiPaymentDto,
  PiSdkOptions,
  PiUser,
} from "./types";

declare global {
  interface Window {
    Pi: any;
    RAILS_ENV?: string;
    __NEXT_DATA__?: any;
    next?: any;
  }
}

/**
 * Pi's own window.Pi.authenticate() response shape — bucket 1, not ours to
 * rename. `uid` is Pi's own key; our own PiUser contract uses `user_uid`
 * and is constructed from this at the one remap point below.
 */
interface PiPlatformAuthResponse {
  accessToken: string;
  user: {
    uid: string;
    username: string;
    credentials?: PiUser["credentials"];
  };
}

/**
 * Maps this SDK's local paymentId/transactionId identifiers to the
 * snake_case wire keys (payment_id/transaction_id) the app's own backend
 * expects. Centralized so a future new callback can't drift by
 * forgetting the mapping -- each of the five callbacks below built this
 * mapping inline before, one manual rename away from a silent mismatch.
 * `transactionId` is omitted entirely (not sent as null) when the caller
 * never had one to report; `onIncompletePaymentFound` explicitly reports
 * `null` when Pi's own payment DTO carried no transaction yet.
 */
function toWirePaymentIdentifiers(
  paymentId: string,
  transactionId?: string | null,
): { payment_id: string; transaction_id?: string | null } {
  return transactionId === undefined
    ? { payment_id: paymentId }
    : { payment_id: paymentId, transaction_id: transactionId };
}

/** Scopes requested when the consumer configures none. */
const DEFAULT_AUTH_SCOPES = ["payments", "username"];

/** True when every requested scope was already granted. */
function scopesGranted(requested: string[], granted: string[]): boolean {
  return requested.every((scope) => granted.includes(scope));
}

export class PiSdkBase {
  onConnection?: () => void;

  static accessToken: string | null = null;
  static connected: boolean = false;
  static authMutex: Mutex = new Mutex();
  static logPrefix: string = "[PiSDK]";
  static paymentBasePath: string = "tbd";
  static scopes: string[] = [...DEFAULT_AUTH_SCOPES];
  // What Pi consented to for the live session, so a widened `scopes` re-authenticates.
  static grantedScopes: string[] = [];
  static user: PiUser | null = null;
  static version: string = "2.0";

  constructor(options: PiSdkOptions = {}) {
    if (options.paymentBasePath) {
      PiSdkBase.paymentBasePath = options.paymentBasePath;
    }
    if (options.scopes?.length) {
      PiSdkBase.scopes = [...options.scopes];
    }
  }

  static log(...args: unknown[]): void {
    console.log(this.logPrefix, ...args);
  }
  static error(...args: unknown[]): void {
    console.error(this.logPrefix, ...args);
  }

  static checkPaymentBasePath(): void {
    if (PiSdkBase.paymentBasePath === "tbd") {
      if (
        typeof window !== "undefined" &&
        (window.__NEXT_DATA__ ||
          (typeof window.next !== "undefined" && window.next.version))
      ) {
        PiSdkBase.paymentBasePath = "api/pi_payment";
      } else {
        PiSdkBase.paymentBasePath = "pi_payment";
      }
    }
  }

  async authenticate(): Promise<PiAuthResponse> {
    const release = await PiSdkBase.authMutex.acquire();
    try {
      if (
        PiSdkBase.connected &&
        PiSdkBase.user &&
        PiSdkBase.accessToken &&
        scopesGranted(PiSdkBase.scopes, PiSdkBase.grantedScopes)
      ) {
        if (typeof this.onConnection == "function") this.onConnection();
        return {
          accessToken: PiSdkBase.accessToken,
          user: PiSdkBase.user,
        };
      }
      if (
        typeof window === "undefined" ||
        !window.Pi ||
        typeof window.Pi.init !== "function"
      ) {
        const error = new PiSdkError(
          "PI_SDK_NOT_LOADED",
          "Pi SDK not loaded.",
        );
        PiSdkBase.error(error.message);
        throw error;
      }

      const piInitOptions = { version: PiSdkBase.version };

      await Promise.resolve(window.Pi.init(piInitOptions));
      PiSdkBase.log("SDK initialized", piInitOptions);
      PiSdkBase.connected = false;
      try {
        const rawAuthResponse = (await window.Pi.authenticate(
          PiSdkBase.scopes,
          PiSdkBase.onIncompletePaymentFound,
        )) as PiPlatformAuthResponse;
        // Pi's own response uses `uid`; our own contract uses `user_uid`.
        // Remap here, once, at the boundary where Pi's raw response is
        // received — do not forward Pi's key verbatim.
        const authResponse: PiAuthResponse = {
          accessToken: rawAuthResponse.accessToken,
          user: {
            user_uid: rawAuthResponse.user.uid,
            username: rawAuthResponse.user.username,
            // Only add the key when Pi actually sent credentials, rather than
            // always assigning (possibly `undefined`) -- so `user_uid, username`
            // in JSON.stringify()'d bodies (postToServer logging, tests) never
            // shows a spurious `"credentials":null`-shaped key that wasn't there.
            ...(rawAuthResponse.user.credentials !== undefined
              ? { credentials: rawAuthResponse.user.credentials }
              : {}),
          },
        };
        PiSdkBase.accessToken = authResponse.accessToken;
        PiSdkBase.user = authResponse.user;
        // Pi may grant less than was asked for; fall back to the request when it reports nothing.
        PiSdkBase.grantedScopes =
          authResponse.user.credentials?.scopes ?? PiSdkBase.scopes;
        PiSdkBase.connected = true;
        PiSdkBase.log("Auth OK", authResponse);
        if (typeof this.onConnection == "function") this.onConnection();
        return authResponse;
      } catch (err) {
        PiSdkBase.connected = false;
        PiSdkBase.grantedScopes = [];
        const error = new PiSdkError("AUTH_FAILED", "Auth failed", err);
        PiSdkBase.error(error.message, err);
        throw error;
      }
    } finally {
      release();
    }
  }

  static async postToServer(path: string, body: object): Promise<unknown> {
    PiSdkBase.checkPaymentBasePath();
    const base = PiSdkBase.paymentBasePath;
    PiSdkBase.log(`POST: ${base}/${path}: ${JSON.stringify(body)}`);
    const resp = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => null);

    if (!resp.ok) {
      throw new PiSdkError(
        "SERVER_REQUEST_FAILED",
        `Request failed: ${base}/${path}`,
        data,
      );
    }

    return data;
  }

  static async onReadyForServerApproval(
    paymentId: string,
    accessToken: string,
  ): Promise<unknown> {
    if (!paymentId) {
      throw new PiSdkError(
        "MISSING_PAYMENT_ID",
        "Approval: missing paymentId",
      );
    }
    if (!accessToken) {
      throw new PiSdkError(
        "MISSING_ACCESS_TOKEN",
        "Approval: missing accessToken",
      );
    }
    const data = await PiSdkBase.postToServer("approve", {
      accessToken,
      ...toWirePaymentIdentifiers(paymentId),
    });

    PiSdkBase.log("approve:", data);
    return data;
  }

  static async onReadyForServerCompletion(
    paymentId: string,
    transactionId: string,
  ): Promise<unknown> {
    if (!paymentId) {
      throw new PiSdkError(
        "MISSING_PAYMENT_ID",
        "Completion: missing paymentId",
      );
    }
    if (!transactionId) {
      throw new PiSdkError(
        "MISSING_TRANSACTION_ID",
        "Completion: missing transactionId",
      );
    }
    const data = await PiSdkBase.postToServer(
      "complete",
      toWirePaymentIdentifiers(paymentId, transactionId),
    );

    PiSdkBase.log("complete:", data);
    return data;
  }

  static async onCancel(paymentId: string): Promise<unknown> {
    if (!paymentId) {
      throw new PiSdkError(
        "MISSING_PAYMENT_ID",
        "Cancel: missing paymentId",
      );
    }
    const data = await PiSdkBase.postToServer(
      "cancel",
      toWirePaymentIdentifiers(paymentId),
    );

    PiSdkBase.log("cancel:", data);
    return data;
  }

  static async onError(
    error: unknown,
    paymentDTO?: PiPaymentDto,
  ): Promise<unknown> {
    const paymentId = paymentDTO?.identifier;
    if (!paymentId) {
      throw new PiSdkError(
        "MISSING_PAYMENT_ID",
        "Error: missing paymentId",
      );
    }
    const data = await PiSdkBase.postToServer("error", {
      error: error instanceof Error ? error.message : String(error),
      ...toWirePaymentIdentifiers(paymentId),
    });

    PiSdkBase.log("error:", data);
    return data;
  }

  static async onIncompletePaymentFound(
    paymentDTO: PiPaymentDto,
  ): Promise<unknown> {
    const paymentId = paymentDTO?.identifier;
    const transactionId = paymentDTO?.transaction?.txid || null;
    if (!paymentId) {
      throw new PiSdkError(
        "MISSING_PAYMENT_ID",
        "Incomplete: missing paymentId",
      );
    }
    const data = await PiSdkBase.postToServer(
      "incomplete",
      toWirePaymentIdentifiers(paymentId, transactionId),
    );

    PiSdkBase.log("incomplete:", data);
    return data;
  }

  createPayment(paymentData: PaymentData): void {
    if (!PiSdkBase.connected) {
      throw new PiSdkError("NOT_CONNECTED", "Not connected to Pi.");
    }
    const { amount, memo, metadata } = paymentData || {};
    if (
      typeof amount !== "number" ||
      !memo ||
      typeof memo !== "string" ||
      !metadata ||
      typeof metadata !== "object" ||
      Object.keys(metadata).length === 0
    ) {
      throw new PiSdkError(
        "INVALID_PAYMENT_DATA",
        "Invalid paymentData",
        paymentData,
      );
    }
    if (!window.Pi || typeof window.Pi.createPayment !== "function") {
      throw new PiSdkError("PI_SDK_NOT_LOADED", "Pi SDK not loaded.");
    }
    const onReadyForServerApproval = (paymentId: string) => {
      return PiSdkBase.onReadyForServerApproval(
        paymentId,
        PiSdkBase.accessToken!,
      );
    };
    window.Pi.createPayment(paymentData, {
      onReadyForServerApproval,
      onReadyForServerCompletion: PiSdkBase.onReadyForServerCompletion,
      onCancel: PiSdkBase.onCancel,
      onError: PiSdkBase.onError,
      onIncompletePaymentFound: PiSdkBase.onIncompletePaymentFound,
    });
  }
}

if (typeof window !== "undefined") {
  (window as any).PiSdkBase = PiSdkBase;
}
