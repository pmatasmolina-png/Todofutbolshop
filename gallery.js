async function loadGallery(){
  const box=document.getElementById("galleryGrid");if(!box)return;
  try{const items=await fetch("/api/gallery").then(r=>r.json());
    box.innerHTML=items.length?items.map(x=>`<article class="customer-photo"><img src="${x.image}" alt="Foto de ${escapeGallery(x.name)}"><div><strong>${escapeGallery(x.name)}</strong>${x.comment?`<p>${escapeGallery(x.comment)}</p>`:""}</div></article>`).join(""): '<div class="gallery-empty">Sé el primero en aparecer aquí 😎</div>';
  }catch(e){box.innerHTML=""}
}
function escapeGallery(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
const galleryForm=document.getElementById("galleryForm");
if(galleryForm)galleryForm.addEventListener("submit",async e=>{e.preventDefault();const msg=document.getElementById("galleryMessage");msg.textContent="Subiendo foto…";try{const r=await fetch("/api/gallery",{method:"POST",body:new FormData(galleryForm)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Error");msg.innerHTML=`✅ Foto recibida. Guarda tu código: <strong>${escapeGallery(d.discountCode)}</strong>. Se activará cuando aprobemos la foto.`;galleryForm.reset();loadGallery()}catch(err){msg.textContent="❌ "+err.message}});
loadGallery();
