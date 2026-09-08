let selectedPrice = null;
const priceInput = document.getElementById("price");
const total = document.getElementById("total");
const buttons = document.querySelectorAll(".price-selector button");

async function loadCatalogs(){
  const c = await fetch("/api/catalogs").then(r=>r.json());
  document.getElementById("cat20").href = c["20"];
  document.getElementById("cat25").href = c["25"];
}
loadCatalogs();

buttons.forEach(b => b.addEventListener("click", ()=>{
  selectedPrice = Number(b.dataset.price);
  priceInput.value = selectedPrice;
  total.textContent = selectedPrice + " €";
  buttons.forEach(x=>x.classList.remove("active"));
  b.classList.add("active");
}));

document.getElementById("images").addEventListener("change", e=>{
  const p = document.getElementById("preview"); p.innerHTML="";
  [...e.target.files].forEach(f=>{
    const img=document.createElement("img"); img.src=URL.createObjectURL(f); p.appendChild(img);
  });
});

document.getElementById("orderForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const msg=document.getElementById("message");
  if(!selectedPrice){msg.textContent="Selecciona si las camisetas son de 20 € o 25 €.";return}
  const fd=new FormData(e.target);
  const res=await fetch("/api/orders",{method:"POST",body:fd});
  const data=await res.json();
  if(!res.ok){msg.textContent=data.error||"Error";return}
  msg.textContent=`Pedido #${data.id} enviado correctamente. Total: ${data.quantity*data.price} €.`;
  e.target.reset(); document.getElementById("preview").innerHTML=""; selectedPrice=null; total.textContent="—";
  buttons.forEach(x=>x.classList.remove("active"));
});
