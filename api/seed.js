const path=require('path'),fs=require('fs');
module.exports=async function(req,res){
  const q=(req.query||{});
  if(q.secret!=='mb-admin-seed-2024') return res.status(403).json({error:'Forbidden'});
  const info={cwd:process.cwd(),dirname:__dirname,nodeVer:process.version};
  try{
    const dp=path.join(process.cwd(),'data','employees.json');
    info.dataPathExists=fs.existsSync(dp);
    info.dataDir=fs.existsSync(path.join(process.cwd(),'data'))?fs.readdirSync(path.join(process.cwd(),'data')).join(','):'no data dir';
    if(info.dataPathExists){const raw=fs.readFileSync(dp,'utf8');const emp=JSON.parse(raw);info.empCount=emp.length;info.first=emp[0]&&emp[0].emp_code;}
  }catch(e){info.fileError=e.message;}
  try{
    const {createClient}=require('@libsql/client');
    const envKeys=Object.keys(process.env).filter(k=>k.includes('TURSO')||k.includes('DATABASE')||k.includes('LIBSQL'));
    info.envKeys=envKeys;
    info.dbUrl=process.env.TURSO_DATABASE_URL||process.env.TURSO_URL||process.env.DATABASE_URL||'NOT_FOUND';
  }catch(e){info.dbModErr=e.message;}
  return res.json(info);
};