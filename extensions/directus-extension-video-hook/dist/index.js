const VIDEO_EXTENSIONS = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".ogg": "video/ogg",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".m4v": "video/mp4",
    ".flv": "video/x-flv",
    ".wmv": "video/x-ms-wmv",
    ".ts": "video/mp2t",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".wma": "audio/x-ms-wma",
    ".opus": "audio/opus"
};

function getVideoMimeType(filename) {
    if (!filename) return null;
    const lower = filename.toLowerCase();
    for (const [ext, mime] of Object.entries(VIDEO_EXTENSIONS)) {
        if (lower.endsWith(ext)) return mime;
    }
    return null;
}

export default ({ filter, action }, { services, database, getSchema, logger }) => {

    // Filter: Correct MIME type BEFORE the file is saved
    filter("files.upload", async (payload) => {
        const filename = payload.filename_download || "";
        const currentType = payload.type || "";

        if (currentType === "application/octet-stream" || currentType === "application/binary" || !currentType) {
            const videoMime = getVideoMimeType(filename);
            if (videoMime) {
                logger.info("[video-hook] Correcting MIME type for \"" + filename + "\": " + currentType + " -> " + videoMime);
                payload.type = videoMime;
            }
        }

        return payload;
    });

    // Action: Log after file is uploaded
    action("files.upload", async ({ key, payload }) => {
        const filename = (payload && payload.filename_download) || "";
        const type = (payload && payload.type) || "";
        if (type.startsWith("video/") || getVideoMimeType(filename)) {
            logger.info("[video-hook] Video file uploaded: " + filename + " (" + key + ")");
        }
    });
};
