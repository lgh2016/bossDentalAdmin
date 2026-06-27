/**
 * Utilidades de fecha/hora locales (America/Mexico_City) para el módulo Agenda.
 *
 * Política:
 *   - Toda la lógica visible al usuario opera en zona horaria de la clínica.
 *   - El backend valida y persiste también con esta zona, evitando desfases por UTC.
 */

export const CLINIC_TZ = "America/Mexico_City";
export const SLOT_MIN = 30;

// Horario laboral por día (0=domingo..6=sábado)
// open/close: minutos desde 00:00. null = cerrado.
const BUSINESS_HOURS = {
  0: null,                       // domingo cerrado
  1: { open: 9 * 60, close: 18 * 60 }, // lun
  2: { open: 9 * 60, close: 18 * 60 }, // mar
  3: { open: 9 * 60, close: 18 * 60 }, // mié
  4: { open: 9 * 60, close: 18 * 60 }, // jue
  5: { open: 9 * 60, close: 18 * 60 }, // vie
  6: { open: 9 * 60, close: 17 * 60 }, // sáb
};

// ---------- helpers de fecha local ----------

/**
 * Devuelve un Date "aware" en zona horaria de la clínica.
 * Truco: usamos Intl para obtener las partes locales de Mexico, y reconstruimos
 * un Date local con esos valores. Es seguro para sólo lectura (h/m/d/...).
 */
function nowInClinicTZ() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CLINIC_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  const hour = get("hour") === 24 ? 0 : get("hour");
  // OJO: este Date "fingido" se usa SOLO para extraer year/month/day/h/m. No para timestamps.
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

/** Devuelve "YYYY-MM-DD" para la fecha actual en zona de la clínica (America/Mexico_City). */
export function todayISO() {
  const { year, month, day } = nowInClinicTZ();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minutos desde 00:00 para la hora actual en zona de la clínica. */
export function nowMinutes() {
  const { hour, minute } = nowInClinicTZ();
  return hour * 60 + minute;
}

/** "HH:mm" actual en zona de la clínica. */
export function nowHHMM() {
  return mmToHHMM(nowMinutes());
}

/** weekday() 0=dom..6=sáb a partir de "YYYY-MM-DD" (interpretado como fecha local, sin TZ shift). */
export function weekdayOf(dateISO) {
  if (!dateISO) return null;
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function mmToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMin(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function businessWindow(dateISO) {
  const wd = weekdayOf(dateISO);
  if (wd == null) return null;
  return BUSINESS_HOURS[wd];
}

export function isSunday(dateISO) {
  return weekdayOf(dateISO) === 0;
}

export function isPastDate(dateISO) {
  return dateISO && dateISO < todayISO();
}

/**
 * Genera los slots disponibles de hora INICIAL para la fecha dada.
 * @param {string} dateISO  YYYY-MM-DD
 * @returns {Array<{value:string, label:string}>}
 */
export function startSlots(dateISO) {
  const win = businessWindow(dateISO);
  if (!win) return [];
  let from = win.open;
  if (dateISO === todayISO()) {
    // Redondeo al siguiente bloque de SLOT_MIN.
    const n = nowMinutes();
    const rounded = Math.ceil(n / SLOT_MIN) * SLOT_MIN;
    from = Math.max(from, rounded);
  }
  const out = [];
  for (let t = from; t < win.close; t += SLOT_MIN) {
    const v = mmToHHMM(t);
    out.push({ value: v, label: formatLabel(v) });
  }
  return out;
}

/**
 * Genera los slots de hora FIN > startTime, alineados a SLOT_MIN, hasta el cierre.
 */
export function endSlots(dateISO, startTime) {
  const win = businessWindow(dateISO);
  if (!win || !startTime) return [];
  const s = hhmmToMin(startTime);
  const out = [];
  const first = Math.max(s + SLOT_MIN, s + SLOT_MIN); // primer bloque > start
  for (let t = first; t <= win.close; t += SLOT_MIN) {
    const v = mmToHHMM(t);
    out.push({ value: v, label: formatLabel(v) });
  }
  return out;
}

/** Hora fin sugerida = inicio + 1h, alineada a SLOT_MIN, dentro de horario. */
export function defaultEndTime(dateISO, startTime) {
  const win = businessWindow(dateISO);
  if (!win || !startTime) return "";
  const candidate = hhmmToMin(startTime) + 60;
  const max = win.close;
  const target = Math.min(candidate, max);
  return mmToHHMM(target);
}

/** "12:30" -> "12:30 PM" (etiqueta amigable). */
export function formatLabel(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Valida los campos de fecha/hora del formulario de cita.
 * @returns {object} { date?: string, startTime?: string, endTime?: string }
 */
export function validateAppointmentDateTime({ date, startTime, endTime }) {
  const errors = {};
  if (!date) {
    errors.date = "Fecha requerida";
    return errors;
  }
  if (isPastDate(date)) {
    errors.date = "No se puede agendar en una fecha pasada";
    return errors;
  }
  if (isSunday(date)) {
    errors.date = "La clínica no atiende los domingos";
    return errors;
  }
  const win = businessWindow(date);
  if (!startTime) {
    errors.startTime = "Hora inicial requerida";
  } else {
    const s = hhmmToMin(startTime);
    if (s < win.open || s >= win.close) {
      errors.startTime = `Fuera de horario (${mmToHHMM(win.open)}–${mmToHHMM(win.close)})`;
    } else if (date === todayISO() && s < nowMinutes()) {
      errors.startTime = "No puede ser anterior a la hora actual";
    }
  }
  if (!endTime) {
    errors.endTime = "Hora fin requerida";
  } else if (startTime) {
    const e = hhmmToMin(endTime);
    const s = hhmmToMin(startTime);
    if (e <= s) errors.endTime = "Debe ser mayor a la hora inicial";
    else if (e > win.close) errors.endTime = `Debe terminar antes de ${mmToHHMM(win.close)}`;
  }
  return errors;
}
