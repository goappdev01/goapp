import Papa from "papaparse";
/** Only market import files. Never executes formulas, fetches URLs or infers missing numbers. */
export function parseFinancialImportText(text:string,fileName:string):unknown {
 if(text.length>20*1024*1024)throw new Error("Archivo demasiado grande (máximo 20 MB).");
 if(fileName.toLowerCase().endsWith(".json")){try{return JSON.parse(text.replace(/^\uFEFF/,""));}catch{throw new Error("El archivo JSON no tiene un formato válido.");}}
 if(!fileName.toLowerCase().endsWith(".csv"))throw new Error("Selecciona un archivo JSON o CSV de mercados.");
 const parsed=Papa.parse<Record<string,string>>(text,{header:true,skipEmptyLines:"greedy"});
 if(parsed.errors.length)throw new Error("CSV inválido: revisa columnas, separadores y comillas.");
 if(parsed.data.length>25000)throw new Error("La importación admite como máximo 25000 filas.");
 const rows=parsed.data.map((row,index)=>{
  const {schemaVersion,...fields}=row;if(schemaVersion!=="go-finance-market/1")throw new Error("Versión CSV no compatible en fila "+(index+2));
  if(fields.companies!==""&&!/^\d+(?:\.\d+)?$/.test(fields.companies))throw new Error("Cantidad ambigua en fila "+(index+2)+": usa número sin separadores de miles o vacío.");
  if(!/^\d{4}$/.test(fields.referenceYear))throw new Error("Año inválido en fila "+(index+2));
  return {...fields,companies:fields.companies===""?null:Number(fields.companies),referenceYear:Number(fields.referenceYear)};
 });
 return {schemaVersion:"go-finance-market/1",rows};
}
