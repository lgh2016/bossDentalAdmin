import { useState } from "react";
import AdminPasswordDialog from "@/features/admin-auth/AdminPasswordDialog";
import { clinicStore } from "@/store/clinicStore";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { currencyMXN } from "@/utils/format";

export default function CancelPaymentDialog({ open, onOpenChange, payment }) {
  const { user } = useAuth();
  const [openInner, setOpenInner] = useState(false);

  const handleAuthorized = ({ reason }) => {
    clinicStore.cancelPayment(payment.id, reason, user);
    toast.success(`Pago de ${currencyMXN(payment.amount)} cancelado`);
    onOpenChange(false);
  };

  // Forward open to inner dialog
  return (
    <AdminPasswordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancelar pago"
      description={payment ? `Vas a cancelar el pago de ${currencyMXN(payment.amount)} (${payment.concept}). Requiere autorización admin.` : ""}
      onAuthorized={handleAuthorized}
    />
  );
}
