"use client";
import { type FormEvent, useState } from "react";
import styles from "./catalog-import.module.css";

type Order = {
  id: number; orderNumber: string; customerName: string; status: string;
  microsipIncludedAt: string | null;
  items: { variantId: number | null; quantity: number; productName: string }[];
};
type Preview = {
  token: string; products: number; skippedRows: number; duplicateRows: number;
  lastExportedAt: string | null; orders: Order[];
};
const statuses: Record<string, string> = { PENDING: "Pendiente", CONFIRMED: "Confirmado", PREPARING: "Preparando", SHIPPED: "Enviado", DELIVERED: "Entregado" };

export function CatalogImport({ onImported }: { onImported: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [included, setIncluded] = useState<number[]>([]);
  const [exportedAt, setExportedAt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setMessage("");
    const data = new FormData();
    data.set("file", file);
    data.set("mode", preview ? "import" : "preview");
    if (preview) {
      data.set("reviewToken", preview.token);
      data.set("includedOrderIds", JSON.stringify(included));
      data.set("exportedAt", new Date(exportedAt).toISOString());
      data.set("confirmSnapshot", String(confirmed));
    }
    try {
      const response = await fetch("/api/imports/products", { method: "POST", body: data });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "No fue posible procesar el archivo.");
      if (!preview) {
        const next = payload.data as Preview;
        setPreview(next);
        setIncluded(next.orders.filter(order => order.microsipIncludedAt).map(order => order.id));
        setConfirmed(false);
      } else {
        const result = payload.data;
        setMessage("Importación terminada: " + result.createdRows + " nuevos, " + result.updatedRows + " actualizados y " + result.skippedRows + " omitidos. Se conservan " + result.reservedUnits + " unidades apartadas sin conciliar.");
        setPreview(null); setConfirmed(false);
        await onImported();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible importar.");
    } finally { setBusy(false); }
  }
  const pendingUnits = preview?.orders.filter(order => !included.includes(order.id)).reduce((sum, order) => sum + order.items.reduce((total, item) => total + item.quantity, 0), 0) ?? 0;
  return <form className={styles.form} onSubmit={submit}>
    <label className={styles.field}>Archivo de Microsip (.xlsx)
      <input name="file" type="file" accept=".xlsx" required disabled={busy} onChange={event => {
        setFile(event.target.files?.[0] ?? null); setPreview(null); setConfirmed(false); setMessage("");
      }} />
    </label>
    {preview && <section className={styles.review} aria-label="Revisión antes de importar">
      <h3>Revisa los pedidos incluidos en el Excel</h3>
      <p>{preview.products} productos válidos · {preview.skippedRows} filas omitidas · {preview.duplicateRows} repetidas.</p>
      <p>Marca únicamente los pedidos cuyas unidades ya fueron descontadas en este archivo de Microsip. No basta con confirmar o cobrar el pedido en la web.</p>
      <label className={styles.field}>Fecha y hora en que exportaste el archivo
        <input type="datetime-local" required value={exportedAt} onChange={event => setExportedAt(event.target.value)} disabled={busy} />
      </label>
      {preview.lastExportedAt && <small>Última exportación importada: {new Date(preview.lastExportedAt).toLocaleString("es-MX")}</small>}
      <div className={styles.orders}>
        {preview.orders.length ? preview.orders.map(order => <label className={styles.order} key={order.id}>
          <input type="checkbox" checked={included.includes(order.id)} disabled={busy || Boolean(order.microsipIncludedAt)} onChange={event => {
            setIncluded(current => event.target.checked ? [...current, order.id] : current.filter(id => id !== order.id)); setConfirmed(false);
          }} />
          <span><strong>{order.orderNumber} · {order.customerName}</strong>
            <small>{statuses[order.status] ?? order.status}{order.microsipIncludedAt ? " · Conciliado en una importación anterior" : " · Marca si ya está descontado en este Excel"}</small>
            {order.items.map((item, index) => <small key={index}>{item.quantity} × {item.productName}</small>)}
          </span>
        </label>) : <p>No hay pedidos por conciliar.</p>}
      </div>
      <p><strong>{pendingUnits} unidades seguirán apartadas</strong> y se descontarán de la existencia del Excel.</p>
      <label className={styles.order}>
        <input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
        <span>Confirmo que es el catálogo completo y actualizado, que revisé los pedidos marcados y que las cancelaciones/devoluciones ya registradas en Microsip están reflejadas en este archivo.</span>
      </label>
      <button className={styles.secondary} disabled={busy} type="button" onClick={() => { setPreview(null); setConfirmed(false); }}>Volver a revisar el archivo y los pedidos</button>
    </section>}
    <p className={styles.notice} role="status" aria-live="polite">{busy ? "Procesando… La importación puede tardar varios minutos." : message}</p>
    <button className="primary-admin-action import-new-action" disabled={busy || !file || Boolean(preview && !confirmed)} type="submit">
      {busy ? "Procesando…" : preview ? "Importar precios y stock con los apartados" : "Revisar Excel y pedidos"}
    </button>
  </form>;
}
