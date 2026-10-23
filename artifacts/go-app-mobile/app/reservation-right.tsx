import React from "react";
import {useRouter} from "expo-router";
import {ReservationVerificationPanel} from "@/components/booking/ReservationVerificationPanel";
export default function ReservationRight(){const router=useRouter();return <ReservationVerificationPanel onClose={()=>router.canGoBack()?router.back():router.replace("/")}/>;}
