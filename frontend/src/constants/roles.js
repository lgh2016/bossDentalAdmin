export const ROLES = {
  ADMIN: "ADMIN",
  RECEPCIONISTA: "RECEPCIONISTA",
  DENTISTA: "DENTISTA",
  PACIENTE: "PACIENTE",
};

export const ROLE_LABELS = {
  ADMIN: "Administrador",
  RECEPCIONISTA: "Recepcionista",
  DENTISTA: "Dentista",
  PACIENTE: "Paciente",
};

export const DEMO_USERS = [
  {
    id: "u-1",
    name: "Luis García",
    email: "admin@bossdental.com.mx",
    password: "Admin123",
    role: ROLES.ADMIN,
    avatar: "https://images.unsplash.com/photo-1729162128021-f37dca3ff30d?w=128&q=80",
  },
  {
    id: "u-2",
    name: "María Hernández",
    email: "recepcion@bossdental.com.mx",
    password: "Recep123",
    role: ROLES.RECEPCIONISTA,
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=128&q=80",
  },
  {
    id: "u-3",
    name: "Dra. Sofía Reyes",
    email: "dentista@bossdental.com.mx",
    password: "Dentista123",
    role: ROLES.DENTISTA,
    avatar: "https://images.pexels.com/photos/12917343/pexels-photo-12917343.jpeg?auto=compress&w=128",
  },
  {
    id: "u-4",
    name: "Carlos Mendoza",
    email: "paciente@bossdental.com.mx",
    password: "Paciente123",
    role: ROLES.PACIENTE,
    avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=128&q=80",
  },
];
