import { loadPi, PiSdkError } from "@pinetwork/pi-sdk-js";
import type { PaymentDto, Pi } from "@pinetwork/pi-sdk-js";

const status = document.getElementById("status")!;
const output = document.getElementById("log")!;
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;

const log = (message: string) => {
  output.textContent += `${message}\n`;
};

/*
 * Signing in works in any browser and needs no initialization, so this page loads the SDK
 * without it. Everything else requires Pi Browser, and initializes on demand below.
 */
let pi: Pi;

try {
  pi = await loadPi();
  status.textContent = "Pi SDK loaded. Sign-in works anywhere; the rest needs Pi Browser.";
  button("sign-in").disabled = false;
  button("authenticate").disabled = false;
} catch (error) {
  status.textContent =
    error instanceof PiSdkError ? `${error.code}: ${error.message}` : String(error);
}

button("sign-in").addEventListener("click", () => {
  // Redirects away; the access token comes back in the fragment of redirectUri.
  pi.signIn({
    clientId: "your-client-id",
    redirectUri: `${window.location.origin}/callback`,
    state: crypto.randomUUID(),
  });
});

button("authenticate").addEventListener("click", async () => {
  try {
    await pi.init({ version: "2.0" });
    log("authenticating…");
    /*
     * Outside Pi Browser there is no host to answer the consent prompt, and the platform waits
     * for it without a timeout, so this never settles. Race it so the page can say why.
     */
    const outsidePiBrowser = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("no response — open this page inside Pi Browser")),
        20000,
      ),
    );
    const { accessToken, user } = await Promise.race([
      outsidePiBrowser,
      pi.authenticate(
        ["payments", "username"],
        (payment: PaymentDto) => log(`incomplete payment found: ${payment.identifier}`),
      ),
    ]);
    log(`signed in as ${user.username ?? user.uid}`);
    // Send only the token to your server, and verify it there against GET /v2/me.
    log(`access token length: ${accessToken.length}`);
    button("pay").disabled = false;
  } catch (error) {
    log(`authenticate failed: ${(error as Error).message}`);
  }
});

button("pay").addEventListener("click", () => {
  pi.createPayment(
    { amount: 1, memo: "Example payment", metadata: { orderId: 1 } },
    {
      // Each of these is where your own backend call goes.
      onReadyForServerApproval: (paymentId) => log(`approve on your server: ${paymentId}`),
      onReadyForServerCompletion: (paymentId, txid) =>
        log(`complete on your server: ${paymentId} ${txid}`),
      onCancel: (paymentId) => log(`cancelled: ${paymentId}`),
      onError: (error) => log(`payment error: ${error.message}`),
    },
  );
});
