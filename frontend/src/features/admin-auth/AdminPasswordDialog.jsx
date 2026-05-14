import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert } from "lucide-react";

const ADMIN_PASSWORD = "Admin123";

export default function AdminPasswordDialog({ open, onOpenChange, title = "Autorización requerida", description = "Esta acción requiere autorización de administrador.", onAuthorized }) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const reset = () => { setPassword(""); setReason(""); setError(""); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== ADMIN_PASSWORD) {
      setError("Contraseña de administrador incorrecta.");
      return;
    }
    if (!reason.trim()) {
      setError("Indica un motivo para registrar la autorización.");
      return;
    }
    onAuthorized({ reason });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md" data-testid="admin-password-dialog">
        <DialogHeader>
          <div className="size-10 rounded-md bg-amber-500/10 grid place-items-center mb-2">
            <ShieldAlert className="text-amber-600" size={18} />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="admin-pw" className="text-xs">Contraseña de administrador</Label>
            <Input
              id="admin-pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5"
              data-testid="admin-password-input"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="reason" className="text-xs">Motivo</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe el motivo de la edición"
              className="mt-1.5 min-h-[72px]"
              data-testid="admin-password-reason"
            />
          </div>
          {error && <p className="text-xs text-rose-600 dark:text-rose-400" data-testid="admin-password-error">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" data-testid="admin-password-submit">Autorizar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
