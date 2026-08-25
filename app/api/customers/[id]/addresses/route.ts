import { z } from "zod";
import { created, handleApiError, parseId } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  label: z.string().trim().max(80).optional().nullable(),
  recipient: z.string().trim().min(3).max(180),
  phone: z.string().trim().max(30).optional().nullable(),
  street: z.string().trim().min(3).max(255),
  exteriorNo: z.string().trim().max(40).optional().nullable(),
  interiorNo: z.string().trim().max(40).optional().nullable(),
  neighborhood: z.string().trim().max(160).optional().nullable(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  postalCode: z.string().trim().min(4).max(12),
  references: z.string().trim().max(3000).optional().nullable(),
  default: z.boolean().optional(),
});

export async function POST(request: Request, context: Context) {
  try {
    await requireUser(["ADMIN", "STAFF"]);
    const customerId = parseId((await context.params).id);
    const data = schema.parse(await request.json());
    const address = await prisma.$transaction(async (tx) => {
      if (data.default) {
        await tx.address.updateMany({ where: { customerId }, data: { default: false } });
      }
      return tx.address.create({ data: { ...data, customerId } });
    });
    return created(address);
  } catch (error) {
    return handleApiError(error);
  }
}
