import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShieldAlert, Loader2 } from "lucide-react";

type AuthState = "loading" | "success" | "error" | "no-biometry";

interface BiometricGateProps {
  readonly children: React.ReactNode;
}

export function BiometricGate({ children }: BiometricGateProps) {
  const [authState, setAuthState] = useState<AuthState>(
    import.meta.env.DEV ? "success" : "loading",
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  const authenticateUser = async () => {
    try {
      const { checkStatus, authenticate } =
        await import("@choochmeque/tauri-plugin-biometry-api");

      const status = await checkStatus();

      if (!status.isAvailable || status.biometryType === 0) {
        setAuthState("no-biometry");
        return;
      }

      await authenticate("Authenticate to access Portfolio Tracker", {
        allowDeviceCredential: true,
        cancelTitle: "Cancel",
        fallbackTitle: "Use Passcode",
      });

      setAuthState("success");
    } catch (error) {
      setAuthState("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Authentication failed",
      );
    }
  };

  useEffect(() => {
    if (import.meta.env.DEV) return;
    void authenticateUser();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skip biometrics in dev mode (early return for render)
  if (import.meta.env.DEV) {
    return <>{children}</>;
  }

  // Loading state
  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center space-y-4 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <h2 className="text-2xl font-semibold">Authenticating...</h2>
            <p className="text-sm text-muted-foreground">
              Please verify your identity using biometrics
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Error state
  if (authState === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md p-8">
          <div className="flex flex-col items-center space-y-4 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive" />
            <h2 className="text-2xl font-semibold">Authentication Failed</h2>
            <p className="text-sm text-muted-foreground">
              {errorMessage || "Unable to verify your identity"}
            </p>
            <Button
              onClick={() => {
                setAuthState("loading");
                setErrorMessage("");
                authenticateUser();
              }}
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // No biometry available - show warning but allow access
  if (authState === "no-biometry") {
    return (
      <div className="flex min-h-screen flex-col">
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-3">
          <div className="flex items-center justify-center space-x-2 text-yellow-700 dark:text-yellow-400">
            <ShieldAlert className="h-5 w-5" />
            <p className="text-sm font-medium">
              Biometric authentication is not available on this device. The app
              is running without biometric protection.
            </p>
          </div>
        </div>
        <div className="flex-1">{children}</div>
      </div>
    );
  }

  // Success - render children
  return <>{children}</>;
}
