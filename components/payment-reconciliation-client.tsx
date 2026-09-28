"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar, type AdminSidebarUser } from "@/components/admin-sidebar";

type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
type ReconciliationStatus = "PENDING" | "PARTIAL" | "PAID";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD";

type PaymentRecord = {
  id: number;
  amount: string | number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  receivedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: { id: number; name: string };
  voidedBy?: { id: number; name: string } | null;
  createdAt: string;
};

type ReconciliationOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  total: string | number;
  paymentStatus: PaymentStatus;
  createdAt: string;
  status: string;
  paidAmount: number;
  balance: number;
  reconciliationStatus: ReconciliationStatus;
  payments: PaymentRecord[];
};

type Pagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const dateTime = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

const methodLabels: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
  CARD: "Tarjeta",
};

const reconciliationLabels: Record<ReconciliationStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "No se pudo completar la operación.");
  }
  return payload as { data: T; meta?: Pagination };
}

export function PaymentReconciliationClient() {
  const router = useRouter();
  const [user, setUser] = useState<AdminSidebarUser | null>(null);
  const [orders, setOrders] = useState<ReconciliationOrder[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const [selected, setSelected] = useState<ReconciliationOrder | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadOrders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "20",
      });
      if (appliedQuery) params.set("q", appliedQuery);
      if (paymentStatus) params.set("paymentStatus", paymentStatus);
      const result = await request<ReconciliationOrder[]>(
        `/api/payments/reconciliation?${params}`,
      );
      setOrders(result.data);
      if (result.meta) setPagination(result.meta);

      if (selected) {
        const refreshed = result.data.find((order) => order.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudieron cargar los pagos.");
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, page, paymentStatus, selected, user]);

  useEffect(() => {
    request<AdminSidebarUser>("/api/auth/me")
      .then((result) => setUser(result.data))
      .catch(() => router.replace("/dashboard"));
  }, [router]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const metrics = useMemo(() => {
    const paid = orders.reduce((sum, order) => sum + order.paidAmount, 0);
    const pending = orders.reduce((sum, order) => sum + order.balance, 0);
    const partial = orders.filter((order) => order.reconciliationStatus === "PARTIAL").length;
    return { paid, pending, partial };
  }, [orders]);

  function chooseOrder(order: ReconciliationOrder) {
    setSelected(order);
    setAmount(order.balance > 0 ? order.balance.toFixed(2) : "");
    setMethod("CASH");
    setReference("");
    setNote("");
    setReceivedAt("");
    setNotice("");
  }

  async function registerPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setNotice("Escribe un importe válido.");
      return;
    }

    setBusy(true);
    try {
      await request(`/api/orders/${selected.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: numericAmount,
          method,
          reference: reference.trim() || null,
          note: note.trim() || null,
          receivedAt: receivedAt || undefined,
        }),
      });

      const detail = await request<ReconciliationOrder>(
        `/api/orders/${selected.id}/payments`,
      );
      const activePayments = detail.data.payments.filter((payment) => !payment.voidedAt);
      const paidAmount =
        Math.round(
          activePayments.reduce((sum, payment) => sum + Number(payment.amount), 0) * 100,
        ) / 100;
      const balance = Math.max(
        0,
        Math.round((Number(detail.data.total) - paidAmount) * 100) / 100,
      );
      const reconciliationStatus: ReconciliationStatus =
        paidAmount <= 0 ? "PENDING" : balance > 0 ? "PARTIAL" : "PAID";

      setSelected({
        ...detail.data,
        paidAmount,
        balance,
        reconciliationStatus,
      });
      setAmount(balance > 0 ? balance.toFixed(2) : "");
      setReference("");
      setNote("");
      setReceivedAt("");
      setNotice("Pago registrado correctamente.");
      await loadOrders();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo registrar el pago.");
    } finally {
      setBusy(false);
    }
  }

  async function voidPayment(payment: PaymentRecord) {
    if (!selected || payment.voidedAt) return;
    const reason = window.prompt(
      `Motivo para anular el pago de ${money.format(Number(payment.amount))}:`,
    );
    if (!reason?.trim()) return;

    setBusy(true);
    try {
      await request(
        `/api/orders/${selected.id}/payments/${payment.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason.trim() }),
        },
      );
      const detail = await request<ReconciliationOrder>(
        `/api/orders/${selected.id}/payments`,
      );
      const activePayments = detail.data.payments.filter((item) => !item.voidedAt);
      const paidAmount =
        Math.round(
          activePayments.reduce((sum, item) => sum + Number(item.amount), 0) * 100,
        ) / 100;
      const balance = Math.max(
        0,
        Math.round((Number(detail.data.total) - paidAmount) * 100) / 100,
      );
      const reconciliationStatus: ReconciliationStatus =
        paidAmount <= 0 ? "PENDING" : balance > 0 ? "PARTIAL" : "PAID";
      setSelected({ ...detail.data, paidAmount, balance, reconciliationStatus });
      setAmount(balance > 0 ? balance.toFixed(2) : "");
      setNotice("Pago anulado; el saldo fue recalculado.");
      await loadOrders();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo anular el pago.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <main className="access-screen">
        <div className="access-card">
          <div className="dashboard-loader" />
          <p>Preparando conciliación…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-shell payment-admin-shell">
      <AdminSidebar active="payments" user={user} />
      <section className="admin-content payment-admin-content">
        <header className="admin-topbar">
          <div>
            <span className="eyebrow dark">FINANZAS</span>
            <h1>Conciliación de pagos</h1>
            <p>Registra manualmente efectivo, transferencia o tarjeta y controla saldos.</p>
          </div>
        </header>

        {notice ? (
          <div className="admin-notice">
            {notice}
            <button onClick={() => setNotice("")} type="button">×</button>
          </div>
        ) : null}

        <section className="payment-metrics">
          <article>
            <small>Cobrado en esta vista</small>
            <strong>{money.format(metrics.paid)}</strong>
          </article>
          <article>
            <small>Saldo pendiente</small>
            <strong>{money.format(metrics.pending)}</strong>
          </article>
          <article>
            <small>Pedidos con abono parcial</small>
            <strong>{metrics.partial}</strong>
          </article>
        </section>

        <section className="payment-toolbar">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setAppliedQuery(query.trim());
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pedido, cliente, correo o WhatsApp"
            />
            <button type="submit">Buscar</button>
          </form>
          <select
            value={paymentStatus}
            onChange={(event) => {
              setPaymentStatus(event.target.value as PaymentStatus | "");
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="PENDING">Pendientes / parciales</option>
            <option value="PAID">Pagados</option>
          </select>
        </section>

        <section className="payment-layout">
          <article className="panel payment-orders-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow dark">PEDIDOS</span>
                <h2>{pagination.total.toLocaleString("es-MX")} registros</h2>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Total</th>
                    <th>Pagado</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7}>Cargando conciliación…</td></tr>
                  ) : orders.length ? (
                    orders.map((order) => (
                      <tr
                        key={order.id}
                        className={selected?.id === order.id ? "selected-payment-row" : ""}
                      >
                        <td>
                          <strong>{order.orderNumber}</strong>
                          <small>{dateTime.format(new Date(order.createdAt))}</small>
                        </td>
                        <td>
                          {order.customerName}
                          <small>{order.customerPhone || "Sin teléfono"}</small>
                        </td>
                        <td>{money.format(Number(order.total))}</td>
                        <td>{money.format(order.paidAmount)}</td>
                        <td>{money.format(order.balance)}</td>
                        <td>
                          <span className={`reconciliation-badge reconciliation-${order.reconciliationStatus.toLowerCase()}`}>
                            {reconciliationLabels[order.reconciliationStatus]}
                          </span>
                        </td>
                        <td>
                          <button
                            className="payment-open-button"
                            onClick={() => chooseOrder(order)}
                            type="button"
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={7}>No se encontraron pedidos.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="orders-pagination">
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                type="button"
              >
                Anterior
              </button>
              <span>Página {pagination.page} de {pagination.totalPages}</span>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                Siguiente
              </button>
            </div>
          </article>

          <aside className="panel payment-detail-panel">
            {!selected ? (
              <div className="payment-empty-detail">
                <strong>Selecciona un pedido</strong>
                <p>Aquí podrás registrar abonos y revisar el historial de conciliación.</p>
              </div>
            ) : (
              <>
                <header className="payment-detail-heading">
                  <div>
                    <span className="eyebrow dark">CONCILIACIÓN</span>
                    <h2>{selected.orderNumber}</h2>
                    <p>{selected.customerName} · {selected.customerPhone || "Sin teléfono"}</p>
                  </div>
                  <span className={`reconciliation-badge reconciliation-${selected.reconciliationStatus.toLowerCase()}`}>
                    {reconciliationLabels[selected.reconciliationStatus]}
                  </span>
                </header>

                <div className="payment-balance-grid">
                  <div><small>Total</small><strong>{money.format(Number(selected.total))}</strong></div>
                  <div><small>Pagado</small><strong>{money.format(selected.paidAmount)}</strong></div>
                  <div><small>Saldo</small><strong>{money.format(selected.balance)}</strong></div>
                </div>

                {selected.balance > 0 ? (
                  <form className="payment-entry-form" onSubmit={registerPayment}>
                    <h3>Registrar pago / abono</h3>
                    <div className="payment-form-grid">
                      <label>
                        Importe
                        <input
                          min="0.01"
                          max={selected.balance}
                          step="0.01"
                          type="number"
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Método real
                        <select
                          value={method}
                          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                        >
                          <option value="CASH">Efectivo</option>
                          <option value="TRANSFER">Transferencia</option>
                          <option value="CARD">Tarjeta</option>
                        </select>
                      </label>
                      <label>
                        Fecha/hora (opcional)
                        <input
                          type="datetime-local"
                          value={receivedAt}
                          onChange={(event) => setReceivedAt(event.target.value)}
                        />
                      </label>
                      <label>
                        Referencia (opcional)
                        <input
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                          placeholder="Folio, últimos 4 dígitos, etc."
                        />
                      </label>
                    </div>
                    <label>
                      Nota (opcional)
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Ej. Pago recibido en mostrador"
                      />
                    </label>
                    <button disabled={busy} type="submit">
                      {busy ? "Registrando…" : "Registrar pago"}
                    </button>
                  </form>
                ) : (
                  <div className="payment-paid-message">
                    <strong>Pedido totalmente conciliado</strong>
                    <span>No tiene saldo pendiente.</span>
                  </div>
                )}

                <section className="payment-history-section">
                  <div className="order-section-title">
                    <h3>Historial de pagos</h3>
                    <span>{selected.payments.length} registro(s)</span>
                  </div>
                  <div className="payment-history-list">
                    {selected.payments.length ? (
                      selected.payments.map((payment) => (
                        <article
                          key={payment.id}
                          className={payment.voidedAt ? "payment-record voided" : "payment-record"}
                        >
                          <div className="payment-record-main">
                            <strong>{money.format(Number(payment.amount))}</strong>
                            <span>{methodLabels[payment.method]}</span>
                            {payment.reference ? <small>Ref. {payment.reference}</small> : null}
                          </div>
                          <div className="payment-record-meta">
                            <span>{dateTime.format(new Date(payment.receivedAt))}</span>
                            <small>Registró: {payment.createdBy.name}</small>
                            {payment.note ? <p>{payment.note}</p> : null}
                            {payment.voidedAt ? (
                              <p className="payment-void-note">
                                Anulado: {payment.voidReason || "Sin motivo"}
                                {payment.voidedBy ? ` · ${payment.voidedBy.name}` : ""}
                              </p>
                            ) : (
                              <button
                                disabled={busy}
                                onClick={() => void voidPayment(payment)}
                                type="button"
                              >
                                Anular registro
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="panel-empty">Aún no hay pagos registrados.</p>
                    )}
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
