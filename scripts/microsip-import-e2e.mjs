// Run only against an EMPTY disposable local database and a local Next server.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { loadTs } from "../tests/load-ts.mjs";
const dbUrl = new URL(process.env.DATABASE_URL ?? "invalid:");
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3021";
const origin = new URL(base);
if (!["127.0.0.1","localhost"].includes(dbUrl.hostname) || !dbUrl.pathname.endsWith("_test") ||
    !["127.0.0.1","localhost"].includes(origin.hostname)) throw new Error("Esta prueba requiere una app y BD locales terminadas en _test.");
if (!process.env.MICROSIP_TEST_FILE) throw new Error("Configura MICROSIP_TEST_FILE con el Excel real.");
const bytes=await fs.readFile(process.env.MICROSIP_TEST_FILE);
const file=new File([bytes],"ARTICULOS EN EXISTENCIA Y PRECIOS.xlsx");
const { parseMicrosipPriceList }=loadTs("lib/microsip-excel.ts");
const parsed=await parseMicrosipPriceList(file);
const checks=[];
let cookie="";
async function api(path, method="GET", body, expected=200, auth=true) {
 const response=await fetch(base+path,{method,headers:{...(body?{"Content-Type":"application/json"}:{}),...(auth?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(600000)});
 const payload=await response.json();
 assert.equal(response.status,expected,path+": "+JSON.stringify(payload));
 if(path==="/api/auth/bootstrap")cookie=response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
 return payload.data;
}
function sql(query) {
 return execFileSync(process.env.MYSQL_TEST_BIN ?? "C:/xampp/mysql/bin/mysql.exe",["--no-defaults","--host="+dbUrl.hostname,"--port="+(dbUrl.port||3306),"--user="+decodeURIComponent(dbUrl.username),"--database="+dbUrl.pathname.slice(1),"--batch","--raw","--skip-column-names","--default-character-set=utf8mb4"],{input:query,encoding:"utf8",env:{...process.env,MYSQL_PWD:decodeURIComponent(dbUrl.password)}}).trim();
}
function rows(query){return sql(query).split("\n").filter(Boolean).map(value=>JSON.parse(value));}
assert.equal(Number(sql("SELECT COUNT(*) FROM ProductVariant")),0,"Usa una BD de prueba VACÍA");
async function importFile({preview, included=[], expected=201, exportedAt=new Date().toISOString()}={}) {
 const data=new FormData(); data.set("file",file); data.set("mode",preview?"import":"preview");
 if(preview){ data.set("reviewToken",preview.token);data.set("includedOrderIds",JSON.stringify(included));data.set("confirmSnapshot","true");data.set("exportedAt",exportedAt); }
 const response=await fetch(base+"/api/imports/products",{method:"POST",headers:{Cookie:cookie},body:data,signal:AbortSignal.timeout(600000)});
 const payload=await response.json(); assert.equal(response.status,preview?expected:200,JSON.stringify(payload));
 return payload.data;
}
const readStock=id=>Number(sql("SELECT stock FROM ProductVariant WHERE id="+id));
const readAll=()=>rows("SELECT JSON_OBJECT('id',id,'productId',productId,'sourceKey',sourceKey,'price',CAST(price AS CHAR),'stock',stock,'active',active) FROM ProductVariant ORDER BY id");
await api("/api/auth/bootstrap","POST",{name:"Auditoría local",email:"microsip-test@example.invalid",password:"Local-only-Microsip-2026!"},201,false);
const category=await api("/api/categories","POST",{name:"Prueba local"},201);
const source=parsed.products.find(row=>row.stock>=5);
assert.ok(source,"El archivo debe incluir un producto con al menos 5 piezas para estas pruebas.");
const seed=await api("/api/products","POST",{name:"Nombre editorial conservado",description:"Descripción propia",seoTitle:"SEO propio",categoryId:category.id,status:"ACTIVE",variants:[{sku:source.sku??"TESTSEED",barcode:source.sku,cost:43.21,price:1,stock:source.stock+10}],images:[{url:"https://example.invalid/test.jpg"}]},201);
const variantId=seed.variants[0].id;
if(!source.sku)throw new Error("El producto de prueba necesita SKU");
const manual=await api("/api/products","POST",{name:"Producto manual fuera de Excel",categoryId:category.id,status:"ACTIVE",variants:[{sku:"MANUAL-TEST",cost:0,price:20,stock:7}]},201);
const first=await importFile({preview:await importFile()});
assert.equal(first.createdRows,parsed.products.length-1); assert.equal(first.updatedRows,1);
const imported = readAll();
for(const row of parsed.products){const actual=imported.find(v=>v.sourceKey===row.key);assert.ok(actual);assert.equal(Number(actual.price),row.price);assert.equal(actual.stock,row.stock);}
assert.equal(readStock(manual.variants[0].id),7);
const editorial=await api("/api/products/"+seed.id);
assert.equal(editorial.description,"Descripción propia");assert.equal(editorial.seoTitle,"SEO propio");assert.equal(editorial.name,"Nombre editorial conservado");assert.equal(editorial.images.length,1);
checks.push({check:"Excel real: crea nuevos, actualiza precio y stock, conserva datos e imágenes",products:parsed.products.length,newProducts:first.createdRows,updated:first.updatedRows});
async function checkout(quantity=1){
 return api("/api/orders","POST",{checkoutKey:randomUUID(),customerName:"Cliente ficticio local",customerPhone:"8710000000",customerEmail:null,notes:"PRUEBA LOCAL",shippingAddress:{street:"Calle de prueba",exteriorNo:"1",neighborhood:"Centro",city:"Torreón",state:"Coahuila",postalCode:"27000"},items:[{variantId,quantity}]},201,false);
}
const a=await checkout(1), b=await checkout(2);
assert.equal(readStock(variantId),source.stock-3);
let review=await importFile();
const withReservations=await importFile({preview:review});
assert.equal(withReservations.reservedUnits,3);assert.equal(readStock(variantId),source.stock-3);
const count=Number(sql("SELECT COUNT(*) FROM ProductVariant"));
await importFile({preview:await importFile()});assert.equal(readStock(variantId),source.stock-3);assert.equal(Number(sql("SELECT COUNT(*) FROM ProductVariant")),count);
checks.push({check:"Reimportación conserva reservas sin duplicados",reservedUnits:3});
await importFile({preview:await importFile(),included:[b.id]});
assert.equal(readStock(variantId),source.stock-1);
assert.ok(sql("SELECT microsipIncludedAt FROM `Order` WHERE id="+b.id)!=="NULL");
await importFile({preview:await importFile(),included:[b.id]});assert.equal(readStock(variantId),source.stock-1);
checks.push({check:"Pedido reflejado en Excel no se descuenta dos veces",includedOrder:b.id,pendingUnits:1});
await api("/api/orders/"+b.id+"/items","PUT",{items:[{variantId,quantity:1}]},409);
await api("/api/orders/"+a.id,"PATCH",{status:"CANCELED",note:"Prueba cancelación no conciliada"});assert.equal(readStock(variantId),source.stock);
await api("/api/orders/"+a.id,"PATCH",{status:"CANCELED",note:"Reintento"});assert.equal(readStock(variantId),source.stock);
await api("/api/orders/"+b.id,"PATCH",{status:"CANCELED",note:"Devolución pendiente en Microsip"});assert.equal(readStock(variantId),source.stock);
checks.push({check:"Cancelación pendiente repone una vez; conciliada espera devolución del Excel"});
review=await importFile();
const c=await checkout(1);
await importFile({preview:review,expected:409});assert.equal(readStock(variantId),source.stock-1);
checks.push({check:"Un pedido posterior a la revisión invalida el intento, sin alterar stock"});
// Test a reserved product absent from the complete catalog: full rollback.
const absent=await api("/api/products","POST",{name:"Ausente importado",categoryId:category.id,status:"ACTIVE",variants:[{sku:"ABSENT-TEST",cost:0,price:10,stock:5}]},201);
const absentId=absent.variants[0].id;
sql("UPDATE ProductVariant SET sourceKey='SKU:ABSENTTEST' WHERE id="+absentId);
const oldVariantId=variantId;
const missingOrder=await api("/api/orders","POST",{checkoutKey:randomUUID(),customerName:"Cliente ausente local",customerPhone:"8710000000",shippingAddress:{street:"Calle prueba",exteriorNo:"1",neighborhood:"Centro",city:"Torreón",state:"Coahuila",postalCode:"27000"},items:[{variantId:absentId,quantity:1}]},201,false);
const before=readAll();
await importFile({preview:await importFile(),expected:409});
assert.deepEqual(readAll(),before);
await api("/api/orders/"+missingOrder.id,"PATCH",{status:"CANCELED",note:"Prueba cancelación de ausente"});
await importFile({preview:await importFile()});assert.equal(readStock(absentId),0);
assert.equal(Number(sql("SELECT active FROM ProductVariant WHERE id="+absentId)),0);
assert.equal(readStock(oldVariantId),source.stock-1);
checks.push({check:"Ausente con apartado bloquea y revierte toda la importación; sin apartado se desactiva"});
// Import and checkout race: either checkout commits and invalidates review,
// or import commits first and checkout discounts from that stock.
review=await importFile();
const race=await Promise.allSettled([importFile({preview:review}),checkout(1)]);
assert.equal(race[1].status,"fulfilled");
if(race[0].status==="rejected")assert.match(String(race[0].reason),/409/);
assert.equal(readStock(variantId),source.stock-2);
checks.push({check:"Importación y checkout concurrentes conservan ambos apartados"});
assert.equal(Number(sql("SELECT COUNT(*) FROM ProductVariant WHERE sourceKey IS NOT NULL AND sourceKey<>'SKU:ABSENTTEST'")),parsed.products.length);
const report={scope:"SOLO BD local "+dbUrl.pathname.slice(1),fileName:file.name,validProducts:parsed.products.length,skippedRows:parsed.skippedRows.length,checks,completedAt:new Date().toISOString()};
if(process.env.TEST_REPORT_PATH)await fs.writeFile(process.env.TEST_REPORT_PATH,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
