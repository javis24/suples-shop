import { handleApiError, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    // El hosting usa un pool pequeño. Las lecturas secuenciales son más
    // estables que abrir una transacción mientras Next atiende otras rutas.
    const productCount = await prisma.product.count({
      where: { status: "ACTIVE" },
    });
    const categoryCount = await prisma.category.count({
      where: { active: true },
    });
    const customerCount = await prisma.customer.count({
      where: { active: true },
    });
    const pendingOrders = await prisma.order.count({
      where: { status: { in: ["PENDING", "CONFIRMED", "PREPARING"] } },
    });
    const paidTotals = await prisma.order.aggregate({
      where: { paymentStatus: "PAID", status: { not: "CANCELED" } },
      _sum: { total: true },
      _count: { id: true },
    });
    const variants = await prisma.productVariant.findMany({
      where: { active: true },
      select: {
        id: true,
        sku: true,
        stock: true,
        lowStockAt: true,
        cost: true,
        price: true,
        product: { select: { id: true, name: true } },
      },
      orderBy: { stock: "asc" },
    });
    const recentOrders = await prisma.order.findMany({
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    const recentImports = await prisma.importBatch.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
    });

    const totalUnits = variants.reduce((sum, variant) => sum + variant.stock, 0);
    const inventoryCost = variants.reduce(
      (sum, variant) => sum + variant.stock * Number(variant.cost),
      0,
    );
    const lowStock = variants
      .filter((variant) => variant.stock <= variant.lowStockAt)
      .slice(0, 10);

    return ok({
      user,
      metrics: {
        products: productCount,
        categories: categoryCount,
        customers: customerCount,
        pendingOrders,
        paidOrders: paidTotals._count.id,
        revenue: Number(paidTotals._sum.total ?? 0),
        totalUnits,
        inventoryCost: Math.round(inventoryCost * 100) / 100,
        lowStockCount: variants.filter((variant) => variant.stock <= variant.lowStockAt).length,
      },
      lowStock,
      recentOrders,
      recentImports,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
