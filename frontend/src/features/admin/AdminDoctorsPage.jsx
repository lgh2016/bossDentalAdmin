import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, KeyRound, Loader2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import StatusBadge from "@/shared/StatusBadge";
import { adminDoctorsApi } from "@/services/adminDoctorsApi";

const empty = { name: "", lastName: "", specialty: "", email: "", password: "", active: true, availableForAppointments: true };

export default function AdminDoctorsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);     // doctor to edit, or 'new'
  const [pwTarget, setPwTarget] = useState(null);   // doctor for password change
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const data = await adminDoctorsApi.list({ includeInactive: true, signal });
      setItems(data);
    } catch (err) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError") return;
      toast.error("No fue posible cargar la lista de doctores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, refreshKey]);

  const toggleActive = async (d) => {
    try {
      await adminDoctorsApi.update(d.id, { active: !d.active });
      toast.success(d.active ? "Doctor desactivado" : "Doctor activado");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible actualizar el doctor");
    }
  };

  const toggleAvailable = async (d) => {
    try {
      await adminDoctorsApi.update(d.id, { availableForAppointments: !d.availableForAppointments });
      toast.success(d.availableForAppointments ? "Disponibilidad desactivada" : "Disponibilidad activada");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible actualizar la disponibilidad");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administración"
        title="Doctores"
        subtitle="Crea, edita y administra el acceso del personal clínico."
        actions={
          <Button type="button" onClick={() => setEditing("new")} data-testid="admin-doctor-new">
            <Plus size={14} className="mr-1" /> Nuevo doctor
          </Button>
        }
      />

      {loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground py-12 text-center">
          <Loader2 size={14} className="inline mr-2 animate-spin" /> Cargando…
        </p>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-left">Doctor</th>
              <th className="px-4 py-2.5 text-left">Especialidad</th>
              <th className="px-4 py-2.5 text-left">Correo (acceso)</th>
              <th className="px-4 py-2.5 text-left">Activo</th>
              <th className="px-4 py-2.5 text-left">Disponible</th>
              <th className="px-4 py-2.5 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border" data-testid="admin-doctors-table">
            {items.map((d) => (
              <tr key={d.id} className="hover:bg-secondary/30 transition-colors" data-testid={`admin-doctor-${d.id}`}>
                <td className="px-4 py-3">
                  <p className="font-medium">{d.fullName}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">#{d.id}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{d.specialty || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.user?.email || <span className="italic">sin acceso</span>}</td>
                <td className="px-4 py-3">{d.active ? <StatusBadge value="Activo" /> : <StatusBadge value="Inactivo" />}</td>
                <td className="px-4 py-3">
                  <Switch
                    checked={d.availableForAppointments}
                    onCheckedChange={() => toggleAvailable(d)}
                    data-testid={`admin-doctor-${d.id}-available`}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1.5">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(d)} data-testid={`admin-doctor-${d.id}-edit`}>
                      <Pencil size={12} /> Editar
                    </Button>
                    {d.user && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setPwTarget(d)} data-testid={`admin-doctor-${d.id}-password`}>
                        <KeyRound size={12} /> Contraseña
                      </Button>
                    )}
                    <Button type="button" size="sm" variant={d.active ? "outline" : "default"} onClick={() => toggleActive(d)} data-testid={`admin-doctor-${d.id}-toggle-active`}>
                      {d.active ? <><PowerOff size={12} className="mr-1" /> Desactivar</> : <><Power size={12} className="mr-1" /> Activar</>}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Sin doctores registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <DoctorEditDialog
        target={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
      <PasswordDialog
        target={pwTarget}
        onOpenChange={(o) => !o && setPwTarget(null)}
      />
    </div>
  );
}

function DoctorEditDialog({ target, onOpenChange, onSaved }) {
  const isNew = target === "new";
  const open = !!target;
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [createUser, setCreateUser] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (isNew) {
      setForm(empty); setCreateUser(false);
    } else {
      setForm({
        name: target.name || "",
        lastName: target.lastName || "",
        specialty: target.specialty || "",
        email: target.user?.email || "",
        password: "",
        active: target.active,
        availableForAppointments: target.availableForAppointments,
      });
      setCreateUser(false);
    }
  }, [open, target, isNew]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isNew) {
        const payload = {
          name: form.name,
          lastName: form.lastName,
          specialty: form.specialty,
          active: form.active,
          availableForAppointments: form.availableForAppointments,
        };
        if (createUser && form.email) {
          payload.email = form.email;
          payload.password = form.password;
        }
        await adminDoctorsApi.create(payload);
        toast.success("Doctor creado");
      } else {
        const payload = {
          name: form.name,
          lastName: form.lastName,
          specialty: form.specialty,
          active: form.active,
          availableForAppointments: form.availableForAppointments,
        };
        if (target.user && form.email && form.email !== target.user.email) {
          payload.email = form.email;
        }
        await adminDoctorsApi.update(target.id, payload);
        toast.success("Doctor actualizado");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="admin-doctor-edit-dialog">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuevo doctor" : `Editar ${target.fullName}`}</DialogTitle>
          <DialogDescription>Cambios se sincronizan con el usuario de acceso si existe.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="mt-1" data-testid="admin-doctor-name" />
            </div>
            <div>
              <Label className="text-xs">Apellido</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required className="mt-1" data-testid="admin-doctor-lastname" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Especialidad</Label>
            <Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} className="mt-1" data-testid="admin-doctor-specialty" />
          </div>

          {(isNew && createUser) || (!isNew && target?.user) ? (
            <div>
              <Label className="text-xs">Correo (acceso al sistema)</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" required={isNew && createUser} data-testid="admin-doctor-email" />
            </div>
          ) : null}
          {isNew && (
            <>
              <div className="flex items-center gap-2">
                <Switch checked={createUser} onCheckedChange={setCreateUser} data-testid="admin-doctor-create-user" />
                <Label className="text-xs">Crear cuenta de acceso (DENTIST)</Label>
              </div>
              {createUser && (
                <div>
                  <Label className="text-xs">Contraseña inicial</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1" required minLength={6} data-testid="admin-doctor-password" />
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="admin-doctor-form-active" />
              <Label className="text-xs">Activo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.availableForAppointments} onCheckedChange={(v) => setForm({ ...form, availableForAppointments: v })} data-testid="admin-doctor-form-available" />
              <Label className="text-xs">Disponible para citas</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving} data-testid="admin-doctor-save">
              {saving ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Guardando…</> : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ target, onOpenChange }) {
  const open = !!target;
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setPw(""); setSaving(false); } }, [open]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    setSaving(true);
    try {
      await adminDoctorsApi.changePassword(target.id, pw);
      toast.success("Contraseña actualizada");
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "No fue posible cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" data-testid="admin-doctor-password-dialog">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>{target.fullName} · {target.user?.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label className="text-xs">Nueva contraseña</Label>
            <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={6} className="mt-1" data-testid="admin-doctor-new-password" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving} data-testid="admin-doctor-password-save">
              {saving ? <><Loader2 size={14} className="mr-1.5 animate-spin" /> Guardando…</> : "Cambiar contraseña"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
