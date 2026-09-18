const express=require('express');
const fs=require('fs'); const path=require('path'); const multer=require('multer'); const crypto=require('crypto');
const app=express(); const PORT=process.env.PORT||3000;
const ROOT=__dirname, DATA=path.join(ROOT,'data','qhse.json'), UP=path.join(ROOT,'uploads');
fs.mkdirSync(path.dirname(DATA),{recursive:true}); fs.mkdirSync(UP,{recursive:true});
const initial={users:[{id:1,name:'Administrateur',email:'admin@qhse.local',password:'admin123',role:'Admin'}],incidents:[],risks:[],actions:[],inspections:[],audits:[],environment:[],logs:[],notifications:[]};
function load(){try{return JSON.parse(fs.readFileSync(DATA,'utf8'))}catch{return structuredClone(initial)}}
let db=load(); const sessions=new Map();
const ROLES=['Admin','QHSE Manager','Superviseur','Employé'];
const PERMS={
  Admin:['*'],
  'QHSE Manager':['read','create','update','delete','close','upload','report','export'],
  Superviseur:['read','create','update','close','upload','report','export'],
  Employé:['read','create','upload','report']
};
function hashPassword(p,salt=crypto.randomBytes(16).toString('hex')){return {salt,hash:crypto.scryptSync(String(p),salt,64).toString('hex')}}
function verifyPassword(p,u){
  if(u.passwordHash&&u.passwordSalt) return crypto.timingSafeEqual(Buffer.from(u.passwordHash,'hex'),Buffer.from(crypto.scryptSync(String(p),u.passwordSalt,64).toString('hex'),'hex'));
  return u.password===String(p);
}
function sanitizeUser(u){const {password,passwordHash,passwordSalt,...safe}=u;return safe}
function auth(req,res,next){const h=String(req.headers.authorization||'');const token=h.startsWith('Bearer ')?h.slice(7):'';const uid=sessions.get(token);const u=db.users.find(x=>x.id===uid);if(!u)return res.status(401).json({error:'Authentification requise'});req.user=u;next()}
function allow(permission){return (req,res,next)=>{const perms=PERMS[req.user.role]||[];if(!perms.includes('*')&&!perms.includes(permission))return res.status(403).json({error:'Permission insuffisante'});next()}}
function save(){fs.writeFileSync(DATA,JSON.stringify(db,null,2))} function id(a){return a.length?Math.max(...a.map(x=>Number(x.id)||0))+1:1} function log(user,action,detail){db.logs.unshift({id:id(db.logs),date:new Date().toISOString(),user,action,detail});save()}
app.use(express.json({limit:'4mb'}));
app.get('/health',(req,res)=>res.json({ok:true,app:'QHSEFlow',version:'V6'})); app.use(express.urlencoded({extended:true})); app.use('/uploads',express.static(UP)); app.use(express.static(path.join(ROOT,'public')));
const storage=multer.diskStorage({destination:(r,f,cb)=>cb(null,UP),filename:(r,f,cb)=>cb(null,Date.now()+'-'+Math.random().toString(36).slice(2)+path.extname(f.originalname).toLowerCase())});
const upload=multer({storage,limits:{fileSize:8*1024*1024}});
app.post('/api/login',(req,res)=>{
  const u=db.users.find(x=>x.email.toLowerCase()===String(req.body.email||'').toLowerCase());
  if(!u||!verifyPassword(req.body.password,u))return res.status(401).json({error:'Identifiants incorrects'});
  if(!u.passwordHash){const hp=hashPassword(req.body.password);u.passwordHash=hp.hash;u.passwordSalt=hp.salt;delete u.password;save()}
  const token=crypto.randomBytes(32).toString('hex');sessions.set(token,u.id);
  res.json({token,user:sanitizeUser(u)});
});
app.post('/api/logout',auth,(req,res)=>{const h=String(req.headers.authorization||'');sessions.delete(h.slice(7));res.json({ok:true})});
app.get('/api/me',auth,(req,res)=>res.json({user:sanitizeUser(req.user)}));
app.get('/api/data',auth,(req,res)=>{
  res.json({...db,users:db.users.map(sanitizeUser)});
});
app.post('/api/users',auth,allow('create'),(req,res)=>{const {name,email,password,role='Employé'}=req.body;if(!name||!email||!password)return res.status(400).json({error:'Champs obligatoires'});if(db.users.some(x=>x.email.toLowerCase()===email.toLowerCase()))return res.status(409).json({error:'Email déjà utilisé'});if(!ROLES.includes(role))return res.status(400).json({error:'Rôle invalide'});const hp=hashPassword(password);const u={id:id(db.users),name,email,passwordHash:hp.hash,passwordSalt:hp.salt,role};db.users.push(u);log(req.user.email,'Création utilisateur',email);res.json(sanitizeUser(u))});
app.delete('/api/users/:id',auth,allow('delete'),(req,res)=>{const n=Number(req.params.id);if(n===1)return res.status(400).json({error:'Compte administrateur principal protégé'});db.users=db.users.filter(x=>x.id!==n);log(req.user.email,'Suppression utilisateur',String(n));res.json({ok:true})});
function collection(name,label){app.post('/api/'+name,auth,allow('create'),(req,res)=>{const x={id:id(db[name]),createdAt:new Date().toISOString(),...req.body};db[name].push(x);if(name==='risks'){x.score=Number(x.probability)*Number(x.gravity);x.level=x.score>=16?'Critique':x.score>=9?'Élevé':x.score>=4?'Modéré':'Faible';}log(req.user.email,'Création '+label,String(x.id));res.json(x)});
app.put('/api/'+name+'/:id',auth,allow('update'),(req,res)=>{const i=db[name].findIndex(x=>x.id===Number(req.params.id));if(i<0)return res.status(404).json({error:'Introuvable'});db[name][i]={...db[name][i],...req.body,updatedAt:new Date().toISOString()};if(name==='risks'){const x=db[name][i];x.score=Number(x.probability)*Number(x.gravity);x.level=x.score>=16?'Critique':x.score>=9?'Élevé':x.score>=4?'Modéré':'Faible'}log(req.user.email,'Modification '+label,String(req.params.id));res.json(db[name][i])});
app.delete('/api/'+name+'/:id',auth,allow('delete'),(req,res)=>{const n=Number(req.params.id),before=db[name].length;db[name]=db[name].filter(x=>x.id!==n);if(db[name].length===before)return res.status(404).json({error:'Introuvable'});log(req.user.email,'Suppression '+label,String(n));res.json({ok:true})})}
['incidents','risks','actions','inspections','audits','environment'].forEach(n=>collection(n,n));

