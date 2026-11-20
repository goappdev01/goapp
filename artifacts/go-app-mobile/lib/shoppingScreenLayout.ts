export type ShoppingShortcutText = {search:number;lists:number;searchWord:number;listWord:number};

/** Conservative first frame only; native Text measurements replace these values. */
export function initialShoppingShortcutText(fontScale:number):ShoppingShortcutText{
  const glyph=13*.65*fontScale;
  return {search:16*glyph,lists:10*glyph,searchWord:9*glyph,listWord:6*glyph};
}

/** Reserve the existing icon, padding and gap, then keep complete words legible. */
export function shoppingShortcutLayout(width:number,text:ShoppingShortcutText){
  const decoration=18+5+12,half=Math.max(0,(width-8)/2);
  const columns=Math.max(text.searchWord,text.listWord)+decoration<=half?2:1;
  const buttonWidth=columns===2?half:width;
  return {columns,searchLines:text.search+decoration<=buttonWidth?1:2,
    listLines:text.lists+decoration<=buttonWidth?1:2};
}

type Rect={x:number;y:number;width:number;height:number};
/** Scroll content outside its native viewport must not obstruct the floating dock. */
export function clipShoppingContent(content:Rect,viewport:Rect):Rect{
  const x=Math.max(content.x,viewport.x),y=Math.max(content.y,viewport.y);
  return {x,y,width:Math.max(0,Math.min(content.x+content.width,viewport.x+viewport.width)-x),
    height:Math.max(0,Math.min(content.y+content.height,viewport.y+viewport.height)-y)};
}
