import { AlertDialog, Button } from "@heroui/react";
import type { ReactNode } from "react";

interface ConfirmDialogProps {
  confirmLabel: string;
  description: ReactNode;
  isOpen: boolean;
  isPending?: boolean;
  onConfirm: () => void;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  tone?: "accent" | "danger";
}

/** A modal confirmation for destructive or irreversible actions. */
export const ConfirmDialog = ({
  confirmLabel,
  description,
  isOpen,
  isPending = false,
  onConfirm,
  onOpenChange,
  title,
  tone = "danger",
}: ConfirmDialogProps) => (
  <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
    <AlertDialog.Container>
      <AlertDialog.Dialog className="sm:max-w-[420px]">
        <AlertDialog.Header>
          <AlertDialog.Icon status={tone} />
          <AlertDialog.Heading>{title}</AlertDialog.Heading>
        </AlertDialog.Header>
        <AlertDialog.Body>
          <div className="text-muted text-body leading-relaxed">
            {description}
          </div>
        </AlertDialog.Body>
        <AlertDialog.Footer>
          <Button isDisabled={isPending} slot="close" variant="tertiary">
            Cancel
          </Button>
          <Button
            isPending={isPending}
            onPress={onConfirm}
            variant={tone === "danger" ? "danger" : "primary"}
          >
            {confirmLabel}
          </Button>
        </AlertDialog.Footer>
      </AlertDialog.Dialog>
    </AlertDialog.Container>
  </AlertDialog.Backdrop>
);
