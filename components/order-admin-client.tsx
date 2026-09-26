"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar, type AdminSidebarUser } from "@/components/admin-sidebar";

type OrderStatus = "PENDING" | "CONFIRMED" | "PREPARING" | "SHIPPED" | "DELIVERED" | "CANCELED";
type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";

type OrderSummary = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  total: string | number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "CASH" | "TRANSFER" | "ONLINE";
  createdAt: string;
  items: OrderItem[];
};

type OrderItem = {
  id: number;
  variantId: number | null;
  sku: string;
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: string | number;
  lineTotal: string | number;
};

type OrderDetail = OrderSummary & {
  customerEmail: string | null;
  notes: string | null;
  subtotal: string | number;
  discount: string | number;
  shipping: string | number;
  shippingAddress: Record<string, unknown>;
  statusHistory: Array<{
    id: number;
    from: OrderStatus | null;
    to: OrderStatus;
    note: string | null;
    createdAt: string;
    user?: { name: string } | null;
  }>;
  whatsappLogs: Array<{
    id: number;
    destination: string;
    message: string;
    action: string;
    createdAt: string;
    user?: { name: string } | null;
  }>;
};

type ProductResult = {
  id: number;
  name: string;
  variants: Array<{
    id: number;
    sku: string;
    flavor: string | null;
    presentation: string | null;
    price: string | number;
    stock: number;
    active: boolean;
  }>;
};

type Pagination = { total: number; page: number; limit: number; totalPages: number };

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

const orderLabels: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PREPARING: "Preparando",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELED: "Cancelado",
};

const paymentLabels: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  FAILED: "Fallido",
  REFUNDED: "Reembolsado",
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "No se pudo completar la operación.");
  }
  return payload as { data: T; meta?: Pagination };
}

function addressText(address: Record<string, unknown>) {
  return [
    [address.street, address.exteriorNo ? `#${address.exteriorNo}` : "", address.interiorNo ? `Int. ${address.interiorNo}` : ""].filter(Boolean).join(" "),
    address.neighborhood ? `Col. ${address.neighborhood}` : "",
    address.city,
    address.state,
    address.postalCode ? `C.P. ${address.postalCode}` : "",
  ].filter(Boolean).join(", ");
}

