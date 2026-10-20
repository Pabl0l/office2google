# Verificación de la app OAuth de Google — dossier

Estado: **pendiente de que el usuario (B) ejecute los pasos de consola** y de subir el video.

Datos de la app
| Campo | Valor |
|---|---|
| Nombre en la pantalla de consentimiento | `Office2Google` |
| Proyecto | `promising-howl-512015-d5` |
| Tipo de cliente OAuth | **Desktop app** (app instalada) |
| Scope solicitado | `https://www.googleapis.com/auth/drive.file` (único) |
| Publicación | External + In production |
| Sitio | `https://office2google.netlify.app/` |
| Política de privacidad | `https://office2google.netlify.app/privacidad` |
| Condiciones | `https://office2google.netlify.app/terminos` |

---

## 1. Bloqueante previo: dominio propio

Google exige que el dominio de la *homepage* esté **verificado en Google Search Console**.
`*.netlify.app` es un dominio compartido de Netlify y **no se acepta como dominio propio**.

Camino mínimo:

1. Comprar un dominio (p. ej. `office2google.app`) — Cloudflare Registrar lo vende a coste,
   Namecheap/Porkbun ~10-15 USD/año.
2. En Netlify: *Add new site* → *Add a domain you already own* → apuntar el dominio.
   Netlify muestra los registros DNS a crear.
3. En el registrador: crear los registros que indique Netlify (A/AAAA + CNAME de `www`).
   En Netlify: *Domain settings* → *Verify DNS configuration* (SSL automático).
