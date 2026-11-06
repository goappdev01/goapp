import React from "react";
import { TouchableOpacity, Text, View, useWindowDimensions } from "react-native";

export function ListadosProposalActions({ handedness, onAccept, onPropose, onReject, labels }: {
  handedness: "left" | "right"; onAccept: () => void; onPropose: () => void; onReject: () => void;
  labels: { accept: string; propose: string; reject: string };
}) {
  const { fontScale } = useWindowDimensions();
  const actions = [
    { key: "reject", label: labels.reject, color: "#fca5a5", onPress: onReject },
    { key: "propose", label: labels.propose, color: "#fdba74", onPress: onPropose },
    { key: "accept", label: labels.accept, color: "#86efac", onPress: onAccept },
  ];
  if (handedness === "left") actions.reverse();
  return <View testID="list-proposal-actions" style={{flexDirection:"row",flexWrap:"wrap",gap:4,marginTop:6}}>
    {actions.map(action => <TouchableOpacity key={action.key} testID={"list-proposal-"+action.key}
      accessibilityRole="button" accessibilityLabel={action.label} onPress={event=>{event.stopPropagation();action.onPress();}}
      style={{flexGrow:1,flexBasis:Math.ceil(80*Math.max(1,fontScale)),maxWidth:"100%",minHeight:44,paddingHorizontal:5,paddingVertical:8,borderRadius:9,
        borderWidth:1,borderColor:action.color+"66",backgroundColor:action.color+"12",alignItems:"center",justifyContent:"center"}}>
      <Text style={{color:action.color,fontSize:11,fontWeight:"800",textAlign:"center"}}>{action.label.toUpperCase()}</Text>
    </TouchableOpacity>)}
  </View>;
}
