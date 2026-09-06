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
app.use(express.static(path.join(__dirname, "public")));
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
  fileFilter: (_, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp)$/.test(file.mimetype));
  }
});

function readData() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}
function writeData(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}
function nextOrderId(orders) {
  const max = orders.reduce((m, o) => Math.max(m, Number(o.id) || 0), 1000);
  return String(max + 1);
}

app.get("/api/catalogs", (req, res) => {
  res.json(readData().catalogs);
});

app.put("/api/catalogs", requireAdmin, (req, res) => {
  const data = readData();
  const c20 = String(req.body["20"] || "").trim();
  const c25 = String(req.body["25"] || "").trim();
  if (!c20 || !c25) return res.status(400).json({ error: "Los dos enlaces son obligatorios." });
  data.catalogs = { "20": c20, "25": c25 };
  writeData(data);
  res.json(data.catalogs);
});

app.post("/api/orders", upload.array("images", 20), (req, res) => {
  try {
    const data = readData();
    const price = Number(req.body.price);
    if (![20, 25].includes(price)) return res.status(400).json({ error: "Precio no válido." });

    const images = (req.files || []).map(f => ({
      url: "/uploads/" + f.filename,
      name: f.originalname
    }));

    const order = {
      id: nextOrderId(data.orders),
      createdAt: new Date().toISOString(),
      customer: {
        name: String(req.body.name || "").trim(),
        phone: String(req.body.phone || "").trim(),
        address: String(req.body.address || "").trim()
      },
      price,
      quantity: images.length,
      images,
      notes: String(req.body.notes || "").trim(),
      status: "Pendiente"
    };

    if (!order.customer.name || !order.customer.phone || images.length === 0) {
      return res.status(400).json({ error: "Nombre, teléfono y al menos una captura son obligatorios." });
    }

    data.orders.unshift(order);
    writeData(data);
    res.json(order);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "No se pudo crear el pedido." });
  }
});

app.get("/api/orders", requireAdmin, (req, res) => {
  res.json(readData().orders);
});

app.patch("/api/orders/:id", requireAdmin, (req, res) => {
  const data = readData();
  const order = data.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido no encontrado." });
  const allowed = ["Pendiente", "Confirmado", "En preparación", "Enviado", "Entregado", "Cancelado"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Estado no válido." });
  order.status = req.body.status;
  writeData(data);
  res.json(order);
});

app.listen(PORT, () => console.log(`Fútbol Ropa App: http://localhost:${PORT}`));
