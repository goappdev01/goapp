# Accesos GO Expo en Windows

`Start-GO-Expo.ps1` es el origen versionado del lanzador de los accesos **GO Expo 8088** y **GO Comprobar 8089**. Los `.lnk` del escritorio y la copia de ejecución del script se crean localmente en el PC; Git no los instala por sí solo.

- **8088:** usa la copia de fábrica en `main`. Si el puerto está libre y la copia no tiene cambios seguidos por Git, trae `origin/main` y avanza solo en fast forward antes de iniciar Expo. Si ya sirve el checkout y commit correctos, comprueba por HTTP el manifiesto y bundle iOS y reutiliza el proceso.
- **8089:** utiliza un worktree y una instalación Expo independientes. Solo acepta un commit publicado en MAIN después de verificar el bundle iOS de 8088 y su mapa de fuentes. Si 8089 ya está activo, deja la versión nueva pendiente. Con el puerto libre, comprueba la copia, la arranca, verifica el bundle y conserva el commit anterior para revertir si falla. No instala dependencias ni sustituye archivos locales modificados.

Cada acceso debe abrir PowerShell con `-NoExit` y pasar `-Port`, `-Workspace` y, para 8089, `-OwnerExpoState`, `-BridgeHome`, `-BridgePython` y `-MainWorkspace`. La opción `-CheckOnly` realiza el preflight sin iniciar Metro. El script rechaza un puerto ocupado que no pueda verificar como el checkout esperado. Los dos puertos comparten API, autenticación y base de datos: la separación del código no separa los datos de prueba.
