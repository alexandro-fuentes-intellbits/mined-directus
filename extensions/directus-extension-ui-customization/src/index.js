export default ({ action }, { database, logger }) => {
    // Update project name and hide UI elements via Custom CSS
    action('server.start', async () => {
        try {
            const currentSettings = await database('directus_settings')
                .first('project_name', 'project_descriptor', 'custom_css', 'custom_js');

            const targetProjectName = 'Dahua';
            // Zero-width space prevents Directus fallback title "Directus · {project}"
            const targetProjectDescriptor = '\u200B';
            const targetCustomCSS = `
/* ==========================================================
   DAHUA BRANDING & UI CLEANUP
   ========================================================== */

/* 1. Remove Directus version row only (keep Settings menus visible) */
.version-label,
.sub-sidebar [class*="version-label"],
.sub-sidebar .v-list-item:has(.version-label),
.sub-sidebar .v-list-item:has([class*="version-label"]),
.v-list-item[href^="/admin/settings/report-issue"] { 
    display: none !important; 
}

/* 1c. Exact selectors from current DOM */
a.v-list-item.link.version,
.v-list-item.link.version,
.v-list-item .v-text-overflow.version {
    display: none !important;
}

/* 2. Hide specific sidebar items by link */
.v-list-item[href^="/admin/content"],
.v-list-item[href^="/admin/marketplace"],
.v-list-item[href^="/admin/bookmarks"],
.v-list-item[href^="/admin/insights"] { 
    display: none !important; 
}

/* 2b. Hide main module icon for Content in left rail */
.module-bar a[href^="/admin/content"],
.module-nav a[href^="/admin/content"],
nav a[href^="/admin/content"][class*="module"],
nav .module[href*="/admin/content"],
nav [data-module="content"] {
    display: none !important;
}

/* 3. Hide marketplace icon in header header if present */
header .v-icon[name="store"] { display: none !important; }

/* 4. Hide secondary version display and branding */
.v-footer, .directus-logo { display: none !important; }

/* 5. Hide sidebar tooltip labels (e.g. "Contenido") */
[role="tooltip"],
.v-tooltip {
    display: none !important;
}
`;
            const targetCustomJS = `
(() => {
  const fixedTitle = 'Dahua';
  const apply = () => {
    if (document.title !== fixedTitle) document.title = fixedTitle;
  };

  apply();
  window.addEventListener('load', apply);
  window.addEventListener('hashchange', apply);
  window.addEventListener('popstate', apply);

  const obs = new MutationObserver(apply);
  obs.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(apply, 1000);
})();
`;

            let hasCustomJsColumn = false;
            try {
                hasCustomJsColumn = await database.schema.hasColumn('directus_settings', 'custom_js');
            } catch (schemaError) {
                logger.warn(`[branding-fix] Could not verify custom_js column: ${schemaError.message}`);
            }

            if (
                currentSettings.project_name !== targetProjectName ||
                currentSettings.project_descriptor !== targetProjectDescriptor ||
                currentSettings.custom_css !== targetCustomCSS ||
                (hasCustomJsColumn && currentSettings.custom_js !== targetCustomJS)
            ) {
                logger.info('[branding-fix] Updating branding settings (name/descriptor/css)...');
                const payload = {
                    project_name: targetProjectName,
                    project_descriptor: targetProjectDescriptor,
                    custom_css: targetCustomCSS
                };

                if (hasCustomJsColumn) {
                    payload.custom_js = targetCustomJS;
                }

                await database('directus_settings').update(payload);
                logger.info('[branding-fix] Branding settings updated successfully.');
            }
        } catch (error) {
            logger.error(`[branding-fix] Error updating settings: ${error.message}`);
        }
    });
};
