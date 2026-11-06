'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const PROVIDER_SHA='3d5dd37f2b8b1a53dc2059d4ff4b319486e5e2eb87a20f38b686661058ae7dda';
const runtime='D:/GO-Recuperacion-20261028-0800/versiones/20261030-482dad1/runtime/admin-business-registration-20261103';
const activeRoot='D:/GO-Recuperacion-20261028-0800/phone-fixture';
function patchProvider(source){
 const oldIssuer="const anon=sign({role:'anon',exp:Math.floor(Date.now()/1000)+86400});";
 const oldHeader="Authorization:req.headers.authorization??'Bearer '+anon";
 if(source.split(oldIssuer).length!==2||source.split(oldHeader).length!==2)throw Error('Provider differs from reviewed source; stop.');
 return source.replace(oldIssuer,"const {createAnonymousAuthorization}=require('./anonymous-authorization.cjs');\nconst authorizationFor=createAnonymousAuthorization({issueToken:sign});")
  .replace(oldHeader,'Authorization:authorizationFor(req.headers.authorization)');
}
function apply(){
 const provider=path.join(runtime,'provider.cjs'),provenancePath=path.join(runtime,'provenance.json');
 const original=fs.readFileSync(provider),provenanceBytes=fs.readFileSync(provenancePath),provenance=JSON.parse(provenanceBytes);
 if(hash(original)!==PROVIDER_SHA||provenance.productCodeChanged!==false||provenance.databaseChanged!==false||provenance.files.length!==2)throw Error('Unexpected provider/provenance.');
 for(const file of provenance.files)if(hash(fs.readFileSync(file.active))!==file.activeSha256||hash(fs.readFileSync(file.repair))!==file.repairSha256)throw Error('Preserved bridge integrity mismatch.');
 const item=provenance.files.find(file=>path.resolve(file.repair)===path.resolve(provider));if(!item)throw Error('Missing provider provenance.');
 const next=Buffer.from(patchProvider(original.toString('utf8'))),helper=fs.readFileSync(path.join(__dirname,'anonymous-authorization.cjs'));
 // The unchanged preload compiles at the ORIGINAL filename. Its relative require
 // resolves inside phone-fixture, not the overlay directory. Verify both copies.
 const helperPaths=[path.join(activeRoot,'anonymous-authorization.cjs'),path.join(runtime,'anonymous-authorization.cjs')];
 if(helperPaths.some(file=>fs.existsSync(file)))throw Error('Helper already exists; inspect before replacing.');
 const backup=path.join(runtime,'jwt-renewal-backup-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(backup);
 fs.writeFileSync(path.join(backup,'provider.cjs'),original,{flag:'wx'});fs.writeFileSync(path.join(backup,'provenance.json'),provenanceBytes,{flag:'wx'});
 const preload=fs.readFileSync(path.join(runtime,'registration-preload.cjs'));
 const record={before:hash(original),after:hash(next),helper:hash(helper),preload:hash(preload),backup,createdAt:new Date().toISOString(),databaseChanged:false};
 fs.writeFileSync(path.join(backup,'repair-proof.json'),JSON.stringify(record,null,2),{flag:'wx'});
 try{
  for(const file of helperPaths)fs.writeFileSync(file,helper,{flag:'wx'});
  fs.writeFileSync(provider,next);item.repairSha256=hash(next);
  // Update the expected digest for the reviewed change; leave verification code,
  // original-file hashes and the identity/finance overlay entry unchanged.
  fs.writeFileSync(provenancePath,JSON.stringify(provenance,null,2));
  for(const file of provenance.files)if(hash(fs.readFileSync(file.active))!==file.activeSha256||hash(fs.readFileSync(file.repair))!==file.repairSha256)throw Error('Post-write integrity mismatch.');
  if(hash(fs.readFileSync(path.join(runtime,'registration-preload.cjs')))!==record.preload||helperPaths.some(file=>hash(fs.readFileSync(file))!==record.helper))throw Error('Preload/helper mismatch.');
 }catch(error){fs.writeFileSync(provider,original);fs.writeFileSync(provenancePath,provenanceBytes);throw error;}
 console.log(JSON.stringify(record));
}
module.exports={patchProvider};
if(require.main===module){if(process.argv[2]!=='--apply-reviewed-local-provider')throw Error('Explicit reviewed local-provider opt-in required.');apply();}
