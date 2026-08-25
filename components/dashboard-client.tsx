"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type User = { id: number; name: string; email: string; role: "ADMIN" | "STAFF" };
type DashboardData = {
  user: User;
  metrics: {
    products: number;
    categories: number;
    customers: number;
    pendingOrders: number;
    paidOrders: number;
    revenue: number;
    totalUnits: number;
    inventoryCost: number;
    lowStockCount: number;
  };
  lowStock: { id: number; sku: string; stock: number; lowStockAt: number; product: { name: string } }[];
  recentOrders: { id: number; number: string; customerName: string; total: string | number; status: string; createdAt: string }[];
  recentImports: { id: number; fileName: string; status: string; totalRows: number; createdRows: number; updatedRows: number; errorRows: number; startedAt: string }[];
};

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const integer = new Intl.NumberFormat("es-MX");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message || "La operación no pudo completarse.");
    Object.assign(error, { code: payload.error?.code, details: payload.error?.details });
    throw error;
  }
  return payload.data;
}

export function DashboardClient() {
  const [state, setState] = useState<"loading" | "setup" | "login" | "ready">("loading");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDashboard = useCallback(async () => {
    try {
      await api<User>("/api/auth/me");
      const data = await api<DashboardData>("/api/dashboard");
      setDashboard(data);
      setState("ready");
    } catch (error) {
      const typed = error as Error & { code?: string };
      setState(typed.code === "SETUP_REQUIRED" ? "setup" : "login");
    }
  }, []);

  useEffect(() => {
    // La sesión y las métricas se consultan una sola vez al montar el panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  async function submitAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      await api(state === "setup" ? "/api/auth/bootstrap" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await loadDashboard();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function importExcel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!file) return setNotice("Selecciona el archivo EXISTENCIA.xlsx.");
    setBusy(true);
    setNotice("Procesando el archivo; puede tardar unos segundos…");
    const data = new FormData(form);
    try {
      const result = await api<{ totalRows: number; createdRows: number; updatedRows: number; errorRows: number }>("/api/imports/products", {
        method: "POST",
        body: data,
      });
      setNotice(`Importación terminada: ${result.createdRows} creados, ${result.updatedRows} actualizados y ${result.errorRows} errores.`);
      form.reset();
      await loadDashboard();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo importar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <main className="access-screen"><div className="access-card"><div className="dashboard-loader" /><p>Preparando el panel…</p></div></main>;
  }

  if (state === "setup" || state === "login") {
    return (
      <main className="access-screen">
        <Link className="back-store" href="/">← Volver a la tienda</Link>
        <section className="access-card">
          <div className="admin-logo"><span>S</span></div>
          <span className="eyebrow dark">SUPLES SHOP ADMIN</span>
          <h1>{state === "setup" ? "Crea al administrador" : "Bienvenido de nuevo"}</h1>
          <p>{state === "setup" ? "Este formulario aparece una sola vez para proteger el panel." : "Ingresa tus datos para administrar la tienda."}</p>
          <form className="access-form" onSubmit={submitAccess}>
            {state === "setup" ? <label>Nombre<input name="name" placeholder="Administrador" required minLength={2} /></label> : null}
            <label>Correo<input name="email" type="email" placeholder="admin@suples-shop.mx" required /></label>
            <label>Contraseña<input name="password" type="password" placeholder="Mínimo 8 caracteres" required minLength={8} /></label>
            {notice ? <div className="form-notice error">{notice}</div> : null}
            <button disabled={busy} type="submit">{busy ? "Procesando…" : state === "setup" ? "Crear cuenta y entrar" : "Entrar al panel"}</button>
          </form>
        </section>
      </main>
    );
  }

  if (!dashboard) return null;

  const metricCards = [
    ["Ventas registradas", money.format(dashboard.metrics.revenue), `${dashboard.metrics.paidOrders} órdenes pagadas`],
    ["Productos activos", integer.format(dashboard.metrics.products), `${integer.format(dashboard.metrics.totalUnits)} piezas disponibles`],
    ["Inventario a costo", money.format(dashboard.metrics.inventoryCost), `${dashboard.metrics.categories} categorías`],
    ["Stock bajo", integer.format(dashboard.metrics.lowStockCount), `${dashboard.metrics.pendingOrders} pedidos por atender`],
  ];

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <Link className="brand-lockup light" href="/"><span className="brand-mark">S</span><span><strong>SUPLES</strong><small>ADMIN</small></span></Link>
        <nav>
          <a className="active" href="#resumen"><span>◫</span> Resumen</a>
          <a href="#importar"><span>⇧</span> Importar Excel</a>
          <a href="#inventario"><span>▤</span> Inventario</a>
          <a href="#pedidos"><span>◉</span> Pedidos</a>
          <Link href="/api/products?all=true"><span>◇</span> API productos</Link>
        </nav>
        <div className="sidebar-profile"><span>{dashboard.user.name[0]?.toUpperCase()}</span><div><strong>{dashboard.user.name}</strong><small>{dashboard.user.role}</small></div></div>
      </aside>

      <section className="admin-content">
        <header className="admin-topbar">
          <div><span className="eyebrow dark">PANEL DE CONTROL</span><h1>Hola, {dashboard.user.name.split(" ")[0]}</h1><p>Así está funcionando tu tienda hoy.</p></div>
          <div className="topbar-actions"><a href="/" target="_blank">Ver tienda ↗</a><button onClick={async () => { await api("/api/auth/logout", { method: "POST" }); location.reload(); }} type="button">Salir</button></div>
        </header>

        {notice ? <div className="admin-notice">{notice}<button onClick={() => setNotice("")} aria-label="Cerrar" type="button">×</button></div> : null}

        <section className="metrics" id="resumen">
          {metricCards.map(([label, value, detail], index) => <article key={label}><span className={`metric-icon metric-${index}`}>{["↗", "◆", "$", "!"][index]}</span><p>{label}</p><strong>{value}</strong><small>{detail}</small></article>)}
        </section>

        <section className="admin-grid">
          <article className="panel import-panel" id="importar">
            <div className="panel-heading"><div><span className="eyebrow dark">ACTUALIZACIÓN DIARIA</span><h2>Importar EXISTENCIA.xlsx</h2></div><span className="status-dot">LISTO</span></div>
            <p>Lee el nombre del artículo, categoría, unidad, existencia y último costo del reporte de Microsip.</p>
            <form className="import-form" onSubmit={importExcel}>
              <label className="file-drop"><input accept=".xlsx" name="file" ref={fileRef} required type="file" /><span className="upload-icon">⇧</span><strong>Selecciona o arrastra el Excel</strong><small>Archivo .xlsx · Máximo 5 MB</small></label>
              <div className="import-options">
                <label><span>Margen para productos nuevos</span><div className="percent-input"><input defaultValue="35" max="500" min="0" name="markupPercent" step="0.01" type="number" /><span>%</span></div></label>
                <label className="switch-row"><span><strong>Actualizar precios existentes</strong><small>Calcula precio de venta usando costo + margen.</small></span><input name="updatePrices" type="checkbox" value="true" /></label>
              </div>
              <button className="primary-admin-action" disabled={busy} type="submit">{busy ? "Importando…" : "Importar y actualizar inventario"}</button>
            </form>
            <div className="import-warning"><strong>Importante</strong><span>El Excel contiene último costo, no precio de venta. Por seguridad, los precios existentes no cambian a menos que actives la opción.</span></div>
          </article>

          <article className="panel" id="inventario">
            <div className="panel-heading"><div><span className="eyebrow dark">ATENCIÓN</span><h2>Existencias bajas</h2></div><span className="panel-count">{dashboard.metrics.lowStockCount}</span></div>
            <div className="stock-list">
              {dashboard.lowStock.length ? dashboard.lowStock.map((item) => <div key={item.id}><span className="stock-avatar">{item.product.name[0]}</span><span className="stock-name"><strong>{item.product.name}</strong><small>{item.sku}</small></span><span className={item.stock === 0 ? "stock-number zero" : "stock-number"}><strong>{item.stock}</strong><small>de {item.lowStockAt}</small></span></div>) : <p className="panel-empty">No hay productos con stock bajo.</p>}
            </div>
          </article>
        </section>

        <section className="admin-grid lower-grid">
          <article className="panel" id="pedidos">
            <div className="panel-heading"><div><span className="eyebrow dark">VENTAS</span><h2>Pedidos recientes</h2></div></div>
            <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Estado</th><th>Total</th></tr></thead><tbody>{dashboard.recentOrders.length ? dashboard.recentOrders.map((order) => <tr key={order.id}><td>{order.number}</td><td>{order.customerName}</td><td><span className="table-status">{order.status}</span></td><td>{money.format(Number(order.total))}</td></tr>) : <tr><td colSpan={4}>Aún no hay pedidos.</td></tr>}</tbody></table></div>
          </article>
          <article className="panel">
            <div className="panel-heading"><div><span className="eyebrow dark">HISTORIAL</span><h2>Últimas importaciones</h2></div></div>
            <div className="import-history">{dashboard.recentImports.length ? dashboard.recentImports.map((item) => <div key={item.id}><span className="history-icon">XLS</span><span><strong>{item.fileName}</strong><small>{new Date(item.startedAt).toLocaleString("es-MX")} · {item.updatedRows} actualizados</small></span><span className={`history-status ${item.status.toLowerCase()}`}>{item.status}</span></div>) : <p className="panel-empty">Aún no has realizado importaciones.</p>}</div>
          </article>
        </section>
      </section>
    </main>
  );
}
