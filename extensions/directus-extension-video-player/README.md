# Directus Extension: GCS Video Player

## Descripción

Extensión de interfaz personalizada para Directus que permite previsualizar y reproducir videos en formato MP4 (y otros formatos de video) almacenados en Google Cloud Storage a través del sistema de archivos de Directus.

## Características

- 🎬 **Reproductor de video integrado** - Reproduce videos MP4, WebM y OGG directamente en el formulario de edición
- 📁 **Integración con archivos de Directus** - Usa el sistema de archivos de Directus que se conecta a GCS
- 🎛️ **Controles configurables** - Autoplay, controles, relación de aspecto y ancho máximo
- 📊 **Metadatos del video** - Muestra duración, resolución y estado de reproducción
- 🔄 **Cambiar archivo** - Permite cambiar el video asociado al registro
- 🚫 **Manejo de errores** - Mensajes claros cuando hay problemas de carga
- 🎨 **Diseño integrado** - Usa las variables CSS del tema de Directus para un diseño consistente

## Cómo funciona

1. Los archivos de video se almacenan en Google Cloud Storage (bucket: `mined-storage`)
2. Directus actúa como **proxy** a través del endpoint `/assets/{file_id}`
3. Esta extensión obtiene la información del archivo vía la API `/files/{file_id}`
4. Si el archivo es de tipo video, lo reproduce usando el elemento HTML `<video>` nativo
5. La autenticación a GCS es manejada automáticamente por Directus

## Instalación

### Opción 1: Docker (Recomendado)

La extensión ya está configurada para copiarse al contenedor Docker:

```bash
# Rebuild del contenedor
docker-compose build
docker-compose up -d
```

### Opción 2: Desarrollo local

```bash
cd extensions/directus-extension-video-player
npm install
npm run build
```

## Configuración en Directus

1. Ve a **Settings → Data Model**
2. Selecciona la colección donde tienes el campo de archivo (ej: `class_schedules_files`)
3. Edita el campo de tipo **file** (ej: `file_id`)
4. En la sección **Interface**, cambia la interfaz a **"GCS Video Player"**
5. Configura las opciones:
   - **Autoplay**: Si el video se reproducirá automáticamente
   - **Mostrar Controles**: Si se muestran los controles del reproductor
   - **Ancho Máximo**: El ancho máximo del reproductor (ej: `100%`, `800px`)
   - **Relación de Aspecto**: La relación de aspecto del contenedor de video (16:9, 4:3, etc.)

## Opciones de configuración

| Opción | Tipo | Default | Descripción |
|--------|------|---------|-------------|
| `autoplay` | Boolean | `false` | Reproducir automáticamente al cargar |
| `showControls` | Boolean | `true` | Mostrar controles del reproductor |
| `maxWidth` | String | `100%` | Ancho máximo del contenedor |
| `aspectRatio` | String | `16/9` | Relación de aspecto del video |

## Estructura de archivos

```
directus-extension-video-player/
├── package.json          # Configuración npm y directus:extension
├── dist/
│   └── index.js          # Extensión compilada (lo que Directus carga)
├── src/
│   ├── index.js          # Entry point de la extensión
│   └── interface.vue     # Componente Vue del reproductor
└── README.md             # Este archivo
```

## Requisitos

- Directus >= 11.0.0
- Google Cloud Storage configurado como storage location en Directus
- Variables de entorno configuradas:
  - `STORAGE_LOCATIONS=gcs`
  - `STORAGE_GCS_DRIVER=gcs`
  - `STORAGE_GCS_BUCKET=mined-storage`
  - `GOOGLE_APPLICATION_CREDENTIALS=gcs.json`

## Notas técnicas

- La extensión usa la ruta `/assets/{file_id}` de Directus para servir los videos
- Directus actúa como proxy entre el navegador y Google Cloud Storage
- No se requiere acceso directo al bucket de GCS desde el navegador
- La autenticación es manejada por la sesión de Directus
