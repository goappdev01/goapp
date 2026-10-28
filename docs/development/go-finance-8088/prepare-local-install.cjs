'use strict';
// Development activation only; never use against hosted Supabase/production.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..');
function body(file){return fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n').replace(/^begin;\n/m,'').replace(/\ncommit;\s*$/,'\n');}
function prepare(){
 let schema=body(path.join(root,'artifacts/api-server/supabase/drafts/financial_plans.sql'));
 const reference=' references public.admin_memberships(user_id)';
 if(schema.split(reference).length-1!==2)throw Error('Review changed membership references before using this development installer');
 // PostgreSQL cannot reference the existing request-scoped authorization VIEW.
 // Production retains both FKs. The unchanged RPCs still verify live membership/ACL.
 schema=schema.split(reference).join('');
 const membership=body(path.join(__dirname,'isolated-finance-membership.sql'));
 return 'begin;\ndo $$ begin\n'+
  " if current_database()<>'go_peluquerias_github_20261023' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>65439 then raise exception 'Not the approved isolated database'; end if;\n"+
  " if to_regnamespace('go_finance_private') is not null then raise exception 'Finance schema already exists; preserve existing work'; end if;\n"+
  " if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;\n"+
  'end $$;\n'+membership+schema+'\ncommit;\n';
}
if(require.main===module){const output=process.argv[2];if(!output||!path.isAbsolute(output))throw Error('Specify a new absolute output SQL path');fs.writeFileSync(output,prepare(),{flag:'wx'});console.log('Guarded local-only activation prepared; not executed.');}
module.exports={prepare};
