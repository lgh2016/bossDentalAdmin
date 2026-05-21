import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, ArrowRight, Lock } from "lucide-react";
import { toast } from "sonner";
import { DEMO_USERS, ROLES } from "@/constants/roles";

// Solo el rol PATIENT sigue siendo demo/mock. Los demás autentican contra la API VPS.
const VISIBLE_DEMO_USERS = DEMO_USERS.filter((u) => u.role === ROLES.PACIENTE);

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  const [email, setEmail] = useState("reception@bossdental.com");
  const [password, setPassword] = useState("admin1234");
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const u = await login(email, password);
      toast.success(`Bienvenido, ${u.name}`);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Error al iniciar sesión");
    }
  };

  const fill = (u) => {
    setEmail(u.email);
    setPassword(u.password);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: form */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-24 py-10">
        <div className="max-w-md mx-auto w-full">
          <div className="flex items-center gap-2 mb-12">
            <div className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Sparkles size={16} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Boss Dental</p>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Admin Suite</p>
            </div>
          </div>

          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Bienvenido</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
            Inicia sesión en tu panel
          </h1>
          <p className="text-sm text-muted-foreground mb-8">
            Acceso seguro al sistema interno de la clínica. Tus credenciales son únicas e intransferibles.
          </p>

          <Card className="border-border">
            <CardContent className="p-6">
              <form onSubmit={onSubmit} className="space-y-4" data-testid="login-form">
                <div>
                  <Label htmlFor="email" className="text-xs">Correo electrónico</Label>
                  <Input
                    id="email"
                    data-testid="login-email-input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tucorreo@bossdental.com.mx"
                    className="mt-1.5 h-10"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password" className="text-xs">Contraseña</Label>
                  <Input
                    id="password"
                    data-testid="login-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="mt-1.5 h-10"
                    required
                  />
                </div>
                {error && (
                  <p data-testid="login-error" className="text-xs text-rose-600 dark:text-rose-400">
                    {error}
                  </p>
                )}
                <Button
                  data-testid="login-submit-button"
                  type="submit"
                  className="w-full h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={loading}
                >
                  {loading ? "Ingresando..." : "Iniciar sesión"}
                  <ArrowRight size={15} className="ml-1.5" />
                </Button>

                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                  <Lock size={11} /> Conexión segura
                </p>
              </form>
            </CardContent>
          </Card>

          <div className="mt-8">
            <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-muted-foreground mb-3">
              Cuentas demo
            </p>
            <div className="grid grid-cols-2 gap-2">
              {VISIBLE_DEMO_USERS.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  data-testid={`demo-user-${u.role}`}
                  onClick={() => fill(u)}
                  className="text-left rounded-lg border border-border bg-card hover:border-foreground/20 hover:bg-secondary/40 transition-colors p-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{u.role}</p>
                  <p className="text-xs font-medium truncate mt-0.5">{u.email}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{u.password}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right: hero visual */}
      <div className="hidden lg:block relative overflow-hidden border-l border-border">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              'url("https://images.unsplash.com/photo-1589554881701-3902036d4d04?w=1600&q=80")',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/40 via-background/10 to-primary/30 dark:from-background/80 dark:via-background/40 dark:to-primary/40" />
        <div className="absolute inset-0 grid-faint opacity-30 mix-blend-overlay" />

        <div className="relative h-full flex flex-col justify-end p-12">
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 backdrop-blur px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white">
              <span className="size-1.5 rounded-full bg-emerald-400" /> Sistema operativo
            </div>
            <h2 className="mt-5 text-3xl xl:text-4xl font-semibold tracking-tight text-white">
              Operación clínica, simplemente <span className="text-primary-foreground/90">elegante</span>.
            </h2>
            <p className="mt-3 text-sm text-white/85 max-w-md">
              Agenda, expedientes, pagos y CRM en una experiencia moderna pensada para clínicas dentales privadas.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-3 max-w-md">
              {[
                { k: "Citas/mes", v: "1,420" },
                { k: "Pacientes", v: "3,260" },
                { k: "Doctores", v: "12" },
              ].map((s) => (
                <div key={s.k} className="rounded-lg bg-white/10 border border-white/20 backdrop-blur px-3 py-3 text-white">
                  <p className="text-[10px] uppercase tracking-[0.12em] opacity-80">{s.k}</p>
                  <p className="text-lg font-semibold mt-0.5">{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
