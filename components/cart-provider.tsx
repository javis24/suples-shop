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
type PaymentMethod = "CASH" | "TRANSFER" | "ONLINE";
type CheckoutStep = "cart" | "checkout" | "done";

type StoreConfig = {
  whatsappNumber: string;
  onlinePaymentEnabled: boolean;
  bank: { name: string; holder: string; clabe: string };
};

type CreatedOrder = {
  id: number;
  orderNumber: string;
  total: string | number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  paymentMethod: PaymentMethod;
  checkoutUrl: string | null;
  paymentError: string | null;
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
  onlinePaymentEnabled: false,
  bank: { name: "", holder: "", clabe: "" },
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

function paymentLabel(value: PaymentMethod) {
  if (value === "ONLINE") return "Pago en línea con Mercado Pago";
  if (value === "TRANSFER") return "Transferencia bancaria";
  return "Efectivo";
}

function addressLine(address: Record<string, unknown>) {
  const street = String(address.street ?? "").trim();
  const exteriorNo = String(address.exteriorNo ?? "").trim();
  const interiorNo = String(address.interiorNo ?? "").trim();
  const neighborhood = String(address.neighborhood ?? "").trim();
  const city = String(address.city ?? "").trim();
  const state = String(address.state ?? "").trim();
  const postalCode = String(address.postalCode ?? "").trim();

  return [
    [street, exteriorNo ? `#${exteriorNo}` : "", interiorNo ? `Int. ${interiorNo}` : ""]
      .filter(Boolean)
      .join(" "),
    neighborhood ? `Col. ${neighborhood}` : "",
    city,
    state,
    postalCode ? `C.P. ${postalCode}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>("cart");
  const [toast, setToast] = useState("");
  const [config, setConfig] = useState<StoreConfig>(emptyConfig);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
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
          paymentMethod,
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

      const url = whatsappUrl(createdOrder);
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

  function whatsappUrl(order: CreatedOrder) {
    if (!config.whatsappNumber) return "";
    const lines = order.items.map(
      (item) =>
        `• ${item.quantity} × ${item.productName}${item.variantName ? ` (${item.variantName})` : ""}\n  ${money.format(Number(item.unitPrice))} c/u — ${money.format(Number(item.lineTotal))}`,
    );
    const references = String(order.shippingAddress.references ?? "").trim();
    const transfer =
      order.paymentMethod === "TRANSFER" && config.bank.clabe
        ? [
            "",
            `Banco: ${config.bank.name || "Por confirmar"}`,
            `Titular: ${config.bank.holder || "Por confirmar"}`,
            `CLABE: ${config.bank.clabe}`,
          ]
        : [];
    const onlinePayment =
      order.paymentMethod === "ONLINE" && order.checkoutUrl
        ? ["", `Liga para pagar: ${order.checkoutUrl}`]
        : [];
    const message = [
      "Hola Suples Shop, quiero realizar el siguiente pedido:",
      `*Pedido ${order.orderNumber}*`,
      "",
      "*DATOS DEL CLIENTE*",
      `Nombre: ${order.customerName}`,
      `WhatsApp: ${order.customerPhone || "No proporcionado"}`,
      ...(order.customerEmail ? [`Correo: ${order.customerEmail}`] : []),
      "",
      "*PRODUCTOS*",
      ...lines,
      "",
      `*TOTAL: ${money.format(Number(order.total))}*`,
      `*FORMA DE PAGO: ${paymentLabel(order.paymentMethod)}*`,
      "",
      "*DATOS DE ENTREGA*",
      addressLine(order.shippingAddress),
      ...(references ? [`Referencias: ${references}`] : []),
      ...(order.notes ? ["", `Notas: ${order.notes}`] : []),
      ...transfer,
      ...onlinePayment,
    ].join("\n");
    return `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`;
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

                <section>
                  <h3>Forma de pago</h3>
                  <label className="payment-option">
                    <input
                      checked={paymentMethod === "CASH"}
                      name="paymentMethod"
                      onChange={() => setPaymentMethod("CASH")}
                      type="radio"
                    />
                    <span>
                      <strong>Efectivo</strong>
                      <small>Se confirma la entrega o recolección por WhatsApp.</small>
                    </span>
                  </label>
                  <label className="payment-option">
                    <input
                      checked={paymentMethod === "TRANSFER"}
                      name="paymentMethod"
                      onChange={() => setPaymentMethod("TRANSFER")}
                      type="radio"
                    />
                    <span>
                      <strong>Transferencia bancaria</strong>
                      <small>Te mostraremos la CLABE al registrar el pedido.</small>
                    </span>
                  </label>
                  <label className="payment-option">
                    <input
                      checked={paymentMethod === "ONLINE"}
                      disabled={!config.onlinePaymentEnabled}
                      name="paymentMethod"
                      onChange={() => setPaymentMethod("ONLINE")}
                      type="radio"
                    />
                    <span>
                      <strong>Pago en línea</strong>
                      <small>
                        {config.onlinePaymentEnabled
                          ? "Checkout seguro de Mercado Pago."
                          : "Disponible cuando configures Mercado Pago."}
                      </small>
                    </span>
                  </label>
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

                {completedOrder.paymentMethod === "TRANSFER" ? (
                  <div className="bank-details">
                    <strong>Datos para transferencia</strong>
                    <span>Banco: {config.bank.name || "Confirma por WhatsApp"}</span>
                    <span>Titular: {config.bank.holder || "Confirma por WhatsApp"}</span>
                    <span>CLABE: {config.bank.clabe || "Confirma por WhatsApp"}</span>
                  </div>
                ) : null}

                {completedOrder.paymentError ? (
                  <p className="checkout-error">{completedOrder.paymentError}</p>
                ) : null}

                {completedOrder.paymentMethod === "ONLINE" &&
                completedOrder.checkoutUrl ? (
                  <a className="cart-primary cart-link-button" href={completedOrder.checkoutUrl}>
                    Pagar con Mercado Pago
                  </a>
                ) : null}

                {config.whatsappNumber ? (
                  <a
                    className="whatsapp-button"
                    href={whatsappUrl(completedOrder)}
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
