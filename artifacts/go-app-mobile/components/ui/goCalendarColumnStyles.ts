import { StyleSheet } from "react-native";

/** Shared geometry and typography of calendar column headings. */
export const goCalendarColumnHeaderStyles=StyleSheet.create({
colHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,8,16,0.92)",
  },
compactColHeader: { paddingVertical: 0 },
compactColHeaderContent: { minHeight: 44, paddingVertical: 2, gap: 1, justifyContent: "center" },
colHeaderContent: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
colHeaderDayName: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
colHeaderDayDate: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    textAlign: "center",
  },
colCountBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
colCount: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  }
});
