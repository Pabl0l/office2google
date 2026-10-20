# office2google

**Doble click en un archivo Office (`.docx`, `.xlsx`, `.pptx`...) → se abre en Google Docs / Sheets / Slides en tu navegador.**

```
Doble click en informe.docx
   → office2google.exe sube el archivo a tu Google Drive (carpeta "Office2Google")
   → abre docs.google.com/document/d/{id}/edit en tu navegador
```

- Tu archivo local **nunca se mueve ni se borra**: se trabaja sobre la copia de Drive.
- Si el archivo ya existe en Drive, **no se duplica**: abre el existente.
- Los **tokens** (tu sesión) se guardan solo en tu PC (`%APPDATA%\office2google\`).

**Sitio web** (landing + documentos legales, alojado gratis en Netlify):
`https://office2google.netlify.app/` · [Política de privacidad](https://office2google.netlify.app/privacidad) · [Condiciones](https://office2google.netlify.app/terminos)
— fuente en [`site/`](site/) (HTML estático, sin build).

---

## Instalación (solo quien distribuye)

### Paso 1 — Compilar el .exe

```powershell
bun install
bun run creds "C:\ruta\descargas\client_secret_xxx.json"   # embebe las credenciales de Google
bun run build                                              # genera dist\office2google.exe
```

`bun run creds` escribe `src/client_credentials.ts` (generado, no editar a mano). Si no lo
ejecutas, la app en su lugar busca un `client_secret.json` junto al exe, o las credenciales
guardadas con `office2google setup` (cualquiera de las tres funciona).

### Paso 2 — Asociar el doble click

```powershell
.\install.bat
```

Copia el exe a `%LOCALAPPDATA%\Programs\office2google` (ruta estable, no depende de esta
carpeta) y asocia las 9 extensiones Office. No requiere administrador.

Listo. Doble click en cualquier `.docx`/`.xlsx`/`.pptx` → se abre en el navegador de Google.

> Si recompilas, vuelve a ejecutar `install.bat` para refrescar la copia instalada.

---

## Distribuir a otro usuario

**El usuario no necesita Google Cloud Console, ni credenciales, ni `setup`.** Solo su cuenta de Google.

**Paquete** (carpeta o zip) con:

| Archivo | Necesario |
|---|---|
| `office2google.exe` | sí |
| `install.bat` + `install.ps1` | sí |
| `client_secret.json` | solo si **no** embebiste las credenciales con `bun run creds` |

**El usuario hace 2 clics:**

1. Doble click en **`install.bat`** → copia el exe a su usuario y asocia las extensiones.
2. Doble click en su `.docx` → se abre Google → **Acceder con su cuenta** → listo.

La primera vez aparece la pantalla de consentimiento de Google (una sola vez); después la
sesión se renueva sola. Cada persona tiene sus tokens en su `%APPDATA%\office2google\` y su
propia carpeta "Office2Google" en Drive, aislados de los demás.

> **Requisito en la consola de Google (una sola vez, quien distribuya):** la pantalla de
> consentimiento debe estar en estado **"En producción"**. En estado "Testing" solo
> autorizarán los correos añadidos a *Usuarios de prueba* → error `403 access_denied`.

---

## Credenciales de Google (solo quien distribuye, una sola vez, ~10 min)

Google no permite automatizar Drive sin credenciales OAuth. Se crean gratis:

1. Entra a [console.cloud.google.com](https://console.cloud.google.com/) con la cuenta que
   **posea la app** (recomendado: una cuenta dedicada, no tu personal, para que la app no
   dependa de ti).
2. **Crear proyecto** (arriba, selector de proyectos) → nombre libre → Crear.
3. Habilita la API: menú ☰ → *APIs y servicios* → *Biblioteca* → busca **Google Drive API** → *Habilitar*.
4. Pantalla de consentimiento: *APIs y servicios* → *Pantalla de consentimiento OAuth* →
   - Tipo de usuario: **Externo** → Crear.
   - Nombre de la app + correo de soporte → Guardar y continuar.
   - Scopes: agregar `https://www.googleapis.com/auth/drive.file` → Guardar y continuar.
   - Al terminar, pulsa **Publicar app** (estado *En producción*) → ahora cualquier
     cuenta de Google podrá autorizar.
5. Credenciales: *APIs y servicios* → *Credenciales* → *Crear credenciales* → *ID de cliente OAuth* →
   Tipo de aplicación: **Aplicación de escritorio** → Crear → **Descargar JSON**.
6. Embeberlas y verificar:

```powershell
bun run creds "C:\ruta\descargas\client_secret_xxx.json"
bun run build
.\dist\office2google.exe status    # debe decir: Cliente OAuth: embebido ✓
```

---

## Desinstalar / revertir a Office

```powershell
.\uninstall.bat
```

Restaura tus asociaciones originales (respalda y devuelve la elección de Windows que había antes).

## Comandos

| Comando | Qué hace |
|---|---|
| `office2google <archivo>` | Abre el archivo en su editor de Google |
| `office2google setup <json>` | Usa credenciales propias (opcional: por defecto van embebidas) |
| `office2google auth` | (Re)hace login con Google |
| `office2google status` | Diagnóstico de configuración (muestra de dónde salen las credenciales) |

## Solución de problemas

- **"Falta el cliente de Google"** → coloca `client_secret.json` junto al exe o ejecuta `office2google setup <json>`.
- **`403 access_denied`** → la pantalla de consentimiento sigue en *Testing*: publícala (ver *Credenciales de Google*).
- **Windows pregunta "¿con qué app abrirlo?"** → elige *office2google* y marca *Siempre* (Windows a veces re-evalúa tras cambios de registro).
- **¿Cómo revocar el acceso?** → [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → *office2google* → *Quitar acceso*.
- **Logs** → `%APPDATA%\office2google\office2google.log`

## Formatos soportados

`.docx` `.doc` `.docm` → Google Docs · `.xlsx` `.xls` `.xlsm` → Google Sheets · `.pptx` `.ppt` `.pptm` → Google Slides

## Desarrollo

```powershell
bun test           # 52 tests
bun run typecheck  # TypeScript estricto
bun run creds <client_secret.json>   # embeber credenciales
bun run dev -- archivo.docx
```
