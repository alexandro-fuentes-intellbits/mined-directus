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
    ".ts": "video/mp2t"
};

function getVideoMimeType(filename) {
    if (!filename) return null;
    const lower = filename.toLowerCase();
    for (const [ext, mime] of Object.entries(VIDEO_EXTENSIONS)) {
        if (lower.endsWith(ext)) return mime;
    }
    return null;
}

export default (router, { services, database, getSchema, logger }) => {
    const { FilesService } = services;

    // POST /video-fix/fix-mime-types
    router.post("/fix-mime-types", async (req, res) => {
        try {
            if (!req.accountability || !req.accountability.admin) {
                return res.status(403).json({ error: "Admin access required" });
            }

            const files = await database("directus_files")
                .whereIn("type", ["application/octet-stream", "application/binary"])
                .select("id", "filename_download", "type");

            const fixed = [];
            const skipped = [];

            for (const file of files) {
                const videoMime = getVideoMimeType(file.filename_download);
                if (videoMime) {
                    await database("directus_files")
                        .where("id", file.id)
                        .update({ type: videoMime });

                    fixed.push({
                        id: file.id,
                        filename: file.filename_download,
                        oldType: file.type,
                        newType: videoMime
                    });

                    logger.info("[video-fix] Fixed: " + file.filename_download + " -> " + videoMime);
                } else {
                    skipped.push({
                        id: file.id,
                        filename: file.filename_download,
                        type: file.type
                    });
                }
            }

            res.json({
                success: true,
                message: "Fixed " + fixed.length + " files, skipped " + skipped.length + " non-video files",
                fixed: fixed,
                skipped: skipped
            });
        } catch (error) {
            logger.error("[video-fix] Error:", error);
            res.status(500).json({ error: "Failed to fix MIME types", details: error.message });
        }
    });

    // GET /video-fix/status
    router.get("/status", async (req, res) => {
        try {
            if (!req.accountability || !req.accountability.admin) {
                return res.status(403).json({ error: "Admin access required" });
            }

            const files = await database("directus_files")
                .whereIn("type", ["application/octet-stream", "application/binary"])
                .select("id", "filename_download", "type");

            const videoFiles = files.filter(f => getVideoMimeType(f.filename_download));
            const otherFiles = files.filter(f => !getVideoMimeType(f.filename_download));

            res.json({
                totalGenericMimeFiles: files.length,
                videoFilesToFix: videoFiles.length,
                otherFiles: otherFiles.length,
                videoDetails: videoFiles.map(f => ({
                    id: f.id,
                    filename: f.filename_download,
                    currentType: f.type,
                    suggestedType: getVideoMimeType(f.filename_download)
                }))
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
};
