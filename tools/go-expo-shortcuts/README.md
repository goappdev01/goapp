# Accesos GO Expo en Windows

`Start-GO-Expo.ps1` es el origen versionado del lanzador de los accesos **GO Expo 8088** y **GO Comprobar 8089**. Los `.lnk` del escritorio y la copia de ejecución del script se crean localmente en el PC; Git no los instala por sí solo.

- **8088:** usa la copia de fábrica en `main`. Si el puerto está libre y la copia no tiene cambios seguidos por Git, trae `origin/main` y avanza solo en fast forward antes de iniciar Expo. Si ya sirve el checkout y commit correctos, comprueba por HTTP el manifiesto y bundle iOS y reutiliza el proceso.
- **8089:** lee el SHA fijado en `owner-expo.json`. Exige el mismo worktree, commit y ausencia de cambios locales; nunca cambia de versión, instala dependencias ni detiene otro proceso.

Cada acceso debe abrir PowerShell con `-NoExit` y pasar `-Port`, `-Workspace` y, para 8089, `-OwnerExpoState`. La opción `-CheckOnly` realiza el preflight sin iniciar Metro. El script rechaza un puerto ocupado que no pueda verificar como el checkout esperado.
