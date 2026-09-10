const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, "data.json");
const UPLOADS = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS);

app.use(express.json());
app.use(cookieParser());
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cambia-esta-clave";
const adminTokens = new Set();
function requireAdmin(req,res,next){
  const token=req.cookies.admin_token;
  if(!token || !adminTokens.has(token)) return res.status(401).json({error:"No autorizado"});
  next();
}
app.post("/api/login",(req,res)=>{
  if(String(req.body.password||"")!==ADMIN_PASSWORD) return res.status(401).json({error:"Contraseña incorrecta"});
  const token=crypto.randomBytes(32).toString("hex"); adminTokens.add(token);
  res.cookie("admin_token",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:8*60*60*1000});
  res.json({ok:true});
});
app.post("/api/logout",(req,res)=>{if(req.cookies.admin_token)adminTokens.delete(req.cookies.admin_token);res.clearCookie("admin_token");res.json({ok:true})});
app.get("/api/me",(req,res)=>res.json({admin:!!(req.cookies.admin_token&&adminTokens.has(req.cookies.admin_token))}));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use("/uploads", express.static(UPLOADS));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, Date.now() + "-" + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype))
});

function readData(){
  const data=JSON.parse(fs.readFileSync(DATA,"utf8"));
  if(!Array.isArray(data.catalogs)){
    const old=data.catalogs||{};
    data.catalogs=Object.entries(old).map(([price,url],i)=>({id:`cat${price||i+1}`,name:`Catálogo ${price} €`,price:Number(price),url}));
  }
  if(!Array.isArray(data.orders)) data.orders=[];
  if(!Array.isArray(data.discountCodes)) data.discountCodes=[];
  if(!Array.isArray(data.gallery)) data.gallery=[];
  return data;
}
function writeData(data){fs.writeFileSync(DATA,JSON.stringify(data,null,2));}
function nextOrderId(orders){const max=orders.reduce((m,o)=>Math.max(m,Number(o.id)||0),1000);return String(max+1)}
function cleanCatalog(input,index){
  const id=String(input.id||`cat-${Date.now()}-${index||0}`).trim().replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,60);
  const name=String(input.name||"").trim().slice(0,80);
  const price=Number(input.price);
  const url=String(input.url||"").trim();
  if(!id||!name||!Number.isFinite(price)||price<=0||price>10000||!/^https?:\/\//i.test(url)) return null;
  return {id,name,price,url};
}

app.get("/api/catalogs",(req,res)=>res.json(readData().catalogs));
app.get("/api/discount-codes",requireAdmin,(req,res)=>res.json(readData().discountCodes));
app.put("/api/discount-codes",requireAdmin,(req,res)=>{
  const incoming=Array.isArray(req.body.codes)?req.body.codes:[];
  const seen=new Set();
  const codes=[];
  for(const raw of incoming){
    const code=String(raw.code||"").trim().toUpperCase().replace(/\s+/g,"").slice(0,40);
    const percent=Number(raw.percent);
    const active=raw.active!==false;
    if(!code || !/^[A-Z0-9_-]+$/.test(code) || !Number.isFinite(percent) || percent<=0 || percent>100 || seen.has(code)) continue;
    seen.add(code); codes.push({id:String(raw.id||("dc-"+Date.now()+"-"+codes.length)),code,percent,active});
  }
  const data=readData(); data.discountCodes=codes; writeData(data); res.json(codes);
});

app.put("/api/catalogs",requireAdmin,(req,res)=>{
  const incoming=Array.isArray(req.body.catalogs)?req.body.catalogs:[];
  const seen=new Set();
  const catalogs=incoming.map((c,i)=>cleanCatalog(c,i)).filter(c=>c&&!seen.has(c.id)&&!seen.add(c.id));
  if(!catalogs.length) return res.status(400).json({error:"Debe existir al menos un catálogo válido."});
  const data=readData(); data.catalogs=catalogs; writeData(data); res.json(catalogs);
});

