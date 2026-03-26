import { defineHook } from '@directus/extensions-sdk';

export default defineHook(({ action }, { services, database, logger, getSchema }) => {
    const { SettingsService } = services;

    // Update project name and hide UI elements via Custom CSS
    action('server.start', async () => {
        try {
            const schema = await getSchema();
            const settingsService = new SettingsService({
                schema,
                knex: database
            });

            const currentSettings = await settingsService.readSingleton();

            const targetProjectName = 'Dahua';
            const targetCustomCSS = `
/* ==========================================================
   DAHUA BRANDING & UI CLEANUP
   ========================================================== */

/* 1. Remove Directus version and bottom items (Reportar Error, Solicitar, Version) */
.sub-sidebar .v-list.subtle,
.version-label,
.v-list-item[href^="/admin/settings/report-issue"] { 
    display: none !important; 
}

/* 2. Hide specific sidebar items by link */
.v-list-item[href^="/admin/marketplace"],
.v-list-item[href^="/admin/settings/extensions"],
.v-list-item[href^="/admin/bookmarks"],
.v-list-item[href^="/admin/insights"],
.v-list-item[href^="/admin/settings/translations"],
.v-list-item[href^="/admin/settings/appearance"],
.v-list-item[href^="/admin/settings"] { 
    display: none !important; 
}

/* 3. Hide marketplace icon in header header if present */
header .v-icon[name="store"] { display: none !important; }

/* 4. Hide secondary version display and branding */
.v-footer, .directus-logo { display: none !important; }
`;

            if (currentSettings.project_name !== targetProjectName || currentSettings.custom_css !== targetCustomCSS) {
                logger.info('[branding-fix] Updating branding settings to "Dahua" and injecting UI cleanup CSS...');
                await settingsService.updateSingleton({
                    project_name: targetProjectName,
                    custom_css: targetCustomCSS
                });
                logger.info('[branding-fix] Branding settings updated successfully.');
            }
        } catch (error) {
            logger.error(`[branding-fix] Error updating settings: ${error.message}`);
        }
    });
});
