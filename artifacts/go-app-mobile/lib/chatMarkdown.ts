export type ChatSegment={text:string;style:"plain"|"bold"|"italic"|"code"|"link";href?:string};
export type ChatLine={kind:"text"|"heading"|"bullet"|"quote"|"code";segments:ChatSegment[]};

function inline(text:string):ChatSegment[]{
  const result:ChatSegment[]=[];
  const push=(value:string,style:ChatSegment["style"],href?:string)=>{if(value)result.push({text:value,style,...(href?{href}:{})});};
  let plain="";
  for(let i=0;i<text.length;){
    const link=text.slice(i).match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
    if(link){push(plain,"plain");plain="";push(link[1],"link",link[2]);i+=link[0].length;continue;}
    const marker=["**","__","`","*","_"].find(value=>text.startsWith(value,i));
    if(marker){const end=text.indexOf(marker,i+marker.length);
      if(end>i+marker.length){push(plain,"plain");plain="";push(text.slice(i+marker.length,end),marker==="`"?"code":marker.length===2?"bold":"italic");i=end+marker.length;continue;}}
    plain+=text[i++];
  }
  push(plain,"plain");return result;
}

/** A small, local renderer for chat formatting; links are labels, never executable markup. */
export function parseChatMarkdown(value:string):ChatLine[]{
  let code=false;const lines:ChatLine[]=[];
  for(const raw of value.replace(/\r\n?/g,"\n").split("\n")){
    if(/^\s*```/.test(raw)){code=!code;continue;}
    if(code){lines.push({kind:"code",segments:[{text:raw,style:"code"}]});continue;}
    const heading=raw.match(/^\s{0,3}#{1,6}\s+(.*)$/),bullet=raw.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.*)$/),quote=raw.match(/^\s*>\s?(.*)$/);
    const kind:ChatLine["kind"]=heading?"heading":bullet?"bullet":quote?"quote":"text";
    const content=heading?.[1]??bullet?.[1]??quote?.[1]??raw;
    lines.push({kind,segments:inline((bullet?"• ":quote?"› ":"")+content)});
  }
  return lines;
}

export function chatMarkdownPlainText(value:string){return parseChatMarkdown(value).map(line=>line.segments.map(segment=>segment.text).join("")).join("\n");}
