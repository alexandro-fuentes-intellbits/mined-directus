export default ({ action }, { database, logger }) => {
    // Update project name and hide UI elements via Custom CSS
    action('server.start', async () => {
        try {
            let hasCustomJsColumn = false;
            try {
                hasCustomJsColumn = await database.schema.hasColumn('directus_settings', 'custom_js');
            } catch (schemaError) {
                logger.warn(`[branding-fix] Could not verify custom_js column: ${schemaError.message}`);
            }

            const selectedFields = ['project_name', 'project_descriptor', 'custom_css'];
            if (hasCustomJsColumn) selectedFields.push('custom_js');

            const currentSettings = await database('directus_settings').first(...selectedFields);

            const targetProjectName = 'Dahua';
            // Zero-width space prevents Directus fallback title "Directus · {project}"
            const targetProjectDescriptor = '\u200B';
            const targetCustomCSS = `
/* ==========================================================
   DAHUA BRANDING & UI CLEANUP
   ========================================================== */

/* 1. Hide only version row (do NOT hide any Settings list container) */
a.v-list-item.link.version,
.v-list-item.link.version,
.v-list-item .v-text-overflow.version,
div.v-text-overflow.version,
.sub-sidebar a.v-list-item.link.version,
.sub-sidebar .v-list-item.link.version {
    display: none !important;
}

/* 1b. Hard fallback: hide any row that contains version text node */
.v-list-item:has(div.v-text-overflow.version),
a.v-list-item:has(div.v-text-overflow.version),
.sub-sidebar .v-list-item:has(div.v-text-overflow.version) {
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

/* 6. Hide only two Settings links: Reportar Error + Solicitar Característica */
a.v-list-item[href*="issues/new?template=bug_report.yml"],
a.v-list-item[href*="roadmap.directus.io"],
a.v-list-item.link[href*="directus/directus/issues/new"],
a.v-list-item.link[href*="template=bug_report"],
a.v-list-item.link[href*="roadmap.directus.io"],
.v-list-item.link[href*="directus/directus/issues/new"],
.v-list-item.link[href*="template=bug_report"],
.v-list-item.link[href*="roadmap.directus.io"] {
    display: none !important;
}
`;
            const targetCustomJS = `
(() => {
  const normalize = (s) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\\u0300-\\u036f]/g, '')
      .toLowerCase()
      .trim();

  const hideSupportLinks = () => {
    const labelsToHide = new Set([
      'reportar error',
      'solicitar caracteristicas',
      'solicitar caracteristica'
    ]);

    const labels = document.querySelectorAll('.v-list-item .v-text-overflow.label, .v-list-item .label .v-text-overflow');
    labels.forEach((label) => {
      const text = normalize(label.textContent);
      if (!labelsToHide.has(text)) return;

      const row = label.closest('a.v-list-item, .v-list-item');
      if (row) row.style.display = 'none';
    });
  };

  const stripTitlePrefix = () => {
    const current = document.title || '';
    const next = current.replace(/^\\s*Directus\\s*[·•\\-|:]\\s*/i, '').trim();
    if (next && next !== current) document.title = next;
  };

  const apply = () => {
    stripTitlePrefix();
    hideSupportLinks();
  };

  apply();
  window.addEventListener('load', apply);
  window.addEventListener('hashchange', apply);
  window.addEventListener('popstate', apply);

  const obs = new MutationObserver(apply);
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
`;

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
