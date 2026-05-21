import { useEffect, useRef } from "react";
import { session } from "@/services/session";

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];

// Timeouts por rol en ms
const TIMEOUTS = {
  ADMIN: 24 * 60 * 60 * 1000,
  RECEPTION: 24 * 60 * 60 * 1000,
  RECEPCIONISTA: 24 * 60 * 60 * 1000,
  DENTIST: 24 * 60 * 60 * 1000,
  DENTISTA: 24 * 60 * 60 * 1000,
  PATIENT: 30 * 60 * 1000,
  PACIENTE: 30 * 60 * 1000,
};

const CHECK_INTERVAL_MS = 30 * 1000;

export function useInactivityTimer({ enabled, roleName, onTimeout }) {
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    const timeoutMs = TIMEOUTS[roleName] || TIMEOUTS.PATIENT;

    const bump = () => {
      lastActivityRef.current = Date.now();
      session.setLastActivity(lastActivityRef.current);
    };

    // Sembrar última actividad si no hay
    const stored = session.getLastActivity();
    if (!stored) bump(); else lastActivityRef.current = stored;

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));

    const interval = setInterval(() => {
      const now = Date.now();
      if (now - lastActivityRef.current >= timeoutMs) {
        onTimeout?.("inactivity");
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump));
      clearInterval(interval);
    };
  }, [enabled, roleName, onTimeout]);
}
