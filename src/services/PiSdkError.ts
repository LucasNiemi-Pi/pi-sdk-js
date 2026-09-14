import type { PiSdkErrorCode } from "./types";

export class PiSdkError extends Error {
  code: PiSdkErrorCode;
  cause?: unknown;

  constructor(code: PiSdkErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "PiSdkError";
    this.code = code;
    this.cause = cause;
  }
}
