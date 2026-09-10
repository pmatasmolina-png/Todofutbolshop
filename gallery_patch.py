from pathlib import Path
p=Path('/mnt/data/photo_work/server.js')
s=p.read_text()
# add gallery default
s=s.replace('  if(!Array.isArray(data.discountCodes)) data.discountCodes=[];\n', '  if(!Array.isArray(data.discountCodes)) data.discountCodes=[];\n  if(!Array.isArray(data.gallery)) data.gallery=[];\n')
# insert routes before orders
marker='app.post("/api/orders",upload.array("images",20),(req,res)=>{'
routes=r'''// Galería de clientes: las fotos se publican solo después de aprobación del administrador.
app.get("/api/gallery",(req,res)=>{
  const data=readData();
  res.json(data.gallery.filter(x=>x.status==="approved").map(x=>({id:x.id,name:x.name,comment:x.comment,image:x.image,createdAt:x.createdAt})));
});
app.get("/api/gallery/admin",requireAdmin,(req,res)=>res.json(readData().gallery));
app.post("/api/gallery",upload.single("photo"),(req,res)=>{
  try{
    if(!req.file) return res.status(400).json({error:"Debes subir una foto válida."});
    const name=String(req.body.name||"").trim().slice(0,40);
    const comment=String(req.body.comment||"").trim().slice(0,180);
    if(!name) return res.status(400).json({error:"Escribe tu nombre o apodo."});
    const data=readData();
    const id="gal-"+Date.now()+"-"+crypto.randomBytes(3).toString("hex");
    const code="FOTO-"+crypto.randomBytes(3).toString("hex").toUpperCase();
    const item={id,createdAt:new Date().toISOString(),name,comment,image:"/uploads/"+req.file.filename,status:"pending",discountCode:code,discountPercent:10};
    data.gallery.unshift(item);data.discountCodes.push({id:"dc-"+Date.now()+"-"+crypto.randomBytes(2).toString("hex"),code,percent:10,active:false});
    writeData(data);res.json({ok:true,id,discountCode:code,message:"Foto recibida. Cuando la aprobemos, tu código del 10% quedará activo."});
  }catch(e){console.error(e);res.status(500).json({error:"No se pudo subir la foto."})}
});
app.patch("/api/gallery/:id",requireAdmin,(req,res)=>{
  const data=readData();const item=data.gallery.find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:"Foto no encontrada."});
  const action=String(req.body.action||"");
  if(action==="approve"){
    item.status="approved";
    const dc=data.discountCodes.find(c=>c.code===item.discountCode);if(dc)dc.active=true;
  }else if(action==="reject"){
    item.status="rejected";
    const dc=data.discountCodes.find(c=>c.code===item.discountCode);if(dc)dc.active=false;
  }else if(action==="delete"){
    try{if(item.image)fs.unlinkSync(path.join(__dirname,item.image.replace(/^\\//,"")))}catch(e){}
    data.gallery=data.gallery.filter(x=>x.id!==item.id);
    data.discountCodes=data.discountCodes.filter(c=>c.code!==item.discountCode);
    writeData(data);return res.json({ok:true});
  }else return res.status(400).json({error:"Acción no válida."});
  writeData(data);res.json(item);
});

'''
s=s.replace(marker,routes+marker)
p.write_text(s)

# index
p=Path('/mnt/data/photo_work/index.html');s=p.read_text()
insert='''<div class="tf-section-title">📸 CLIENTES TODOFÚTBOL</div>\n<section class="customer-gallery">\n  <div class="gallery-intro"><h2>Enséñanos tu pedido 🎁</h2><p>Sube una foto con tu camiseta. Si la aprobamos, te damos <strong>10% de descuento</strong> para tu próximo pedido.</p></div>\n  <form id="galleryForm" class="gallery-form"><label>Nombre o apodo<input name="name" maxlength="40" required placeholder="Ej.: Pepe"></label><label>Tu foto<input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required></label><label>Comentario <span>(opcional)</span><textarea name="comment" maxlength="180" placeholder="¿Qué te parece tu camiseta?"></textarea></label><button class="submit" type="submit">📸 Subir mi foto</button></form><div id="galleryMessage"></div>\n  <div id="galleryGrid" class="customer-gallery-grid"></div>\n</section>\n'''
s=s.replace('<div class="tf-section-title tf-order-title">📦 HACER PEDIDO</div>',insert+'<div class="tf-section-title tf-order-title">📦 HACER PEDIDO</div>')
# add gallery script before app.js
s=s.replace('<main class="tf-home-redesign">', '<main class="tf-home-redesign">')
s=s.replace('<script src="app.js"></script>', '<script src="app.js"></script><script src="gallery.js"></script>')
p.write_text(s)

# admin html
p=Path('/mnt/data/photo_work/admin.html');s=p.read_text()
section='''<section class="order-box"><h1>📸 Fotos de clientes</h1><p class="hint">Revisa las fotos antes de publicarlas. Al aprobar una foto, su código del <strong>10%</strong> queda activo automáticamente.</p><div id="galleryAdminList"></div><div id="galleryAdminMsg"></div></section>'''
s=s.replace('<section class="orders"><div class="orders-head">',section+'<section class="orders"><div class="orders-head">')
p.write_text(s)

