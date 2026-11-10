export const statusValues = ["PENDING", "CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED", "CANCELED"] as const;
export type OrderStage = typeof statusValues[number];
const nextStages: Record<OrderStage, readonly OrderStage[]> = {
  PENDING: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["PREPARING", "CANCELED"],
  PREPARING: ["SHIPPED", "CANCELED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELED: [],
};
export function allowedNextStages(current: OrderStage) {
  return [current, ...nextStages[current]];
}
export function canChangeStage(current: OrderStage, next: OrderStage) {
  return allowedNextStages(current).includes(next);
}