export function OrderAdminClient() {
  const router = useRouter();
  const [user, setUser] = useState<AdminSidebarUser | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const [selected, setSelected] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [draftStatus, setDraftStatus] = useState<OrderStatus>("PENDING");
  const [draftPayment, setDraftPayment] = useState<PaymentStatus>("PENDING");
  const [statusNote, setStatusNote] = useState("");
  const [draftItems, setDraftItems] = useState<Array<{ variantId: number; quantity: number; label: string; price: number }>>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductResult[]>([]);

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (appliedQuery) params.set("q", appliedQuery);
      if (status) params.set("status", status);
      if (paymentStatus) params.set("paymentStatus", paymentStatus);
      const result = await request<OrderSummary[]>(`/api/orders?${params}`);
      setOrders(result.data);
      if (result.meta) setPagination(result.meta);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron cargar los pedidos.");
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, paymentStatus, status, user]);

  useEffect(() => {
    request<AdminSidebarUser>("/api/auth/me")
      .then((result) => setUser(result.data))
      .catch(() => router.replace("/dashboard"));
  }, [router]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function openOrder(id: number) {
    setBusy(true);
    setNotice("");
    try {
      const result = await request<OrderDetail>(`/api/orders/${id}`);
      setSelected(result.data);
      setDraftStatus(result.data.status);
      setDraftPayment(result.data.paymentStatus);
      setDraftItems(
        result.data.items
          .filter((item) => item.variantId)
          .map((item) => ({
            variantId: item.variantId!,
            quantity: item.quantity,
            label: item.variantName ? `${item.productName} · ${item.variantName}` : item.productName,
            price: Number(item.unitPrice),
          })),
      );
      setProductResults([]);
      setProductQuery("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo abrir el pedido.");
    } finally {
      setBusy(false);
    }
  }

  async function saveOrderStatus(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      const result = await request<OrderDetail>(`/api/orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draftStatus,
          paymentStatus: draftPayment,
          note: statusNote || null,
        }),
      });
      setSelected(result.data);
      setStatusNote("");
      setNotice("Pedido actualizado.");
      await loadOrders();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar el pedido.");
    } finally {
      setBusy(false);
    }
  }

  const canEditItems = useMemo(
    () =>
      Boolean(
        selected &&
          selected.paymentStatus !== "PAID" &&
          !["SHIPPED", "DELIVERED", "CANCELED"].includes(selected.status),
      ),
    [selected],
  );

  async function saveItems() {
    if (!selected || !canEditItems) return;
    if (!draftItems.length) {
      setNotice("El pedido debe conservar al menos un producto.");
      return;
    }
    setBusy(true);
    try {
      const result = await request<OrderDetail>(`/api/orders/${selected.id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: draftItems.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        }),
      });
      setSelected(result.data);
      setDraftItems(
        result.data.items
          .filter((item) => item.variantId)
          .map((item) => ({
            variantId: item.variantId!,
            quantity: item.quantity,
            label: item.variantName ? `${item.productName} · ${item.variantName}` : item.productName,
            price: Number(item.unitPrice),
          })),
      );
      setNotice("Productos del pedido actualizados e inventario conciliado.");
      await loadOrders();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron actualizar los productos.");
    } finally {
      setBusy(false);
    }
  }

  async function searchProducts(event: FormEvent) {
    event.preventDefault();
    if (!productQuery.trim()) return;
    try {
      const result = await request<ProductResult[]>(
        `/api/products?all=true&status=ACTIVE&limit=12&q=${encodeURIComponent(productQuery.trim())}`,
      );
      setProductResults(result.data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron buscar productos.");
    }
  }

  function addVariant(product: ProductResult, variant: ProductResult["variants"][number]) {
    setDraftItems((current) => {
      const existing = current.find((item) => item.variantId === variant.id);
      if (existing) {
        return current.map((item) =>
          item.variantId === variant.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...current,
        {
          variantId: variant.id,
          quantity: 1,
          label: [product.name, variant.presentation, variant.flavor].filter(Boolean).join(" · "),
          price: Number(variant.price),
        },
      ];
    });
  }

  async function openWhatsApp() {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await request<{ url: string; log: OrderDetail["whatsappLogs"][number] }>(
        `/api/orders/${selected.id}/whatsapp`,
        { method: "POST" },
      );
      if (result.data.url) window.open(result.data.url, "_blank", "noopener,noreferrer");
      await openOrder(selected.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo preparar WhatsApp.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <main className="access-screen"><div className="access-card"><div className="dashboard-loader" /><p>Preparando pedidos…</p></div></main>;
  }

  return (
    <main className="admin-shell orders-admin-shell">
      <AdminSidebar active="orders" user={user} />
      <section className="admin-content orders-admin-content">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow dark">OPERACIÓN</span>
            <h1>Pedidos</h1>
            <p>Administra productos, pagos, estados e historial de WhatsApp.</p>
          </div>
        </header>

        {notice ? <div className="admin-notice">{notice}<button onClick={() => setNotice("")} type="button">×</button></div> : null}

        <section className="orders-toolbar">
          <form onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedQuery(query.trim()); }}>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, cliente, correo o WhatsApp" />
            <button type="submit">Buscar</button>
          </form>
          <select value={status} onChange={(event) => { setStatus(event.target.value as OrderStatus | ""); setPage(1); }}>
            <option value="">Todos los estados</option>
            {Object.entries(orderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value as PaymentStatus | ""); setPage(1); }}>
            <option value="">Todos los pagos</option>
            {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </section>

        <section className="orders-layout">
          <article className="panel orders-list-panel">
            <div className="panel-heading">
              <div><span className="eyebrow dark">PEDIDOS</span><h2>{pagination.total.toLocaleString("es-MX")} registros</h2></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th>Pago</th><th>Total</th><th></th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={6}>Cargando pedidos…</td></tr> : orders.length ? orders.map((order) => (
                    <tr key={order.id} className={selected?.id === order.id ? "selected-order-row" : ""}>
                      <td><strong>{order.orderNumber}</strong><small className="order-date">{dateTime.format(new Date(order.createdAt))}</small></td>
                      <td>{order.customerName}<small className="order-date">{order.customerPhone || "Sin teléfono"}</small></td>
                      <td><span className={`order-badge status-${order.status.toLowerCase()}`}>{orderLabels[order.status]}</span></td>
                      <td><span className={`order-badge payment-${order.paymentStatus.toLowerCase()}`}>{paymentLabels[order.paymentStatus]}</span></td>
                      <td>{money.format(Number(order.total))}</td>
                      <td><button className="order-open-button" onClick={() => void openOrder(order.id)} type="button">Abrir</button></td>
                    </tr>
                  )) : <tr><td colSpan={6}>No se encontraron pedidos.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="orders-pagination">
              <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} type="button">Anterior</button>
              <span>Página {pagination.page} de {pagination.totalPages}</span>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)} type="button">Siguiente</button>
            </div>
          </article>

          <aside className="panel order-detail-panel">
            {!selected ? (
              <div className="order-empty-detail"><strong>Selecciona un pedido</strong><p>Aquí podrás revisar productos, datos de entrega, pago y WhatsApp.</p></div>
            ) : (
              <>
                <div className="order-detail-heading">
                  <div><span className="eyebrow dark">DETALLE</span><h2>{selected.orderNumber}</h2><p>{selected.customerName} · {selected.customerPhone || "Sin teléfono"}</p></div>
                  <button disabled={busy} onClick={() => void openWhatsApp()} type="button">Abrir WhatsApp</button>
                </div>

                <div className="order-summary-cards">
                  <div><small>Total</small><strong>{money.format(Number(selected.total))}</strong></div>
                  <div><small>Productos</small><strong>{selected.items.reduce((sum, item) => sum + item.quantity, 0)}</strong></div>
                  <div><small>Pago</small><strong>{paymentLabels[selected.paymentStatus]}</strong></div>
                </div>

                <section className="order-section">
                  <h3>Estado y pago</h3>
                  <form className="order-status-form" onSubmit={saveOrderStatus}>
                    <label>Estado<select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as OrderStatus)}>{Object.entries(orderLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label>Pago<select value={draftPayment} onChange={(event) => setDraftPayment(event.target.value as PaymentStatus)}>{Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                    <label className="order-note-field">Nota<input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Ej. Cliente confirmó por WhatsApp" /></label>
                    <button disabled={busy} type="submit">Guardar cambios</button>
                  </form>
                </section>

                <section className="order-section">
                  <div className="order-section-title"><h3>Productos del pedido</h3><span>{canEditItems ? "Editable" : "Bloqueado por estado/pago"}</span></div>
                  <div className="order-items-editor">
                    {draftItems.map((item) => (
                      <div key={item.variantId} className="order-edit-item">
                        <div><strong>{item.label}</strong><small>{money.format(item.price)} c/u</small></div>
                        <input disabled={!canEditItems} min={1} onChange={(event) => setDraftItems((current) => current.map((row) => row.variantId === item.variantId ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) } : row))} type="number" value={item.quantity} />
                        <button disabled={!canEditItems} onClick={() => setDraftItems((current) => current.filter((row) => row.variantId !== item.variantId))} type="button">Quitar</button>
                      </div>
                    ))}
                  </div>

                  {canEditItems ? (
                    <>
                      <form className="order-product-search" onSubmit={searchProducts}>
                        <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="Buscar producto o SKU para agregar" />
                        <button type="submit">Buscar producto</button>
                      </form>
                      {productResults.length ? (
                        <div className="order-product-results">
                          {productResults.flatMap((product) => product.variants.filter((variant) => variant.active).map((variant) => (
                            <button key={variant.id} onClick={() => addVariant(product, variant)} type="button">
                              <span><strong>{product.name}</strong><small>{variant.sku} · Stock {variant.stock}</small></span>
                              <b>{money.format(Number(variant.price))}</b>
                            </button>
                          )))}
                        </div>
                      ) : null}
                      <button className="order-save-items" disabled={busy || !draftItems.length} onClick={() => void saveItems()} type="button">Guardar productos e inventario</button>
                    </>
                  ) : null}
                </section>

                <section className="order-section">
                  <h3>Entrega</h3>
                  <p className="order-address">{addressText(selected.shippingAddress)}</p>
                  {selected.notes ? <p className="order-notes"><strong>Notas:</strong> {selected.notes}</p> : null}
                </section>

                <section className="order-section">
                  <h3>Historial de estados</h3>
                  <div className="order-history">
                    {selected.statusHistory.map((entry) => (
                      <div key={entry.id}>
                        <span>{orderLabels[entry.to]}</span>
                        <p>{entry.note || "Cambio de estado"}{entry.user ? ` · ${entry.user.name}` : ""}</p>
                        <small>{dateTime.format(new Date(entry.createdAt))}</small>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="order-section">
                  <div className="order-section-title"><h3>Bitácora de WhatsApp</h3><span>{selected.whatsappLogs.length} registro(s)</span></div>
                  <p className="whatsapp-audit-help">Se guarda el texto preparado y la apertura de WhatsApp. Con wa.me no es posible confirmar entrega o lectura del mensaje.</p>
                  <div className="whatsapp-log-list">
                    {selected.whatsappLogs.length ? selected.whatsappLogs.map((log) => (
                      <details key={log.id}>
                        <summary><strong>{log.action.startsWith("CHECKOUT") ? "Checkout" : "Administrador"}</strong><span>{dateTime.format(new Date(log.createdAt))}</span></summary>
                        <div><small>Destino: {log.destination}{log.user ? ` · ${log.user.name}` : ""}</small><pre>{log.message}</pre></div>
                      </details>
                    )) : <p>Aún no hay registros de WhatsApp.</p>}
                  </div>
                </section>
              </>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}