# admin js append gallery functionality and call load
p=Path('/mnt/data/photo_work/admin.js');s=p.read_text()
s=s.replace('async function load(){catalogs=await api("/api/catalogs");', 'async function load(){await loadGalleryAdmin();catalogs=await api("/api/catalogs");')
add=r'''
async function loadGalleryAdmin(){
  const box=document.getElementById("galleryAdminList");if(!box)return;
  try{
    const items=await api("/api/gallery/admin");
    if(!items.length){box.innerHTML='<div class="empty">Todavía no hay fotos de clientes.</div>';return}
    box.innerHTML=items.map(x=>`<article class="gallery-admin-item"><a href="${x.image}" target="_blank"><img src="${x.image}" alt="Foto de cliente"></a><div class="gallery-admin-info"><strong>${escapeHtml(x.name)}</strong>${x.comment?`<p>${escapeHtml(x.comment)}</p>`:""}<p><span class="status">${x.status==="approved"?"Publicada":x.status==="rejected"?"Rechazada":"Pendiente"}</span> · Código: <strong>${escapeHtml(x.discountCode)}</strong></p><div class="gallery-admin-actions">${x.status!=="approved"?`<button type="button" onclick="galleryAction('${x.id}','approve')">✅ Aprobar</button>`:""}${x.status!=="rejected"?`<button type="button" onclick="galleryAction('${x.id}','reject')">❌ Rechazar</button>`:""}<button type="button" onclick="galleryAction('${x.id}','delete')">🗑️ Eliminar</button></div></div></article>`).join("");
  }catch(e){box.innerHTML='<div class="empty">No se pudo cargar la galería.</div>'}
}
window.galleryAction=async(id,action)=>{try{await api("/api/gallery/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});loadGalleryAdmin()}catch(e){const m=document.getElementById("galleryAdminMsg");if(m)m.textContent=e.message}}
'''
s=s+add
p.write_text(s)

# gallery.js
Path('/mnt/data/photo_work/gallery.js').write_text(r'''async function loadGallery(){
  const box=document.getElementById("galleryGrid");if(!box)return;
  try{const items=await fetch("/api/gallery").then(r=>r.json());
    box.innerHTML=items.length?items.map(x=>`<article class="customer-photo"><img src="${x.image}" alt="Foto de ${escapeGallery(x.name)}"><div><strong>${escapeGallery(x.name)}</strong>${x.comment?`<p>${escapeGallery(x.comment)}</p>`:""}</div></article>`).join(""): '<div class="gallery-empty">Sé el primero en aparecer aquí 😎</div>';
  }catch(e){box.innerHTML=""}
}
function escapeGallery(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
const galleryForm=document.getElementById("galleryForm");
if(galleryForm)galleryForm.addEventListener("submit",async e=>{e.preventDefault();const msg=document.getElementById("galleryMessage");msg.textContent="Subiendo foto…";try{const r=await fetch("/api/gallery",{method:"POST",body:new FormData(galleryForm)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Error");msg.innerHTML=`✅ Foto recibida. Guarda tu código: <strong>${escapeGallery(d.discountCode)}</strong>. Se activará cuando aprobemos la foto.`;galleryForm.reset();loadGallery()}catch(err){msg.textContent="❌ "+err.message}});
loadGallery();
''')

# style append
p=Path('/mnt/data/photo_work/style.css');s=p.read_text();s+=r'''
.customer-gallery{background:#fff;border-radius:20px;padding:22px;margin-top:10px;box-shadow:0 5px 25px #0000000a}.gallery-intro{text-align:center}.gallery-intro h2{margin-bottom:7px}.gallery-intro p{color:#69707a;line-height:1.45}.gallery-form{max-width:650px;margin:18px auto}.customer-gallery-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}.customer-photo{border:1px solid #e3e5e8;border-radius:15px;overflow:hidden;background:#fff}.customer-photo img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block}.customer-photo div{padding:11px}.customer-photo p{margin:5px 0 0;color:#69707a;font-size:13px}.gallery-empty{text-align:center;color:#777;padding:25px}.gallery-admin-item{display:flex;gap:15px;border:1px solid #ddd;border-radius:16px;padding:13px;margin:12px 0;background:#fafafa}.gallery-admin-item>a img{width:150px;height:150px;object-fit:cover;border-radius:12px}.gallery-admin-info{flex:1}.gallery-admin-info p{color:#69707a}.gallery-admin-actions{display:flex;gap:7px;flex-wrap:wrap}.gallery-admin-actions button{border:1px solid #ddd;background:#fff;border-radius:9px;padding:9px 11px;cursor:pointer;font-weight:700}.gallery-admin-actions button:first-child{background:#111;color:#fff;border-color:#111}@media(max-width:650px){.customer-gallery-grid{grid-template-columns:repeat(2,1fr)}.gallery-admin-item{flex-direction:column}.gallery-admin-item>a img{width:100%;height:auto;max-height:360px}.gallery-admin-actions button{flex:1}}@media(max-width:400px){.customer-gallery-grid{grid-template-columns:1fr}}
''';p.write_text(s)

# sw bump cache
p=Path('/mnt/data/photo_work/sw.js');s=p.read_text().replace('todofutbolshop-v4','todofutbolshop-v5');p.write_text(s)
