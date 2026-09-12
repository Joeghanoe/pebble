import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

interface ConfirmButtonProps {
  /** The control that opens the dialog. Rendered as-is. */
  readonly children: React.ReactNode;
  readonly title: string;
  readonly description?: React.ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly onConfirm: () => void | Promise<unknown>;
}

/**
 * Replaces `window.confirm` for anything destructive.
 *
 * `window.confirm` is why deleting a row did nothing in the desktop build: the macOS
 * webview never shows the panel and the call returns false, so `if (!confirm(...)) return;`
 * swallowed every delete before it reached the API. A rendered dialog behaves the same
 * in a webview and in a mobile browser, and it can show what is about to happen rather
 * than one line of text.
 *
 * The dialog stays open while the action runs so a failure can be reported in place
 * instead of the dialog vanishing and leaving no trace.
 */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  disabled = false,
  onConfirm,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  async function handleConfirm(event: React.MouseEvent) {
    // Keep the dialog up until the request settles.
    event.preventDefault();
    setRunning(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // Swallowed on purpose. Callers pass `mutateAsync`, which rejects as well as
      // calling the mutation's own onError; letting it escape here would surface as
      // an unhandled rejection on top of the error the caller already reported.
      // The dialog stays open so the action can be retried or cancelled.
    } finally {
      setRunning(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild disabled={disabled}>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={running}
            className={cn(
              destructive &&
                "bg-destructive text-white hover:bg-destructive/90 dark:bg-destructive/80",
            )}
          >
            {running ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