4. En [search.google.com/search-console](https://search.google.com/search-console) → *Add property*
   → tipo **Domain** → añadir el TXT de Search Console en el DNS del registrador → verificar.
5. En *Google Auth Platform → Branding* → **Authorized domains** → añadir el dominio.
   Google Console: [console.cloud.google.com/auth/branding?project=promising-howl-512015-d5](https://console.cloud.google.com/auth/branding?project=promising-howl-512015-d5)

Sin esto, la app puede publicarse en producción pero **no se verifica**: cada usuario ve el
aviso "Google no ha verificado esta app" y hay un **tope de 100 usuarios**.

## 2. Grabación (screencast)

Archivo a generar en `C:\Users\jpom1\Desktop\office2google-demo\grabacion-oficial.mp4`.

Guion de la grabación:

| # | Qué se ve |
|---|---|
| 1 | Explorer con `verificacion-office2google.xlsx` (archivo de prueba sintético, sin datos reales) |
| 2 | Doble click → consola de `office2google` → subida a Drive |
| 3 | Google Sheets abre el archivo (compatibilidad) |
| 4 | `office2google auth` → **pantalla de consentimiento** de Google |
| 5 | Usuario acepta → "Listo ✅" |

**Requisito para el paso 4**: el navegador con el que se abre el consentimiento **debe tener
sesión de Google iniciada** (Chrome o Firefox). Si no hay sesión, Google muestra
*"Inicia sesión: Cuentas de Google"* y no aparece la pantalla de consentimiento.

Para el formulario de Google hay que subirlo y dar un enlace accesible:

- **YouTube** → subir como *oculto* (unlisted) → copiar URL.
- o **Google Drive** → subir → *Compartir* → *Cualquier persona con el enlace* → copiar URL.

### Capturas de apoyo

- `win-sheets.png` — el archivo de prueba ya abierto en Google Sheets (a: `docs.google.com/spreadsheets/d/...`).
- `win-consent.png` — la pantalla de consentimiento de Google (a: capturar cuando aparezca).

## 2 bis. Nota sobre el archivo de prueba

El `.xlsx` de la demo **debe ser un archivo real de Office** (generado con Excel), no un
`.xlsx` "de facto" creado a mano: Drive lo acepta pero **el importador de Google no lo
puede representar** y muestra *"No se ha podido abrir el archivo"*. La app no tiene nada
que ver en esto (sube el binario tal cual); es una limitación del conversor de Google que
afecta a cualquier `.xlsx` mal formado.

## 3. Texto para el formulario de verificación

### Descripción de la app

> Office2Google es una aplicación de escritorio para Windows. Al hacer doble clic sobre un
> archivo `.docx`, `.xlsx` o `.pptx`, la app sube una copia del archivo a la carpeta
> "Office2Google" de tu propio Google Drive y abre esa copia en Google Docs, Google Sheets o
> Google Slides, en el navegador. El archivo local nunca se mueve ni se borra. La aplicación se
> distribuye como un único ejecutable y no tiene servidores, backend ni base de datos: todo
> ocurre en el equipo del usuario.

### Cómo se usan las APIs de Google

> La app usa **únicamente** la API de Google Drive, con el alcance `drive.file`.
>
> 1. **Autenticación**: OAuth 2.0 con PKCE (S256) y redirección a `127.0.0.1`. La app pide
>    consentimiento y Google le devuelve un *access token* y un *refresh token*, que se guardan
>    **solo en el ordenador del usuario** (`%APPDATA%\office2google\config.json`).
> 2. **Dedupe**: antes de subir, la app lista los archivos de la carpeta "Office2Google"
>    (creada por la propia app) buscando uno con el mismo nombre. Si existe, lo abre y no
>    vuelve a subirlo. Esta consulta solo ve los archivos creados por esta app, gracias a
>    `drive.file`.
> 3. **Subida**: si no existe, la app sube una copia del archivo con la API de archivos de
>    Drive (`files.create`, carga multipart) a esa carpeta.
> 4. **Apertura**: la app genera la URL del editor (`docs.google.com/document|spreadsheets|
>    presentation/d/{id}/edit`) y la abre en el navegador del usuario. No se hacen más llamadas
>    a la API.
>
> No hay analítica, ni telemetría, ni publicidad, ni uso de los datos para entrenar modelos de IA.
> La app no tiene servidor: no envía datos a ningún servicio propio.

### Por qué `drive.file` es el alcance mínimo y suficiente

> La app solo necesita leer y escribir **los archivos que ella misma crea** (las copias de
> Office que sube y la carpeta "Office2Google"). Con `drive.file`:
>
> - No puede leer, modificar ni enumerar **ningún otro archivo** de tu Drive.
> - No ve tus correos, contactos, calendario ni otros datos de Google.
> - El único dato ajeno a la app que se consulta es el **nombre del archivo** que el usuario
>   abre, para poder reutilizar una copia existente en lugar de duplicarla.
>
> Un alcance más amplio (`drive`, `drive.readonly`, `userinfo.email`…) daría acceso a datos que
> la app no utiliza en ningún caso, por lo que `drive.file` es estrictamente superior aquí.

### Cómo reproducirlo

> 1. Instalar `office2google.exe` (Windows, sin instalación, sin privilegios de administrador).
> 2. Ejecutar `office2google auth` → se abre el consentimiento de Google → pulsar **Permitir**.
> 3. Hacer doble clic en cualquier archivo `.docx`/`.xlsx`/`.pptx`.
> 4. El archivo se sube a la carpeta "Office2Google" del Drive y se abre en el editor de Google.
>
> En el vídeo se ve exactamente este flujo, incluida la pantalla de consentimiento con el
> alcance solicitado.

### Otros datos

- **Audiencia**: cualquier persona con una cuenta de Google (aplicación externa, publicada).
- **No usa datos de usuarios de forma prohibida**: no hay venta, cesión ni perfilado.
- **Política de privacidad**: `https://office2google.netlify.app/privacidad`
  (documenta el alcance, la finalidad, el almacenamiento local y la ausencia de IA).
- **Términos**: `https://office2google.netlify.app/terminos`
- **Código fuente**: repositorio público en GitHub (enlazar la URL real al enviar).

## 4. Nota operativa

Mientras la app no esté verificada, en estado *In production* + *Unverified*:
- el usuario ve el aviso "Google hasn't verified this app",
- el nombre y el logo **no** aparecen en la pantalla de consentimiento (solo el dominio),
- hay un **tope de 100 usuarios** en total.

Aun así **funciona**: el usuario solo tiene que entrar con su cuenta y aceptar.
