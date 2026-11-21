export type ShoppingShortcutText = {search:number;lists:number;searchWord:number;listWord:number};

/** Conservative first frame only; native Text measurements replace these values. */
export function initialShoppingShortcutText(fontScale:number):ShoppingShortcutText{
  const glyph=13*.65*fontScale;
  return {search:16*glyph,lists:10*glyph,searchWord:9*glyph,listWord:6*glyph};
}

export type ShoppingLandingText=ShoppingShortcutText&{actionList:number;actionAdd:number};
export function initialShoppingLandingText(fontScale:number):ShoppingLandingText{
  return {...initialShoppingShortcutText(fontScale),actionList:5*14*.65*fontScale,actionAdd:6*14*.65*fontScale};
}

/** Two full-width rows. Move icons above labels before squeezing their words. */
export function shoppingLandingRows(width:number,text:ShoppingLandingText){
  const half=Math.max(44,(width-5)/2),shortcutIconAbove=Math.max(text.searchWord,text.listWord)+35>half;
  const decoration=shortcutIconAbove?12:35;
  const actionWidth=Math.max(44,(width-68-14)/2);
  return {shortcutIconAbove,searchLines:text.search+decoration<=half?1:2,
    listLines:text.lists+decoration<=half?1:2,
    actionsIconAbove:Math.max(text.actionList,text.actionAdd)+21+5+16>actionWidth};
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

/** Thumb arc within the nearest 70% of the measured container; large type relaxes the arc. */
export function shoppingThumbMenu(availableWidth:number,fontScale:number,handedness:"left"|"right"){
  const available=Math.max(0,availableWidth),reach=available*.7,width=Math.min(reach,Math.max(168,168*fontScale));
  const travel=Math.max(0,reach-width);
  const positions=[1,.6,.2,0];
  return {width,offsets:positions.map(position=>handedness==="left"?travel*(1-position):available-reach+travel*position)};
}
