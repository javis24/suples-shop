import Link from "next/link";

export type AdminSidebarUser = {
  name: string;
  role: "ADMIN" | "STAFF";
};

type Props = {
  active: "dashboard" | "products";
  user: AdminSidebarUser;
};

export function AdminSidebar({ active, user }: Props) {
  return (
    <aside className="sidebar">
      <Link className="brand-lockup light" href="/">
        <span className="brand-mark">S</span>
        <span>
          <strong>SUPLES</strong>
          <small>ADMIN</small>
        </span>
      </Link>

      <nav aria-label="Administración">
        <Link className={active === "dashboard" ? "active" : ""} href="/dashboard">
          <span>◫</span> Resumen
        </Link>
        <Link className={active === "products" ? "active" : ""} href="/dashboard/products">
          <span>◆</span> Productos
        </Link>
        <Link href="/dashboard#importar">
          <span>⇧</span> Importar Excel
        </Link>
        <Link href="/dashboard#inventario">
          <span>▤</span> Inventario
        </Link>
        <Link href="/dashboard#pedidos">
          <span>◉</span> Pedidos
        </Link>
      </nav>

      <div className="sidebar-profile">
        <span>{user.name[0]?.toUpperCase()}</span>
        <div>
          <strong>{user.name}</strong>
          <small>{user.role}</small>
        </div>
      </div>
    </aside>
  );
}
