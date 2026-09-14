export type PiSdkErrorCode =
  | "PI_SDK_NOT_LOADED"
  | "AUTH_FAILED"
  | "NOT_CONNECTED"
  | "INVALID_PAYMENT_DATA"
  | "MISSING_PAYMENT_ID"
  | "MISSING_ACCESS_TOKEN"
  | "MISSING_TRANSACTION_ID"
  | "SERVER_REQUEST_FAILED";

export interface PiUser {
  user_uid: string;
  username: string;
  credentials?: {
    scopes?: string[];
    valid_until?: { timestamp?: number; iso8601?: string };
  };
}

export interface PiAuthResponse {
  accessToken: string;
  user: PiUser;
}

export interface PaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}

export interface PiSdkOptions {
  paymentBasePath?: string;
  // Scopes `authenticate()` asks Pi to consent to; A2U payouts need `wallet_address`.
  scopes?: string[];
}

export interface PiPaymentDto {
  identifier: string;
  transaction?: null | {
    txid?: string | null;
  };
}
