import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";
import type { Customer, Product } from "@/lib/types";

interface CartLine {
  productId: string;
  name: string;
  image: string | null;
  quantity: number;
}

interface StoreState {
  customer: Customer | null;
  cart: CartLine[];
  saved: string[];
  addToCart: (p: Product) => void;
  removeFromCart: (id: string) => void;
  clearCart: () => void;
  toggleSaved: (id: string) => void;
  login: (phone: string, password: string) => Promise<void>;
  register: (data: { name: string; phone: string; email?: string; password: string; marketingConsent?: boolean }) => Promise<void>;
  logout: () => void;
}

const StoreCtx = createContext<StoreState | null>(null);

const CART_KEY = "aurelia_cart";
const SAVED_KEY = "aurelia_saved";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<CartLine[]>(() => read<CartLine[]>(CART_KEY, []));
  const [saved, setSaved] = useState<string[]>(() => read<string[]>(SAVED_KEY, []));

  useEffect(() => {
    if (getToken()) {
      api
        .get<{ type: string; customer?: Customer }>("/api/auth/me")
        .then((r) => {
          if (r.type === "customer" && r.customer) {
            setCustomer(r.customer);
            setSaved(r.customer.savedProductIds ?? saved);
          }
        })
        .catch(() => setToken(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart]);
  useEffect(() => {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }, [saved]);

  const value = useMemo<StoreState>(
    () => ({
      customer,
      cart,
      saved,
      addToCart: (p) =>
        setCart((prev) => {
          const found = prev.find((l) => l.productId === p.id);
          if (found) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
          return [...prev, { productId: p.id, name: p.name, image: p.image, quantity: 1 }];
        }),
      removeFromCart: (id) => setCart((prev) => prev.filter((l) => l.productId !== id)),
      clearCart: () => setCart([]),
      toggleSaved: (id) => setSaved((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id])),
      login: async (phone, password) => {
        const r = await api.post<{ token: string; customer: Customer }>("/api/auth/customer/login", { phone, password });
        setToken(r.token);
        setCustomer(r.customer);
      },
      register: async (data) => {
        const r = await api.post<{ token: string; customer: Customer }>("/api/auth/customer/register", data);
        setToken(r.token);
        setCustomer(r.customer);
      },
      logout: () => {
        setToken(null);
        setCustomer(null);
      },
    }),
    [customer, cart, saved],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
