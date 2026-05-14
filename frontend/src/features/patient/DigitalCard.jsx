import PageHeader from "@/shared/PageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/context/AuthContext";
import { initials } from "@/utils/format";
import { ShieldCheck } from "lucide-react";

export default function DigitalCard() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <PageHeader title="Carnet digital" subtitle="Tu identificación oficial como paciente Boss Dental." />

      <div className="max-w-xl">
        <div className="relative rounded-2xl overflow-hidden border border-border shadow-sm bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground p-6 sm:p-8">
          <div className="absolute -top-24 -right-24 size-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-24 -left-10 size-56 rounded-full bg-white/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Boss Dental</p>
                <p className="text-xs opacity-80">Carnet del paciente</p>
              </div>
              <ShieldCheck size={20} />
            </div>
            <div className="mt-8 flex items-center gap-4">
              <Avatar className="size-16 ring-2 ring-white/30">
                <AvatarImage src={user.avatar} />
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold tracking-tight">{user.name}</p>
                <p className="text-xs opacity-80">{user.email}</p>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-4 text-xs">
              <div>
                <p className="opacity-70">ID</p>
                <p className="font-mono">{user.id.toUpperCase()}</p>
              </div>
              <div>
                <p className="opacity-70">Vigencia</p>
                <p className="font-mono">12/2027</p>
              </div>
              <div>
                <p className="opacity-70">Tipo</p>
                <p className="font-medium">Privado</p>
              </div>
            </div>
            <p className="mt-6 text-[10px] tracking-[0.16em] uppercase opacity-70">
              Presenta este carnet en recepción
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
