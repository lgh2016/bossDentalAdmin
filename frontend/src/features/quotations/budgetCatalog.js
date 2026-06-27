// Catálogo real de conceptos del presupuesto.
// Mantener sincronizado con el listado entregado por el área clínica.

export const BUDGET_CATALOG = [
  // Conceptos base
  { name: "Consulta inicial", price: 50, group: "Conceptos base" },
  { name: "Resina fotocurable", price: 500, group: "Conceptos base" },
  { name: "Amalgama", price: 500, group: "Conceptos base" },
  { name: "Endodoncia", price: 2500, group: "Conceptos base" },
  { name: "Pulpotomía", price: 2000, group: "Conceptos base" },
  { name: "Poste", price: 1500, group: "Conceptos base" },
  { name: "Rx", price: 150, group: "Conceptos base" },
  { name: "Curación", price: 350, group: "Conceptos base" },
  { name: "Carilla", price: 1000, group: "Conceptos base" },
  { name: "Reparación", price: 450, group: "Conceptos base" },
  { name: "Extracción", price: 500, group: "Conceptos base" },
  { name: "Profilaxis", price: 600, group: "Conceptos base" },
  { name: "Ultrasonido", price: 1500, group: "Conceptos base" },
  { name: "Ortodoncia pago inicial", price: 5000, group: "Conceptos base" },
  { name: "Mensualidad de ortodoncia", price: 500, group: "Conceptos base" },
  { name: "Toxina botulínica", price: 3500, group: "Conceptos base" },
  { name: "Incrustación de metal", price: 2000, group: "Conceptos base" },
  { name: "Incrustación de resina", price: 2000, group: "Conceptos base" },
  { name: "Blanqueamiento", price: 2200, group: "Conceptos base" },
  // Cirugías
  { name: "Cirugía tercer molar sencilla", price: 1000, group: "Cirugías" },
  { name: "Cirugía tercer molar compleja", price: 3000, group: "Cirugías" },
  // Coronas y prótesis
  { name: "Corona zirconia", price: 4000, group: "Coronas y prótesis" },
  { name: "Corona metal", price: 2000, group: "Coronas y prótesis" },
  { name: "Corona resina/aluminio", price: 2200, group: "Coronas y prótesis" },
  { name: "Corona E-max", price: 2500, group: "Coronas y prótesis" },
  { name: "Corona porcelana", price: 3000, group: "Coronas y prótesis" },
  { name: "Puente resina acrílica", price: 3000, group: "Coronas y prótesis" },
  { name: "Prótesis resina monolítica", price: 2000, group: "Coronas y prótesis" },
  // Removibles / placas
  { name: "Cangrejito superior/inferior acrílico 1 unidad", price: 2000, group: "Removibles / placas" },
  { name: "Cangrejito superior/inferior teflón", price: 2500, group: "Removibles / placas" },
  { name: "Cangrejito superior/inferior parcial flexible", price: 3000, group: "Removibles / placas" },
  { name: "Placa superior/inferior 1 unidad", price: 2000, group: "Removibles / placas" },
  { name: "Juego de placas acrílico", price: 3500, group: "Removibles / placas" },
  { name: "Juego de placas teflón", price: 4900, group: "Removibles / placas" },
  { name: "Juego de placas parcial flexible", price: 9000, group: "Removibles / placas" },
  { name: "Juego de placas caracterizadas teflón", price: 12000, group: "Removibles / placas" },
  { name: "Juego de placas caracterizadas total natural", price: 12000, group: "Removibles / placas" },
  { name: "Removible 4 piezas", price: 2500, group: "Removibles / placas" },
  { name: "Removible 8 piezas", price: 4500, group: "Removibles / placas" },
  // Aparatología
  { name: "Provisional acrílico", price: 400, group: "Aparatología" },
  { name: "Guarda oclusal", price: 500, group: "Aparatología" },
  { name: "Retenedores de ortodoncia", price: 2000, group: "Aparatología" },
  { name: "Barra transpalatina", price: 1500, group: "Aparatología" },
  { name: "Hyrax", price: 3000, group: "Aparatología" },
  { name: "Arco lingual", price: 1500, group: "Aparatología" },
];

export const BUDGET_GROUPS = Array.from(new Set(BUDGET_CATALOG.map((c) => c.group)));
