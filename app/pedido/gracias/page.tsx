import Link from "next/link";

type Props = {
  searchParams: Promise<{
    status?: string;
    order?: string;
  }>;
};

export default async function OrderResultPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = params.status ?? "pending";
  const order = params.order ?? "";
  const approved = status === "success";
  const failed = status === "failure";

  return (
    <main className="checkout-result-page">
      <section className="checkout-result-card">
        <span className={approved ? "success" : failed ? "failure" : "pending"}>
          {approved ? "✓" : failed ? "!" : "…"}
        </span>
        <small>SUPLES SHOP</small>
        <h1>
          {approved
            ? "Recibimos tu pago"
            : failed
              ? "El pago no se completó"
              : "Tu pago está pendiente"}
        </h1>
        {order ? <strong>Pedido {order}</strong> : null}
        <p>
          {approved
            ? "Mercado Pago nos notificará la aprobación. Prepararemos tu pedido cuando quede confirmado."
            : failed
              ? "Tu pedido sigue guardado. Puedes regresar a la tienda o comunicarte por WhatsApp para recibir ayuda."
              : "Algunos medios de pago tardan en acreditarse. Actualizaremos el pedido cuando Mercado Pago confirme el resultado."}
        </p>
        <Link href="/">Volver a la tienda</Link>
      </section>
    </main>
  );
}
