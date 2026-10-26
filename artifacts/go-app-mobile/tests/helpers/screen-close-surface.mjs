import lifecycle from './react-lifecycle.cjs';
const {React,evaluate}=lifecycle;
export function screenCloseSurface(native,ownership,guide,screen={GoScreenLayerActive:React.createContext(true)}){
 const responder=evaluate('lib/calendarCloseResponder.ts',{'react-native':native,'./calendarGestureOwnership':{calendarGestureOwnership:ownership}});
 const delivery=evaluate('lib/entryDetailTouchDelivery.ts');
 const gesture=evaluate('lib/screenCloseGesture.ts',{'./calendarCloseResponder':responder,'./entryDetailTouchDelivery':delivery});
 return evaluate('components/ui/GoScreenCloseSurface.tsx',{'react-native':native,'@/lib/calendarGestureOwnership':{calendarGestureOwnership:ownership},'@/lib/screenCloseGesture':gesture,'./CalendarCloseGuide':guide,'./GoScreenModal':screen});
}
