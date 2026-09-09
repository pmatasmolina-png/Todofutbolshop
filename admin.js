let lastSeenOrderId=localStorage.getItem("tf_last_seen_order_id")||"";
let notificationsEnabled=localStorage.getItem("tf_notifications_enabled")==="1";
let notificationTimer=null;
async function api(url,opt={}){const r=await fetch(url,opt);let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Error");return d}
let catalogs=[]; let discountCodes=[];
async function start(){const m=await api("/api/me");if(m.admin)showPanel()}
function showPanel(){loginBox.style.display="none";panel.style.display="block";load();if(notificationsEnabled && "Notification" in window && Notification.permission==="granted"){setNotificationMessage("🔔 Avisos activos. Comprobando nuevos pedidos automáticamente.");startOrderPolling()}}
loginForm.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:password.value})});showPanel()}catch(err){loginMsg.textContent=err.message}})
function renderCatalogEditor(){const box=document.getElementById("catalogAdminList");box.innerHTML=catalogs.map((c,i)=>`<div class="catalog-editor"><div class="catalog-editor-head"><strong>Catálogo ${i+1}</strong><button type="button" onclick="removeCatalog(${i})">Eliminar</button></div><label>Nombre<input data-field="name" data-i="${i}" value="${escapeHtml(c.name)}"></label><label>Precio (€)<input data-field="price" data-i="${i}" type="number" min="0.01" step="0.01" value="${c.price}"></label><label>Enlace<input data-field="url" data-i="${i}" type="url" value="${escapeHtml(c.url)}"></label></div>`).join("")}
function readEditor(){document.querySelectorAll("[data-field]").forEach(el=>{const i=Number(el.dataset.i);catalogs[i][el.dataset.field]=el.value});catalogs=catalogs.map(c=>({...c,price:Number(c.price)}))}
window.removeCatalog=i=>{readEditor();if(catalogs.length===1){catalogMsg.textContent="Debe quedar al menos un catálogo.";return}catalogs.splice(i,1);renderCatalogEditor()}
addCatalog.onclick=()=>{readEditor();catalogs.push({id:"cat-"+Date.now(),name:"Nuevo catálogo",price:20,url:"https://"});renderCatalogEditor()}
saveCatalogs.onclick=async()=>{readEditor();try{const saved=await api("/api/catalogs",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({catalogs})});catalogs=saved;renderCatalogEditor();catalogMsg.textContent="Catálogos guardados correctamente."}catch(err){catalogMsg.textContent=err.message}}