app.post('/api/upload',auth,allow('upload'),upload.array('photos',8),(req,res)=>{res.json({files:req.files.map(f=>({name:f.originalname,url:'/uploads/'+f.filename,size:f.size}))})});
app.post('/api/notifications/read',auth,(req,res)=>{db.notifications=db.notifications.map(n=>({...n,read:true}));save();res.json({ok:true})});
app.get('/api/export/:name',auth,allow('export'),(req,res)=>{const arr=db[req.params.name];if(!Array.isArray(arr))return res.status(404).send('Not found');const keys=[...new Set(arr.flatMap(x=>Object.keys(x)))];const csv=[keys.join(';'),...arr.map(x=>keys.map(k=>`"${String(x[k]??'').replace(/"/g,'""')}"`).join(';'))].join('\n');res.setHeader('Content-Type','text/csv;charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename=${req.params.name}.csv`);res.send('\ufeff'+csv)});

app.post('/api/inspections/:id/convert',auth,allow('create'), (req,res)=>{
  const inspection=db.inspections.find(x=>x.id===Number(req.params.id));
  if(!inspection) return res.status(404).json({error:'Inspection introuvable'});
  const a={id:id(db.actions),createdAt:new Date().toISOString(),title:req.body.title||('Action issue de l’inspection #'+inspection.id),description:req.body.description||inspection.observation||'',responsible:req.body.responsible||inspection.responsible||'',dueDate:req.body.dueDate||inspection.dueDate||'',priority:req.body.priority||inspection.riskLevel||'Moyenne',status:'Ouverte',source:'Inspection #'+inspection.id,photos:inspection.photos||[]};
  db.actions.push(a); inspection.actionId=a.id; inspection.status='Action créée';
  db.notifications.unshift({id:id(db.notifications),date:new Date().toISOString(),type:'Action corrective',message:`Action #${a.id} créée depuis l’inspection #${inspection.id}.`,read:false});
  log(req.user.email,'Création action depuis inspection',String(a.id)); save(); res.json(a);
});

app.post('/api/actions/:id/close',auth,allow('close'), (req,res)=>{
  const a=db.actions.find(x=>x.id===Number(req.params.id));
  if(!a) return res.status(404).json({error:'Action introuvable'});
  a.status='Clôturée'; a.closedAt=new Date().toISOString(); if(req.body.photos) a.closurePhotos=req.body.photos;
  log(req.user.email,'Clôture action',String(a.id)); save(); res.json(a);
});

app.get('/api/report/:name/:id',auth,allow('report'),(req,res)=>{
  const x=db[req.params.name]?.find(v=>v.id===Number(req.params.id));
  if(!x) return res.status(404).send('Élément introuvable');
  const escH=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const photos=[...(x.photos||[]),...(x.closurePhotos||[])].map(p=>`<img src="${escH(p.url||p)}" style="width:180px;height:130px;object-fit:cover;margin:6px;border:1px solid #ddd;border-radius:8px">`).join('');
  const rows=Object.entries(x).filter(([k])=>!['photos','closurePhotos'].includes(k)).map(([k,v])=>`<tr><th>${escH(k)}</th><td>${escH(typeof v==='object'?JSON.stringify(v):v)}</td></tr>`).join('');
  res.send(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Rapport QHSE</title><style>body{font-family:Arial;margin:35px;color:#172033}h1{color:#174d7b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:9px;text-align:left}th{width:30%;background:#f3f6fa}.photos{margin-top:20px}@media print{button{display:none}}</style><h1>Rapport QHSE — ${escH(req.params.name)} #${escH(x.id)}</h1><p>Généré le ${new Date().toLocaleString('fr-FR')}</p><table>${rows}</table><div class="photos"><h2>Preuves photographiques</h2>${photos||'<p>Aucune photo.</p>'}</div><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></html>`);
});

app.use((req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
save();app.listen(PORT,()=>console.log(`QHSEFlow V6 : http://localhost:${PORT}`));
