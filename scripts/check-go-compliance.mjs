import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>JSON.parse(readFileSync(path.join(root,file),'utf8'));
const sources=read('docs/compliance/sources.v1.json'),matrix=read('docs/compliance/modules.v1.json');
const statuses=['binding-current','binding-future','official-guidance','legal-review'];
const officialHosts=['eur-lex.europa.eu','boe.es','www.boe.es','aepd.es','www.aepd.es','edpb.europa.eu','www.edpb.europa.eu','ai-act-service-desk.ec.europa.eu'];
assert.equal(matrix.version,sources.version);assert.equal(matrix.legalConclusion,'not-audited');
const ids=new Set();for(const source of sources.sources){
 assert.ok(!ids.has(source.id),'Duplicate source');ids.add(source.id);
 assert.ok(statuses.includes(source.kind));const url=new URL(source.url);
 assert.equal(url.protocol,'https:');assert.ok(officialHosts.includes(url.hostname),'Source must be primary/official');
 assert.ok(source.title&&source.articles);
}
const requirements=new Set();for(const requirement of sources.requirements){
 assert.ok(!requirements.has(requirement.id));requirements.add(requirement.id);assert.ok(statuses.includes(requirement.status));
 for(const source of requirement.sources)assert.ok(ids.has(source));
 if(requirement.status==='binding-future')assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(requirement.effectiveAt));
 // This is a documentation reminder, never a runtime switch or legal ruling.
 if(requirement.status==='binding-future'&&requirement.effectiveAt<=new Date().toISOString().slice(0,10))
  console.warn('Review dated legal requirement:',requirement.id);
}
const modules=new Set(),covered=new Set(matrix.routeExclusions);for(const module of matrix.modules){
 assert.ok(!modules.has(module.id));modules.add(module.id);assert.ok(module.purpose&&module.aiAssessment);
 for(const field of ['data','recipients','requirements','existing','added','pending','evidence'])assert.ok(Array.isArray(module[field]));
 assert.ok(module.pending.length,'No blanket legal certification');
 for(const requirement of module.requirements)assert.ok(requirements.has(requirement));
 for(const file of module.evidence){assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));assert.ok(existsSync(path.join(root,file)),'Missing evidence: '+file);covered.add(file);}
}
for(const file of readdirSync(path.join(root,'artifacts/api-server/src/routes')).filter(name=>name.endsWith('.ts')))
 assert.ok(covered.has('artifacts/api-server/src/routes/'+file),'Add a review entry for route '+file+'; a pending legal assessment is valid.');
assert.ok(existsSync(path.join(root,'docs/compliance/module-review-template.md')));
const cell=value=>String(value).replaceAll('|','/').replaceAll('\n',' ');
const text=['# Matriz GO por módulo', '',`Versión ${matrix.version} · contraste ${matrix.checkedAt} · base \`${matrix.baseSha}\`.`,
 '', '**Valoración jurídica pendiente por finalidad. No es certificado de cumplimiento.**',
 '', 'Fuentes, artículos y distinción obligación vigente/futura/directriz/asesoramiento: [sources.v1.json](sources.v1.json). Inventario original: [modules.v1.json](modules.v1.json).',
 '', 'La base jurídica y la conservación concreta de **cada fila** requieren validación humana. Los controles existentes se conservan; los nuevos evaluadores no son un interruptor global.',
 '', '| Módulo / finalidad | Datos y destinatarios | Requisitos a revisar | Evidencia técnica existente / añadida | Pendientes humanos |',
 '| --- | --- | --- | --- | --- |',
 ...matrix.modules.map(module=>'| '+[module.id+': '+module.purpose,module.data.join('; ')+' → '+module.recipients.join('; '),module.requirements.join(', '),
  'Existente: '+(module.existing.join('; ')||'no acreditada aquí')+'. Añadido: '+(module.added.join('; ')||'sin cambio funcional'),module.pending.join('; ')].map(cell).join(' | ')+' |'),
 '', '## Evaluación IA preliminar (requiere ratificación)', '',
 ...matrix.modules.map(module=>'- **'+module.id+'**: '+module.aiAssessment),
 '', '## Población y cobertura', '', matrix.audienceStatus,
 '', 'Se cubren las rutas de producto revisadas. Health y registro de rutas se excluyen del inventario de finalidades, no de las obligaciones de seguridad. GO Imprimir está en un proyecto independiente y su revisión queda pendiente.',
 '', 'Las pruebas de código son evidencia técnica, no prueba de una base jurídica, EIPD, contratación con proveedores ni validación física.', ''].join('\n');
const matrixFile=path.join(root,'docs/compliance/MATRIX.md');
if(process.argv.includes('--write-matrix'))writeFileSync(matrixFile,text);
else assert.equal(readFileSync(matrixFile,'utf8').replaceAll('\r\n','\n'),text,'Refresh matrix with node scripts/check-go-compliance.mjs --write-matrix');
console.log(`GO review inventory: ${modules.size} modules, ${sources.sources.length} official sources. Technical evidence only; no legal certification.`);