function renderDiscountCodes(){const box=document.getElementById("discountCodeList");box.innerHTML=discountCodes.length?discountCodes.map((c,i)=>`<div class="discount-editor"><div class="discount-editor-head"><strong>Código ${i+1}</strong><button type="button" onclick="removeDiscountCode(${i})">Eliminar</button></div><label>Código<input data-dc-field="code" data-i="${i}" value="${escapeHtml(c.code)}" placeholder="FUTBOL10"></label><label>Descuento (%)<input data-dc-field="percent" data-i="${i}" type="number" min="0.01" max="100" step="0.01" value="${c.percent}"></label><label class="switch-row"><input data-dc-field="active" data-i="${i}" type="checkbox" ${c.active!==false?"checked":""}> Código activo</label></div>`).join(""):'<div class="empty">No hay códigos creados.</div>'}
function readDiscountEditor(){document.querySelectorAll("[data-dc-field]").forEach(el=>{const i=Number(el.dataset.i);const f=el.dataset.dcField;if(f==="active") discountCodes[i][f]=el.checked; else discountCodes[i][f]=el.value});discountCodes=discountCodes.map(c=>({...c,code:String(c.code||"").toUpperCase().replace(/\s+/g,""),percent:Number(c.percent)}))}
window.removeDiscountCode=i=>{readDiscountEditor();discountCodes.splice(i,1);renderDiscountCodes()}
addDiscountCode.onclick=()=>{readDiscountEditor();discountCodes.push({id:"dc-"+Date.now(),code:"NUEVOCODIGO",percent:10,active:true});renderDiscountCodes()}
saveDiscountCodes.onclick=async()=>{readDiscountEditor();try{const saved=await api("/api/discount-codes",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({codes:discountCodes})});discountCodes=saved;renderDiscountCodes();discountMsg.textContent="Códigos guardados correctamente."}catch(err){discountMsg.textContent=err.message}}
function setNotificationMessage(text){const el=document.getElementById("notificationMsg");if(el)el.textContent=text||""}
async function enableNotifications(){
  if(!("Notification" in window)){setNotificationMessage("Este dispositivo no admite avisos del navegador.");return}
  try{
    const permission=await Notification.requestPermission();
    if(permission==="granted"){notificationsEnabled=true;localStorage.setItem("tf_notifications_enabled","1");setNotificationMessage("🔔 Avisos activados. Te avisaremos cuando entre un pedido nuevo.");startOrderPolling();}
    else setNotificationMessage("Los avisos están bloqueados. Actívalos en los ajustes de notificaciones del iPhone.");
  }catch(e){setNotificationMessage("No se pudieron activar los avisos.")}
}
function notifyNewOrder(order){
  if(!notificationsEnabled || !("Notification" in window) || Notification.permission!=="granted") return;
  const title=`⚽ Nuevo pedido #${order.id}`;
  const body=`${order.customer?.name||"Cliente"} · ${order.quantity||0} camiseta(s) · ${Number(order.total||0).toFixed(2)} €`;
  try{const n=new Notification(title,{body,icon:"/icon-180.png",tag:"pedido-"+order.id});n.onclick=()=>{window.focus();n.close();};}catch(e){}
  try{navigator.vibrate?.([200,100,200]);}catch(e){}
}
async function checkForNewOrders(){
  try{
    const orders=await api("/api/orders");
    if(!orders.length) return;
    const newest=orders[0];
    if(lastSeenOrderId && String(newest.id)!==String(lastSeenOrderId)){
      const idx=orders.findIndex(o=>String(o.id)===String(lastSeenOrderId));
      const newer=idx>=0?orders.slice(0,idx).reverse():[newest];
      newer.forEach(notifyNewOrder);
    }
    lastSeenOrderId=String(newest.id);
    localStorage.setItem("tf_last_seen_order_id",lastSeenOrderId);
  }catch(e){}
}
function startOrderPolling(){if(notificationTimer)clearInterval(notificationTimer);checkForNewOrders();notificationTimer=setInterval(checkForNewOrders,15000)}
async function load(){catalogs=await api("/api/catalogs");renderCatalogEditor();discountCodes=await api("/api/discount-codes");renderDiscountCodes();let orders;try{orders=await api("/api/orders")}catch{return}if(!orders.length){document.getElementById("orders").innerHTML='<div class="empty">Todavía no hay pedidos.</div>';return}document.getElementById("orders").innerHTML=orders.map(o=>`<article class="order"><div class="order-top"><div><strong>Pedido #${o.id}</strong><br>${new Date(o.createdAt).toLocaleString("es-ES")}</div><div><span class="status">${escapeHtml(o.status)}</span><select onchange="changeStatus('${o.id}',this.value)">${["Pendiente","Confirmado","En preparación","Enviado","Entregado","Cancelado"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></div></div><p><strong>${escapeHtml(o.customer.name)}</strong> · ${escapeHtml(o.customer.phone)}<br>${escapeHtml(o.customer.address||"Sin dirección")}</p><p><strong>${escapeHtml(o.catalogName||"Catálogo")}</strong> · ${o.quantity} camiseta(s) × ${Number(o.price).toFixed(2)} € = <strong>${Number(o.total).toFixed(2)} €</strong>${o.discount?` · Descuento total: -${Number(o.discount).toFixed(2)} €`:""}${o.discountCode?` · Código: ${escapeHtml(o.discountCode)}`:""}</p>${o.notes?`<p>📝 ${escapeHtml(o.notes)}</p>`:""}<div class="thumbs">${o.images.map(i=>`<a href="${i.url}" target="_blank"><img src="${i.url}" alt="Camiseta"></a>`).join("")}</div></article>`).join("")}
async function changeStatus(id,status){await api("/api/orders/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});load()}
enableNotifications.onclick=enableNotifications;refresh.onclick=load;logout.onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}start()