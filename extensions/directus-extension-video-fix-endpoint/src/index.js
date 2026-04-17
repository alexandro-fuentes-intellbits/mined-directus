import { defineEndpoint } from '@directus/extensions-sdk';

const VIDEO_EXTENSIONS = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.m4v': 'video/mp4',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
    '.ts': 'video/mp2t',
};

const FLOW_TRIGGER_URL = process.env.PLAIN_WEBHOOK_FORWARD_URL || 'http://35.231.128.236:8055/flows/trigger/a6d766c8-6ada-4be1-9b9f-2f8aed9cb0b8';

async function readRawBody(req) {
    return await new Promise((resolve, reject) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function isEmptyPlainObject(value) {
    return isPlainObject(value) && Object.keys(value).length === 0;
}

function parseFromText(rawText) {
    const text = String(rawText ?? '');
    const trimmed = text.trim();
    if (!trimmed) return { text: '' };
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return { text };
        }
    }
    return { text };
}

function getVideoMimeType(filename) {
    if (!filename) return null;
    const lower = filename.toLowerCase();
    for (const [ext, mime] of Object.entries(VIDEO_EXTENSIONS)) {
        if (lower.endsWith(ext)) return mime;
    }
    return null;
}

export default defineEndpoint((router, { services, database, getSchema, logger }) => {
    const { FilesService } = services;

    // POST /video-fix/fix-mime-types
    // Fixes all existing files with application/octet-stream that are actually videos
    router.post('/fix-mime-types', async (req, res) => {
        try {
            // Require admin authentication
            if (!req.accountability || !req.accountability.admin) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const schema = await getSchema();
            const filesService = new FilesService({
                schema,
                accountability: req.accountability,
            });

            // Find all files with generic MIME types
            const files = await database('directus_files')
                .whereIn('type', ['application/octet-stream', 'application/binary'])
                .select('id', 'filename_download', 'type');

            const fixed = [];
            const skipped = [];

            for (const file of files) {
                const videoMime = getVideoMimeType(file.filename_download);
                if (videoMime) {
                    await database('directus_files')
                        .where('id', file.id)
                        .update({ type: videoMime });

                    fixed.push({
                        id: file.id,
                        filename: file.filename_download,
                        oldType: file.type,
                        newType: videoMime,
                    });

                    logger.info(`[video-fix] Fixed MIME type for "${file.filename_download}": ${file.type} → ${videoMime}`);
                } else {
                    skipped.push({
                        id: file.id,
                        filename: file.filename_download,
                        type: file.type,
                    });
                }
            }

            res.json({
                success: true,
                message: `Fixed ${fixed.length} files, skipped ${skipped.length} non-video files`,
                fixed,
                skipped,
            });
        } catch (error) {
            logger.error('[video-fix] Error fixing MIME types:', error);
            res.status(500).json({
                error: 'Failed to fix MIME types',
                details: error.message,
            });
        }
    });

    // POST /video-fix/plain-to-json-webhook
    // Accepts text/plain and forwards as application/json to the flow trigger URL
    router.post('/plain-to-json-webhook', async (req, res) => {
        try {
            const body = req.body;
            const contentLength = Number(req.headers['content-length'] || 0);
            const contentType = String(req.headers['content-type'] || '').toLowerCase();
            let payload;

            if (isPlainObject(body) && !isEmptyPlainObject(body)) {
                // Preserve incoming JSON object payloads as-is.
                payload = body;
            } else if (typeof body === 'string') {
                payload = parseFromText(body);
            } else if (Array.isArray(body)) {
                payload = body;
            } else if (body == null || isEmptyPlainObject(body)) {
                const rawBody = contentLength > 0 || contentType.includes('text/plain')
                    ? await readRawBody(req)
                    : '';
                payload = parseFromText(rawBody);
            } else {
                payload = { text: String(body) };
            }

            const upstreamResponse = await fetch(FLOW_TRIGGER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responseText = await upstreamResponse.text();
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(responseText);
            } catch {
                parsedResponse = responseText;
            }

            return res.status(upstreamResponse.status).json({
                success: upstreamResponse.ok,
                forwardedTo: FLOW_TRIGGER_URL,
                sentPayload: payload,
                upstream: parsedResponse,
            });
        } catch (error) {
            logger.error('[video-fix] Error forwarding plain text webhook:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to forward plain text payload to webhook',
                details: error.message,
            });
        }
    });

    // GET /video-fix/status
    // Shows how many files have incorrect MIME types
    router.get('/status', async (req, res) => {
        try {
            if (!req.accountability || !req.accountability.admin) {
                return res.status(403).json({ error: 'Admin access required' });
            }

            const files = await database('directus_files')
                .whereIn('type', ['application/octet-stream', 'application/binary'])
                .select('id', 'filename_download', 'type');

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
                    suggestedType: getVideoMimeType(f.filename_download),
                })),
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
});