// Galería de clientes: las fotos se publican solo después de aprobación del administrador.
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
    try{if(item.image)fs.unlinkSync(path.join(__dirname,item.image.replace(/^\//,"")))}catch(e){}
    data.gallery=data.gallery.filter(x=>x.id!==item.id);
    data.discountCodes=data.discountCodes.filter(c=>c.code!==item.discountCode);
    writeData(data);return res.json({ok:true});
  }else return res.status(400).json({error:"Acción no válida."});
  writeData(data);res.json(item);
});

app.post("/api/orders",upload.array("images",20),(req,res)=>{
  try{
    const data=readData();
    const catalogId=String(req.body.catalogId||"");
    const catalog=data.catalogs.find(c=>c.id===catalogId);
    if(!catalog) return res.status(400).json({error:"Catálogo no válido."});
    const files=req.files||[];
    let items=[];
    try{items=JSON.parse(String(req.body.items||"[]"));}catch{items=[]}
    if(!Array.isArray(items)||items.length!==files.length||items.some(x=>!String(x.size||"").trim()||!Number.isInteger(Number(x.quantity))||Number(x.quantity)<1||Number(x.quantity)>99)) return res.status(400).json({error:"Debes elegir una talla y una cantidad válida para cada camiseta."});
    const images=files.map((f,i)=>({url:"/uploads/"+f.filename,name:f.originalname,size:String(items[i].size).trim(),quantity:Number(items[i].quantity)}));
    const quantity=images.reduce((n,x)=>n+x.quantity,0);
    const quantityDiscountRate=quantity>=5?0.20:quantity===4?0.15:quantity===3?0.10:quantity===2?0.05:0;
    const subtotal=quantity*catalog.price;
    const quantityDiscount=subtotal*quantityDiscountRate;
    const afterQuantityDiscount=subtotal-quantityDiscount;
    const requestedCode=String(req.body.discountCode||"").trim().toUpperCase();
    const discountCode=data.discountCodes.find(c=>c.code===requestedCode && c.active);
    if(requestedCode && !discountCode) return res.status(400).json({error:"Código de descuento no válido o no está activo."});
    const codeDiscountRate=discountCode?Number(discountCode.percent)/100:0;
    const codeDiscount=afterQuantityDiscount*codeDiscountRate;
    const finalTotal=afterQuantityDiscount-codeDiscount;
    const totalDiscount=quantityDiscount+codeDiscount;
    const order={
      id:nextOrderId(data.orders),createdAt:new Date().toISOString(),
      customer:{name:String(req.body.name||"").trim(),phone:String(req.body.phone||"").trim(),address:String(req.body.address||"").trim()},
      catalogId:catalog.id,catalogName:catalog.name,price:catalog.price,quantity,subtotal,discountRate:quantityDiscountRate,discount:totalDiscount,quantityDiscountRate,quantityDiscount,discountCode:discountCode?discountCode.code:"",codeDiscountRate,codeDiscount,total:finalTotal,images,
      notes:String(req.body.notes||"").trim(),status:"Pendiente"
    };
    if(!order.customer.name||!order.customer.phone||images.length===0) return res.status(400).json({error:"Nombre, teléfono y al menos una captura son obligatorios."});
    data.orders.unshift(order);writeData(data);res.json(order);
  }catch(e){console.error(e);res.status(500).json({error:"No se pudo crear el pedido."})}
});
app.get("/api/orders",requireAdmin,(req,res)=>res.json(readData().orders));
app.patch("/api/orders/:id",requireAdmin,(req,res)=>{
  const data=readData();const order=data.orders.find(o=>o.id===req.params.id);if(!order)return res.status(404).json({error:"Pedido no encontrado."});
  const allowed=["Pendiente","Confirmado","En preparación","Enviado","Entregado","Cancelado"];
  if(!allowed.includes(req.body.status))return res.status(400).json({error:"Estado no válido."});order.status=req.body.status;writeData(data);res.json(order);
});
app.listen(PORT,()=>console.log(`TodoFútbol App: http://localhost:${PORT}`));
