import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/** Two committed slots keep photo bytes out of Android's small AsyncStorage rows.
 * The small pointer changes only after the other durable document file is written.
 * No unrelated GO key/file is ever read or removed. The server remains authoritative.
 */
export const boardsCache = {
  async getItem(key: string): Promise<string | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null || !raw.startsWith("go-board-slot:")) return raw;
    const root = FileSystem.documentDirectory;
    if (!root || !/^go_boards_v1:ADMIN:[0-9a-f-]{36}$/i.test(key)) throw new Error("Caché de Tableros no disponible.");
    const slot = raw.slice("go-board-slot:".length); if (slot !== "0" && slot !== "1") throw new Error("Caché de Tableros inválida.");
    return FileSystem.readAsStringAsync(`${root}go-boards/${encodeURIComponent(key)}.${slot}.json`);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web" || !FileSystem.documentDirectory) { await AsyncStorage.setItem(key, value); return; }
    if (!/^go_boards_v1:ADMIN:[0-9a-f-]{36}$/i.test(key)) throw new Error("Ámbito de Tableros inválido.");
    const previous = await AsyncStorage.getItem(key), slot = previous === "go-board-slot:0" ? "1" : "0";
    const directory = `${FileSystem.documentDirectory}go-boards/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.writeAsStringAsync(`${directory}${encodeURIComponent(key)}.${slot}.json`, value);
    await AsyncStorage.setItem(key, `go-board-slot:${slot}`);
  },
};
