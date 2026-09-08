let selectedPrice = null;
const priceInput = document.getElementById("price");
const total = document.getElementById("total");
const discountText = document.getElementById("discountText");
const quantityText = document.getElementById("quantityText");
const buttons = document.querySelectorAll(".price-selector button");

function discountRate(q){
  if(q >= 5) return 0.20;
  if(q === 4) return 0.15;
  if(q === 3) return 0.10;
  if(q === 2) return 0.05;
  return 0;
}
function updateTotal(){
  const q = document.getElementById("images").files.length;
  const rate = discountRate(q);
  if(!selectedPrice || !q){
    total.textContent = selectedPrice ? selectedPrice + " €" : "—";
    discountText.textContent = "";
    quantityText.textContent = q ? `${q} camiseta${q===1?'':'s'}` : "";
    return;
  }
  const subtotal = q * selectedPrice;
  const discount = subtotal * rate;
  const finalTotal = subtotal - discount;
  quantityText.textContent = `${q} camiseta${q===1?'':'s'} · Subtotal: ${subtotal.toFixed(2)} €`;
  discountText.textContent = rate ? `Descuento: ${(rate*100).toFixed(0)}% (-${discount.toFixed(2)} €)` : "Sin descuento";
  total.textContent = `${finalTotal.toFixed(2)} €`;
}

async function loadCatalogs(){
  const c = await fetch("/api/catalogs").then(r=>r.json());
  document.getElementById("cat20").href = c["20"];
  document.getElementById("cat25").href = c["25"];
}
loadCatalogs();

buttons.forEach(b => b.addEventListener("click", ()=>{
  selectedPrice = Number(b.dataset.price);
  priceInput.value = selectedPrice;
  buttons.forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
  updateTotal();
}));

document.getElementById("images").addEventListener("change", e=>{
  const p = document.getElementById("preview"); p.innerHTML="";
  [...e.target.files].forEach(f=>{
    const img=document.createElement("img"); img.src=URL.createObjectURL(f); p.appendChild(img);
  });
  updateTotal();
});

document.getElementById("orderForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const msg=document.getElementById("message");
  if(!selectedPrice){msg.textContent="Selecciona si las camisetas son de 20 € o 25 €.";return}
  const fd=new FormData(e.target);
  const res=await fetch("/api/orders",{method:"POST",body:fd});
  const data=await res.json();
  if(!res.ok){msg.textContent=data.error||"Error";return}
  msg.textContent=`Pedido #${data.id} enviado correctamente. Total: ${Number(data.total).toFixed(2)} €. Descuento: ${Number(data.discountRate*100).toFixed(0)}%.`;
  e.target.reset(); document.getElementById("preview").innerHTML=""; selectedPrice=null; total.textContent="—"; discountText.textContent=""; quantityText.textContent="";
  buttons.forEach(x=>x.classList.remove("active"));
});
