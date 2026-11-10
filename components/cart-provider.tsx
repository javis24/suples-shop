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
  useRef,
  useState,
} from "react";

import { type CheckoutBody, type CheckoutResult, type SavedCheckout, PENDING_CHECKOUT_KEY, LAST_CHECKOUT_KEY } from "@/lib/checkout-browser";

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
type StoreConfig = { whatsappNumber: string };
type CreatedOrder = SavedCheckout;

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  addItem: (item: CartItemInput) => void;
  openCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const CART_STORAGE_KEY = "suples-shop-cart-v1";
const emptyConfig: StoreConfig = { whatsappNumber: "" };

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
  const [pending, setPending] = useState<CheckoutBody | null>(null);
  const submittingRef = useRef(false);
  const drawerRef = useRef<HTMLElement | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CartItem[];
        if (Array.isArray(parsed)) {
          // El carrito solamente se restaura en el navegador.
          setItems(parsed.filter((item) => item.variantId && item.quantity > 0));
        }
      }
    } catch {
      try { window.localStorage.removeItem(CART_STORAGE_KEY); } catch { /* Storage unavailable. */ }
    }
    try {
      const savedPending = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
      if (savedPending) {
        const request = JSON.parse(savedPending) as CheckoutBody;
        if (typeof request.checkoutKey === "string" && Array.isArray(request.items)) setPending(request);
      }
      const savedOrder = window.sessionStorage.getItem(LAST_CHECKOUT_KEY);
      if (savedOrder) {
        const order = JSON.parse(savedOrder) as CreatedOrder;
        if (typeof order.checkoutKey === "string" && typeof order.orderNumber === "string") setCompletedOrder(order);
      }
    } catch { /* Server validation remains authoritative. */ }
    setHydrated(true);

    fetch("/api/store-config")
      .then(async (response) => {
        const payload = await response.json();
        if (response.ok) setConfig(payload.data as StoreConfig);
      })
      .catch(() => undefined);
  }, []);

  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items)); } catch { /* Keep the in-memory cart usable. */ }
  }, [hydrated, items]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    drawerRef.current?.querySelector<HTMLButtonElement>("button[aria-label='Cerrar']")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !drawerRef.current) return;
      const nodes = Array.from(drawerRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)")).filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus?.focus();
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
    if (pending) { setOpen(true); setStep("cart"); return; }
    if (!Number.isFinite(item.stock) || item.stock < 1) return;
    setItems((current) => {
      const existing = current.find((entry) => entry.variantId === item.variantId);
      if (existing) {
        return current.map((entry) =>
          entry.variantId === item.variantId
            ? {
                ...entry,
                ...item,
                quantity: Math.min(entry.quantity + 1, Math.max(1, item.stock), 100),
              }
            : entry,
        );
      }
      return [...current, { ...item, quantity: 1 }];
    });
    setToast(`${item.productName} se agregó al carrito`);
  }, [pending]);

  function setQuantity(variantId: number, quantity: number) {
    if (pending || submittingRef.current) return;
    setItems((current) =>
      current
        .map((item) =>
          item.variantId === variantId
            ? { ...item, quantity: Math.min(Math.max(0, quantity), item.stock, 100) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(variantId: number) {
    if (pending || submittingRef.current) return;
    setItems((current) => current.filter((item) => item.variantId !== variantId));
  }

  function closeCart() {
    setOpen(false);
    setError("");
  }

  async function sendCheckout(body: CheckoutBody, recoverFirst = false) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      let response: Response;
      if (recoverFirst) {
        response = await fetch("/api/checkout/recover", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutKey: body.checkoutKey }),
        });
        if (response.status === 404) {
          response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        }
      } else {
        response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const payload = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          try { sessionStorage.removeItem(PENDING_CHECKOUT_KEY); } catch {}
          setPending(null);
        }
        throw new Error(payload.error?.message || "No fue posible registrar el pedido.");
      }
      const order = { ...(payload.data as CheckoutResult), checkoutKey: body.checkoutKey };
      try {
        sessionStorage.setItem(LAST_CHECKOUT_KEY, JSON.stringify(order));
        sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
      } catch { /* The order is already saved on the server. */ }
      setCompletedOrder(order);
      setPending(null);
      setItems([]);
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible verificar el pedido. Usa Recuperar pedido pendiente.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function refreshLastOrder() {
    if (!completedOrder || submittingRef.current) return;
    setSubmitting(true);
    submittingRef.current = true;
    setError("");
    try {
      const response = await fetch("/api/checkout/recover", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutKey: completedOrder.checkoutKey }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "No fue posible recuperar el pedido.");
      setCompletedOrder({ ...payload.data, checkoutKey: completedOrder.checkoutKey });
      setStep("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible recuperar el pedido.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!items.length || pending || submittingRef.current) return;
    const form = new FormData(event.currentTarget);
    const body: CheckoutBody = {
      checkoutKey: crypto.randomUUID(),
      customerName: String(form.get("customerName") ?? "").trim(),
      customerPhone: String(form.get("customerPhone") ?? "").trim(),
      customerEmail: String(form.get("customerEmail") ?? "").trim() || null,
      shippingAddress: Object.fromEntries(
        ["street", "exteriorNo", "interiorNo", "neighborhood", "city", "state", "postalCode", "references"].map(key => [key, String(form.get(key) ?? "").trim()]),
      ),
      notes: String(form.get("notes") ?? "").trim() || null,
      items: items.map(item => ({ variantId: item.variantId, quantity: item.quantity })),
    };
    try {
      // Persist BEFORE sending, so reloads/retries keep the same idempotency key.
      sessionStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(body));
    } catch {
      setError("Permite el almacenamiento de esta pestaña para poder recuperar tu pedido si se interrumpe la conexión.");
      return;
    }
    setPending(body);
    await sendCheckout(body);
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
          <aside ref={drawerRef} aria-modal="true" aria-labelledby="cart-dialog-title" className="cart-drawer" role="dialog">
            <header className="cart-drawer-header">
              <div>
                <small>SUPLES SHOP</small>
                <h2 id="cart-dialog-title">
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


            {pending ? (
              <div className="checkout-recovery" role="status">
                <strong>Hay una solicitud pendiente de verificar.</strong>
                <p>Recupérala antes de preparar otro pedido para evitar duplicados.</p>
                <button type="button" disabled={submitting} onClick={() => void sendCheckout(pending, true)}>
                  {submitting ? "Verificando…" : "Recuperar pedido pendiente"}
                </button>
              </div>
            ) : completedOrder && step !== "done" ? (
              <div className="checkout-recovery">
                <button type="button" disabled={submitting} onClick={() => void refreshLastOrder()}>
                  Ver último pedido: {completedOrder.orderNumber}
                </button>
              </div>
            ) : null}
            {error ? <p className="checkout-error" role="alert">{error}</p> : null}
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
                                disabled={Boolean(pending) || item.quantity >= Math.min(item.stock, 100)}
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
                      disabled={submitting || Boolean(pending)}
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
                <p className="checkout-policy-note">Envío a domicilio. El costo de envío y la forma de pago se acuerdan por WhatsApp; no están incluidos en el subtotal.</p>
                <fieldset className="checkout-fields" disabled={submitting || Boolean(pending)}>
                <section>
                  <h3>Datos de contacto</h3>
                  <label>
                    Nombre completo
                    <input name="customerName" autoComplete="name" required minLength={3} maxLength={220} />
                  </label>
                  <div className="checkout-two-columns">
                    <label>
                      WhatsApp
                      <input name="customerPhone" type="tel" autoComplete="tel" required inputMode="tel" minLength={10} maxLength={30} />
                    </label>
                    <label>
                      Correo (opcional)
                      <input name="customerEmail" type="email" autoComplete="email" maxLength={190} />
                    </label>
                  </div>
                </section>

                <section>
                  <h3>Dirección de entrega</h3>
                  <label>
                    Calle
                    <input name="street" autoComplete="address-line1" required minLength={2} maxLength={255} />
                  </label>
                  <div className="checkout-three-columns">
                    <label>
                      Núm. exterior
                      <input name="exteriorNo" required maxLength={40} />
                    </label>
                    <label>
                      Núm. interior
                      <input name="interiorNo" maxLength={40} />
                    </label>
                    <label>
                      C.P.
                      <input name="postalCode" autoComplete="postal-code" required inputMode="numeric" pattern="[0-9]{5}" minLength={5} maxLength={5} />
                    </label>
                  </div>
                  <label>
                    Colonia
                    <input name="neighborhood" required minLength={2} maxLength={160} />
                  </label>
                  <div className="checkout-two-columns">
                    <label>
                      Ciudad
                      <input name="city" autoComplete="address-level2" required minLength={2} maxLength={120} />
                    </label>
                    <label>
                      Estado
                      <input name="state" autoComplete="address-level1" required minLength={2} maxLength={120} />
                    </label>
                  </div>
                  <label>
                    Referencias (opcional)
                    <input name="references" maxLength={500} />
                  </label>
                </section>

                <label>
                  Notas del pedido (opcional)
                  <textarea name="notes" rows={3} maxLength={1000} />
                </label>
                </fieldset>


                <div className="checkout-total">
                  <span>Total de productos</span>
                  <strong>{money.format(subtotal)}</strong>
                </div>
                {!config.whatsappNumber ? (
                  <p className="checkout-error">
                    Los pedidos por WhatsApp no están disponibles en este momento.
                  </p>
                ) : null}
                <button
                  className="cart-primary"
                  disabled={submitting || Boolean(pending) || !config.whatsappNumber}
                  type="submit"
                >
                  {submitting
                    ? "Registrando pedido…"
                    : config.whatsappNumber
                      ? "Registrar pedido y continuar a WhatsApp"
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
                  {completedOrder.status === "CANCELED" ? "Este pedido está cancelado." :
                    "Pedido guardado por " + money.format(Number(completedOrder.total)) + (completedOrder.shippingQuoted ? ", con envío confirmado." : " en productos. El envío se cotiza por separado.")}
                </p>
                {completedOrder.whatsappUrl && completedOrder.status !== "CANCELED" ? (
                  <>
                    <p>Abre WhatsApp y pulsa Enviar para que la tienda reciba tu mensaje.</p>
                    <a className="whatsapp-button" href={completedOrder.whatsappUrl} rel="noreferrer" target="_blank">
                      Abrir WhatsApp y enviar pedido
                    </a>
                    <button type="button" className="cart-secondary" disabled={submitting} onClick={() => void refreshLastOrder()}>
                      Actualizar resumen del pedido
                    </button>
                  </>
                ) : null}
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
