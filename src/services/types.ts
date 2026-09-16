export type PiSdkErrorCode =
  | "PI_SDK_NOT_LOADED"
  | "NOT_INITIALIZED"
  | "ALREADY_INITIALIZED";

export interface SmartContractOptions {
  rpcUrl?: string;
  networkPassphrase?: string;
  contractAddresses?: { nativeToken?: string; subscription?: string };
}

export interface PiInitV2Options {
  version: "2.0";
  sandbox?: boolean;
  smartContractOptions?: SmartContractOptions;
}

export interface PiInitV3Options {
  version: "3.0";
  sandbox?: never;
  smartContractOptions?: SmartContractOptions;
}

export type PiInitOptions = PiInitV2Options | PiInitV3Options;

export interface ScriptOptions {
  url?: string;
  inject?: boolean;
}

export type Scope = "username" | "payments" | "wallet_address";

export interface PiUser {
  app_id: number;
  uid: string;
  credentials: {
    scopes: Scope[];
    valid_until: { timestamp: number; iso8601: string };
  };
  receiving_email?: string | null;
  // Present only when the username scope was granted.
  username?: string;
}

export interface AuthResult {
  accessToken: string;
  user: PiUser;
}

export type Direction = "user_to_app" | "app_to_user";

export type AppNetwork = "Pi Network" | "Pi Testnet";

export interface PaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  tokenCanonical?: string;
}

export interface PaymentCallbacks {
  // Approval and completion are retried until the timer ends, so make them idempotent.
  onReadyForServerApproval: (paymentId: string) => void;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: Error, payment?: PaymentDto) => void;
}

export interface PaymentDto {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  created_at: string;
  to_address: string;
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    cancelled: boolean;
    user_cancelled: boolean;
  };
  transaction: null | { txid: string; verified: boolean; _link: string };
  from_address?: string;
  direction?: Direction;
  network?: AppNetwork;
}

/** Handle for the running payment flow; its members are platform-internal. */
export type Payment = object;

export interface SignInOptions {
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state?: string;
}

export type AdType = "interstitial" | "rewarded";

type AdUnavailable = "ADS_NOT_SUPPORTED" | "AD_NOT_AVAILABLE" | "AD_NETWORK_ERROR";

export interface IsAdReadyResponse {
  success: true;
  type: AdType;
  ready: boolean;
}

export interface RequestAdResponse {
  success: true;
  type: AdType;
  result: "AD_LOADED" | "AD_FAILED_TO_LOAD" | AdUnavailable;
}

export type ShowAdResponse =
  | {
      success: true;
      type: "interstitial";
      result: "AD_CLOSED" | "AD_DISPLAY_ERROR" | AdUnavailable;
    }
  | {
      success: true;
      type: "rewarded";
      result:
        | "AD_CLOSED"
        | "AD_DISPLAY_ERROR"
        | "AD_REWARDED"
        | "USER_UNAUTHENTICATED"
        | AdUnavailable;
      adId?: string;
    };

export type NativeFeature =
  | "inline_media"
  | "request_permission"
  | "ad_network"
  | "safe_area_insets"
  | "file_share";

export type NativePermission = "camera";
