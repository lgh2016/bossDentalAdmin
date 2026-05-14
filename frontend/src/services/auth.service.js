import { DEMO_USERS } from "@/constants/roles";

const TOKEN_KEY = "boss_dental_token";
const USER_KEY = "boss_dental_user";

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

const encodeMockJwt = (payload) => {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const signature = btoa(`mock-signature-${payload.sub}-${payload.exp}`);
  return `${header}.${body}.${signature}`;
};

export const authService = {
  async login(email, password) {
    await delay();
    const user = DEMO_USERS.find(
      (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password,
    );
    if (!user) {
      const err = new Error("Credenciales incorrectas");
      err.code = "INVALID_CREDENTIALS";
      throw err;
    }
    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 8;
    const token = encodeMockJwt({ sub: user.id, role: user.role, email: user.email, exp });
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
    };
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(safeUser));
    return { token, user: safeUser };
  },
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  isAuthenticated() {
    return !!localStorage.getItem(TOKEN_KEY);
  },
};
