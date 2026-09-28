"use client";

/* eslint-disable @next/next/no-img-element */

import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartItemInput = {
  productId: number;
  variantId: number;
  slug: string;
  productName: string;
  sku: string;
  variantName: string | null;
  unit: string;
  price: number;
  stock: number;
  imageUrl: string | null;
};

type CartItem = CartItemInput & { quantity: number };
type CheckoutStep = "cart" | "checkout" | "done";

type StoreConfig = {
  whatsappNumber: string;
};

type CreatedOrder = {
  id: number;
  orderNumber: string;
  total: string | number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  whatsappUrl: string;
  whatsappMessage: string;
  items: Array<{
    id: number;
    productName: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string | number;
    lineTotal: string | number;
  }>;
  shippingAddress: Record<string, unknown>;
};

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  addItem: (item: CartItemInput) => void;
  openCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const CART_STORAGE_KEY = "suples-shop-cart-v1";
const emptyConfig: StoreConfig = {
  whatsappNumber: "",
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("cart");
  const [toast, setToast] = useState("");
  const [config, setConfig] = useState<StoreConfig>(emptyConfig);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [completedOrder, setCompletedOrder] = useState<CreatedOrder | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CartItem[];
        if (Array.isArray(parsed)) {
          // El carrito solamente se restaura en el navegador.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItems(parsed.filter((item) => item.variantId && item.quantity > 0));
        }
      }
    } catch {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    }
    setHydrated(true);

    fetch("/api/store-config")
      .then(async (response) => {
        const payload = await response.json();
        if (response.ok) setConfig(payload.data as StoreConfig);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [hydrated, items]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const itemCount = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );
  const subtotal = useMemo(
    () => items.reduce((total, item) => total + item.price * item.quantity, 0),
    [items],
  );

  const openCart = useCallback(() => {
    setStep("cart");
    setError("");
    setOpen(true);
  }, []);

  const addItem = useCallback((item: CartItemInput) => {
    setItems((current) => {
      const existing = current.find((entry) => entry.variantId === item.variantId);
      if (existing) {
        return current.map((entry) =>
          entry.variantId === item.variantId
            ? {
                ...entry,
                ...item,
                quantity: Math.min(entry.quantity + 1, Math.max(1, item.stock)),
              }
            : entry,
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
    setToast(`${item.productName} se agregó al carrito`);
  }, []);

  function setQuantity(variantId: number, quantity: number) {
    setItems((current) =>
      current
        .map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: Math.min(Math.max(0, quantity), item.stock) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(variantId: number) {
    setItems((current) => current.filter((item) => item.variantId !== variantId));
  }

  function closeCart() {
    setOpen(false);
    setError("");
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!items.length) return;

    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const whatsappWindow = config.whatsappNumber
      ? window.open("about:blank", "_blank")
      : null;

    if (whatsappWindow) {
      whatsappWindow.document.title = "Preparando pedido para WhatsApp";
      whatsappWindow.document.body.textContent =
        "Estamos registrando tu pedido y preparando WhatsApp…";
    }

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: String(form.get("customerName") ?? ""),
          customerEmail: String(form.get("customerEmail") ?? "") || null,
          customerPhone: String(form.get("customerPhone") ?? ""),
          shipping: 0,
          shippingAddress: {
            street: String(form.get("street") ?? ""),
            exteriorNo: String(form.get("exteriorNo") ?? ""),
            interiorNo: String(form.get("interiorNo") ?? ""),
            neighborhood: String(form.get("neighborhood") ?? ""),
            city: String(form.get("city") ?? ""),
            state: String(form.get("state") ?? ""),
            postalCode: String(form.get("postalCode") ?? ""),
            references: String(form.get("references") ?? ""),
          },
          notes: String(form.get("notes") ?? "") || null,
          items: items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error?.message || "No fue posible crear el pedido");
      }

      const createdOrder = payload.data as CreatedOrder;
      setCompletedOrder(createdOrder);
      setItems([]);
      setStep("done");

      const url = createdOrder.whatsappUrl;
      if (url && whatsappWindow && !whatsappWindow.closed) {
        whatsappWindow.opener = null;
        whatsappWindow.location.href = url;
      } else if (url) {
        window.location.assign(url);
      } else {
        whatsappWindow?.close();
        setError(
          "El pedido se registró, pero falta configurar el número de WhatsApp de la tienda.",
        );
      }
    } catch (orderError) {
      whatsappWindow?.close();
      setError(
        orderError instanceof Error
          ? orderError.message
          : "No fue posible crear el pedido",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const context = useMemo<CartContextValue>(
    () => ({ items, itemCount, addItem, openCart }),
    [addItem, itemCount, items, openCart],
  );

  return (
    <CartContext.Provider value={context}>
      {children}

      {toast ? (
        <div className="cart-toast" role="status" aria-live="polite">
          <span>✓</span>
          <div>
            <strong>Producto agregado</strong>
            <small>{toast}</small>
          </div>
          <button onClick={openCart} type="button">
            Ver carrito
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="cart-layer">
          <button
            aria-label="Cerrar carrito"
            className="cart-backdrop"
            onClick={closeCart}
            type="button"
          />
          <aside aria-modal="true" className="cart-drawer" role="dialog">
            <header className="cart-drawer-header">
              <div>
                <small>SUPLES SHOP</small>
                <h2>
                  {step === "cart"
                    ? "Tu carrito"
                    : step === "checkout"
                      ? "Finalizar pedido"
                      : "Pedido registrado"}
                </h2>
              </div>
              <button aria-label="Cerrar" onClick={closeCart} type="button">
                ×
              </button>
            </header>

            {step === "cart" ? (
              <div className="cart-drawer-body">
                {!items.length ? (
                  <div className="cart-empty">
                    <span>▱</span>
                    <strong>Tu carrito está vacío</strong>
                    <p>Agrega uno o varios productos para preparar tu pedido.</p>
                    <button onClick={closeCart} type="button">
                      Seguir comprando
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="cart-lines">
                      {items.map((item) => (
                        <article className="cart-line" key={item.variantId}>
                          <div className="cart-line-image">
                            {item.imageUrl ? (
                              <img alt={item.productName} src={item.imageUrl} />
                            ) : (
                              <span>{item.productName.slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          <div className="cart-line-info">
                            <strong>{item.productName}</strong>
                            <small>{item.variantName || item.sku}</small>
                            <b>{money.format(item.price)}</b>
                            <div className="cart-quantity">
                              <button
                                aria-label={`Quitar una unidad de ${item.productName}`}
                                onClick={() => setQuantity(item.variantId, item.quantity - 1)}
                                type="button"
                              >
                                −
                              </button>
                              <span>{item.quantity}</span>
                              <button
                                aria-label={`Agregar una unidad de ${item.productName}`}
                                disabled={item.quantity >= item.stock}
                                onClick={() => setQuantity(item.variantId, item.quantity + 1)}
                                type="button"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          <button
                            aria-label={`Eliminar ${item.productName}`}
                            className="cart-remove"
                            onClick={() => removeItem(item.variantId)}
                            type="button"
                          >
                            ×
                          </button>
                        </article>
                      ))}
                    </div>
                    <div className="cart-summary">
                      <span>
                        Subtotal <small>{itemCount} productos</small>
                      </span>
                      <strong>{money.format(subtotal)}</strong>
                    </div>
                    <p className="cart-shipping-note">
                      El costo y la forma de entrega se confirman por WhatsApp.
                    </p>
                    <button
                      className="cart-primary"
                      onClick={() => setStep("checkout")}
                      type="button"
                    >
                      Continuar con el pedido
                    </button>
                    <button className="cart-secondary" onClick={closeCart} type="button">
                      Seguir comprando
                    </button>
                  </>
                )}
              </div>
            ) : null}

            {step === "checkout" ? (
              <form className="checkout-form" onSubmit={createOrder}>
                <section>
                  <h3>Datos de contacto</h3>
                  <label>
                    Nombre completo
                    <input name="customerName" required minLength={3} />
                  </label>
                  <div className="checkout-two-columns">
                    <label>
                      WhatsApp
                      <input name="customerPhone" required inputMode="tel" />
                    </label>
                    <label>
                      Correo (opcional)
                      <input name="customerEmail" type="email" />
                    </label>
                  </div>
                </section>

                <section>
                  <h3>Dirección de entrega</h3>
                  <label>
                    Calle
                    <input name="street" required />
                  </label>
                  <div className="checkout-three-columns">
                    <label>
                      Núm. exterior
                      <input name="exteriorNo" required />
                    </label>
                    <label>
                      Núm. interior
                      <input name="interiorNo" />
                    </label>
                    <label>
                      C.P.
                      <input name="postalCode" required inputMode="numeric" maxLength={10} />
                    </label>
                  </div>
                  <label>
                    Colonia
                    <input name="neighborhood" required />
                  </label>
                  <div className="checkout-two-columns">
                    <label>
                      Ciudad
                      <input name="city" required />
                    </label>
                    <label>
                      Estado
                      <input name="state" required />
                    </label>
                  </div>
                  <label>
                    Referencias (opcional)
                    <input name="references" />
                  </label>
                </section>

                <section className="checkout-payment-note">
                  <h3>Pago</h3>
                  <p>La forma de pago se confirma directamente con Suples Shop por WhatsApp.</p>
                </section>

                <label>
                  Notas del pedido (opcional)
                  <textarea name="notes" rows={3} />
                </label>

                {error ? <p className="checkout-error">{error}</p> : null}

                <div className="checkout-total">
                  <span>Total de productos</span>
                  <strong>{money.format(subtotal)}</strong>
                </div>
                {!config.whatsappNumber ? (
                  <p className="checkout-error">
                    Falta configurar STORE_WHATSAPP_NUMBER para enviar el pedido.
                  </p>
                ) : null}
                <button
                  className="cart-primary"
                  disabled={submitting || !config.whatsappNumber}
                  type="submit"
                >
                  {submitting
                    ? "Registrando pedido…"
                    : config.whatsappNumber
                      ? "Registrar y enviar por WhatsApp"
                      : "WhatsApp no configurado"}
                </button>
                <button
                  className="cart-secondary"
                  disabled={submitting}
                  onClick={() => setStep("cart")}
                  type="button"
                >
                  Volver al carrito
                </button>
              </form>
            ) : null}

            {step === "done" && completedOrder ? (
              <div className="checkout-complete">
                <span className="checkout-complete-icon">✓</span>
                <small>PEDIDO REGISTRADO</small>
                <h3>{completedOrder.orderNumber}</h3>
                <p>
                  Guardamos el pedido por {money.format(Number(completedOrder.total))}.
                  Ahora elige la siguiente acción.
                </p>

                {config.whatsappNumber ? (
                  <a
                    className="whatsapp-button"
                    href={completedOrder.whatsappUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>◉</span> Enviar pedido por WhatsApp
                  </a>
                ) : (
                  <p className="checkout-error">
                    Configura STORE_WHATSAPP_NUMBER para habilitar WhatsApp.
                  </p>
                )}
                <button className="cart-secondary" onClick={closeCart} type="button">
                  Cerrar
                </button>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </CartContext.Provider>
  );
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart debe utilizarse dentro de CartProvider");
  return value;
}
