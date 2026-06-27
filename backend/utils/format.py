"""Format helpers — fechas en español."""
from datetime import datetime

_DAYS_ES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
_MONTHS_ES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]


def fmt_date_long_es(iso_date: str) -> str:
    try:
        d = datetime.fromisoformat(iso_date[:10])
    except Exception:
        return iso_date
    return f"{_DAYS_ES[d.weekday()]}, {d.day} de {_MONTHS_ES[d.month - 1]} de {d.year}"
