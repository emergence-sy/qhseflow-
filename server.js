const express=require('express');
const fs=require('fs'); const path=require('path'); const multer=require('multer');
const app=express(); const PORT=process.env.PORT||3000;
const ROOT=__dirname, DATA=path.join(ROOT,'data','qhse.json'), UP=path.join(ROOT,'uploads');
fs.mkdirSync(path.dirname(DATA),{recursive:true}); fs.mkdirSync(UP,{recursive:true});
const initial={users:[{id:1,name:'Administrateur',email:'admin@qhse.local',password:'admin123',role:'Admin'}],incidents:[],risks:[],actions:[],inspections:[],audits:[],environment:[],logs:[],notifications:[]};
function load(){try{return JSON.parse(fs.readFileSync(DATA,'utf8'))}catch{return structuredClone(initial)}}
let db=load(); function save(){fs.writeFileSync(DATA,JSON.stringify(db,null,2))} function id(a){return a.length?Math.max(...a.map(x=>Number(x.id)||0))+1:1} function log(user,action,detail){db.logs.unshift({id:id(db.logs),date:new Date().toISOString(),user,action,detail});save()}
app.use(express.json({limit:'4mb'}));
app.get('/health',(req,res)=>res.json({ok:true,app:'QHSEFlow',version:'V6'})); app.use(express.urlencoded({extended:true})); app.use('/uploads',express.static(UP)); app.use(express.static(path.join(ROOT,'public')));
const storage=multer.diskStorage({destination:(r,f,cb)=>cb(null,UP),filename:(r,f,cb)=>cb(null,Date.now()+'-'+Math.random().toString(36).slice(2)+path.extname(f.originalname).toLowerCase())});
const upload=multer({storage,limits:{fileSize:8*1024*1024}});
app.post('/api/login',(req,res)=>{const u=db.users.find(x=>x.email.toLowerCase()===String(req.body.email||'').toLowerCase()&&x.password===req.body.password);if(!u)return res.status(401).json({error:'Identifiants incorrects'});res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}})});
app.get('/api/data',(req,res)=>res.json(db));
app.post('/api/users',(req,res)=>{const {name,email,password,role='Employé'}=req.body;if(!name||!email||!password)return res.status(400).json({error:'Champs obligatoires'});if(db.users.some(x=>x.email.toLowerCase()===email.toLowerCase()))return res.status(409).json({error:'Email déjà utilisé'});const u={id:id(db.users),name,email,password,role};db.users.push(u);log('Admin','Création utilisateur',email);res.json(u)});
app.delete('/api/users/:id',(req,res)=>{const n=Number(req.params.id);if(n===1)return res.status(400).json({error:'Compte administrateur principal protégé'});db.users=db.users.filter(x=>x.id!==n);log('Admin','Suppression utilisateur',String(n));res.json({ok:true})});
function collection(name,label){app.post('/api/'+name,(req,res)=>{const x={id:id(db[name]),createdAt:new Date().toISOString(),...req.body};db[name].push(x);if(name==='risks'){x.score=Number(x.probability)*Number(x.gravity);x.level=x.score>=16?'Critique':x.score>=9?'Élevé':x.score>=4?'Modéré':'Faible';}log('Utilisateur','Création '+label,String(x.id));res.json(x)});
app.put('/api/'+name+'/:id',(req,res)=>{const i=db[name].findIndex(x=>x.id===Number(req.params.id));if(i<0)return res.status(404).json({error:'Introuvable'});db[name][i]={...db[name][i],...req.body,updatedAt:new Date().toISOString()};if(name==='risks'){const x=db[name][i];x.score=Number(x.probability)*Number(x.gravity);x.level=x.score>=16?'Critique':x.score>=9?'Élevé':x.score>=4?'Modéré':'Faible'}log('Utilisateur','Modification '+label,String(req.params.id));res.json(db[name][i])});
app.delete('/api/'+name+'/:id',(req,res)=>{const n=Number(req.params.id),before=db[name].length;db[name]=db[name].filter(x=>x.id!==n);if(db[name].length===before)return res.status(404).json({error:'Introuvable'});log('Utilisateur','Suppression '+label,String(n));res.json({ok:true})})}
['incidents','risks','actions','inspections','audits','environment'].forEach(n=>collection(n,n));
app.post('/api/upload',upload.array('photos',8),(req,res)=>{res.json({files:req.files.map(f=>({name:f.originalname,url:'/uploads/'+f.filename,size:f.size}))})});
app.post('/api/notifications/read',(req,res)=>{db.notifications=db.notifications.map(n=>({...n,read:true}));save();res.json({ok:true})});
app.get('/api/export/:name',(req,res)=>{const arr=db[req.params.name];if(!Array.isArray(arr))return res.status(404).send('Not found');const keys=[...new Set(arr.flatMap(x=>Object.keys(x)))];const csv=[keys.join(';'),...arr.map(x=>keys.map(k=>`"${String(x[k]??'').replace(/"/g,'""')}"`).join(';'))].join('\n');res.setHeader('Content-Type','text/csv;charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename=${req.params.name}.csv`);res.send('\ufeff'+csv)});

app.post('/api/inspections/:id/convert', (req,res)=>{
  const inspection=db.inspections.find(x=>x.id===Number(req.params.id));
  if(!inspection) return res.status(404).json({error:'Inspection introuvable'});
  const a={id:id(db.actions),createdAt:new Date().toISOString(),title:req.body.title||('Action issue de l’inspection #'+inspection.id),description:req.body.description||inspection.observation||'',responsible:req.body.responsible||inspection.responsible||'',dueDate:req.body.dueDate||inspection.dueDate||'',priority:req.body.priority||inspection.riskLevel||'Moyenne',status:'Ouverte',source:'Inspection #'+inspection.id,photos:inspection.photos||[]};
  db.actions.push(a); inspection.actionId=a.id; inspection.status='Action créée';
  db.notifications.unshift({id:id(db.notifications),date:new Date().toISOString(),type:'Action corrective',message:`Action #${a.id} créée depuis l’inspection #${inspection.id}.`,read:false});
  log('Utilisateur','Création action depuis inspection',String(a.id)); save(); res.json(a);
});

app.post('/api/actions/:id/close', (req,res)=>{
  const a=db.actions.find(x=>x.id===Number(req.params.id));
  if(!a) return res.status(404).json({error:'Action introuvable'});
  a.status='Clôturée'; a.closedAt=new Date().toISOString(); if(req.body.photos) a.closurePhotos=req.body.photos;
  log('Utilisateur','Clôture action',String(a.id)); save(); res.json(a);
});

app.get('/api/report/:name/:id',(req,res)=>{
  const x=db[req.params.name]?.find(v=>v.id===Number(req.params.id));
  if(!x) return res.status(404).send('Élément introuvable');
  const escH=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const photos=[...(x.photos||[]),...(x.closurePhotos||[])].map(p=>`<img src="${escH(p.url||p)}" style="width:180px;height:130px;object-fit:cover;margin:6px;border:1px solid #ddd;border-radius:8px">`).join('');
  const rows=Object.entries(x).filter(([k])=>!['photos','closurePhotos'].includes(k)).map(([k,v])=>`<tr><th>${escH(k)}</th><td>${escH(typeof v==='object'?JSON.stringify(v):v)}</td></tr>`).join('');
  res.send(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Rapport QHSE</title><style>body{font-family:Arial;margin:35px;color:#172033}h1{color:#174d7b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:9px;text-align:left}th{width:30%;background:#f3f6fa}.photos{margin-top:20px}@media print{button{display:none}}</style><h1>Rapport QHSE — ${escH(req.params.name)} #${escH(x.id)}</h1><p>Généré le ${new Date().toLocaleString('fr-FR')}</p><table>${rows}</table><div class="photos"><h2>Preuves photographiques</h2>${photos||'<p>Aucune photo.</p>'}</div><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></html>`);
});

app.use((req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
save();app.listen(PORT,()=>console.log(`QHSEFlow V6 : http://localhost:${PORT}`));
