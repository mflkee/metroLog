import { type ReactNode } from "react";

import { AppDialog } from "@/components/ui/app-dialog";

type ModalProps = {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  size?: "default" | "sm" | "xl";
};

/**
 * The app's modal — now the fleet dialog (`@metro/app-dialog`) behind the name the screens use.
 *
 * The hand-rolled version drew its own backdrop and its own close control, so metroLog's
 * dialogs looked like metroLog while the other services' dialogs looked like the fleet. The
 * contract is the fleet's: the backdrop does not close the dialog, only an explicit control or
 * the Escape key does, and Radix supplies the focus trap, the aria wiring and the scroll lock.
 */
export function Modal({ title, description, open, onClose, children, footer, headerActions, size }: ModalProps) {
  return (
    <AppDialog
      description={description}
      footer={footer}
      headerActions={headerActions}
      open={open}
      size={size}
      title={title}
      onClose={onClose}
    >
      {children}
    </AppDialog>
  );
}
