import test from "node:test";
import assert from "node:assert/strict";
import { loadTs } from "./load-ts.mjs";
const { availableFromSnapshot, reservationPlan, snapshotHash, reviewToken, verifyReview, exportDate, parseIncludedIds } = loadTs("lib/import-reconciliation.ts");
const at = new Date("2026-11-14T10:00:00Z");
const order = (id, quantity=2) => ({id, orderNumber:"SS-"+id, customerName:"Prueba", status:"PENDING", createdAt:at, updatedAt:at, microsipIncludedAt:null, items:[{variantId:7, quantity, productName:"Prueba"}]});
test("conserva apartados aunque un pedido esté confirmado, pagado o entregado sin conciliar", () => {
  const orders = [order(1), {...order(2,3),status:"DELIVERED"}];
  const pending = reservationPlan(orders, new Set(), at);
  assert.equal(pending.get(7),5);
  assert.equal(availableFromSnapshot(10,pending.get(7),"Prueba"),5);
});
test("descuenta solo los pedidos no reflejados en Microsip y no vuelve a descontar los incluidos", () => {
  const pending = reservationPlan([order(1),order(2,3)],new Set([1]),at);
  assert.equal(availableFromSnapshot(8,pending.get(7),"Prueba"),5);
  assert.equal(availableFromSnapshot(8,pending.get(7),"Prueba"),5);
});
test("rechaza faltantes y productos ausentes con apartados sin perder la reserva", () => {
  assert.throws(()=>availableFromSnapshot(1,2,"Prueba"),/apartadas/);
  assert.throws(()=>availableFromSnapshot(0,2,"Ausente"),/apartadas/);
  assert.equal(availableFromSnapshot(2,2,"Prueba"),0);
});
test("no permite retirar una conciliación ni marcar pedidos desconocidos o posteriores al archivo", () => {
  assert.throws(()=>reservationPlan([{...order(1),microsipIncludedAt:at}],new Set(),at),/ya fue conciliado/);
  assert.throws(()=>reservationPlan([order(1)],new Set([2]),at),/ya cambió/);
  assert.throws(()=>reservationPlan([order(1)],new Set([1]),new Date(at-1000)),/después de exportar/);
  assert.throws(()=>reservationPlan([{...order(1),items:[{variantId:null,quantity:1}]}],new Set(),at),/producto eliminado/);
});
test("la revisión está ligada al usuario, archivo, pedidos, última importación y vencimiento", () => {
  process.env.AUTH_SECRET="local-reconciliation-test";
  const hash=snapshotHash([order(1)],null);
  const token=reviewToken(1,"excel",hash,1000);
  verifyReview(token,1,"excel",hash,2000);
  for(const args of [[token,2,"excel",hash,2000],[token,1,"otro",hash,2000],[token,1,"excel",snapshotHash([order(1,3)],null),2000],[token,1,"excel",snapshotHash([order(1)],1),2000],[token,1,"excel",hash,2000000],["invalid",1,"excel",hash,2000]]) {
    assert.throws(()=>verifyReview(...args),/revisión/);
  }
});
test("rechaza exportaciones antiguas, futuras y listas de pedidos inválidas", () => {
  assert.throws(()=>exportDate("2026-11-13T10:00:00Z",at,at.getTime()),/anterior/);
  assert.throws(()=>exportDate("2026-11-15T10:00:00Z",null,at.getTime()),/futuro/);
  assert.throws(()=>exportDate("mal",null),/cuándo/);
  assert.deepEqual([...parseIncludedIds("[1,2,2]")],[1,2]);
  for(const value of [null,"{}",'["1"]',"[-1]","[1.1]"]) assert.throws(()=>parseIncludedIds(value));
});
