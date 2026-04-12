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
.v-list-item[href^="/admin/marketplace"],
.v-list-item[href^="/admin/bookmarks"],
.v-list-item[href^="/admin/insights"] { 
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

/* 6. Hide support links in settings sidebar */
a.v-list-item[href*="template=bug_report"],
a.v-list-item[href*="issues/new?template=bug_report.yml"],
a.v-list-item[href*="roadmap.directus.io"] {
    display: none !important;
}

`;
            const targetCustomJS = `
(() => {
  const fixedTitle = 'testeeee';
  const hiddenSupportLabels = [
    'reportar error',
    'solicitar caracteristicas',
    'solicitar característica',
    'solicitar características'
  ];
  const normalizeText = (value) =>
    (value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const forceTitle = () => {
    const titleNode = document.querySelector('title');
    if (titleNode && titleNode.textContent !== fixedTitle) {
      titleNode.textContent = fixedTitle;
    }
    if (document.title !== fixedTitle) {
      document.title = fixedTitle;
    }
  };

  const hardPatchTitleSetter = () => {
    const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'title');
    if (!descriptor || !descriptor.configurable) return;

    try {
      Object.defineProperty(document, 'title', {
        configurable: true,
        enumerable: true,
        get() {
          return fixedTitle;
        },
        set() {
          if (descriptor.set) descriptor.set.call(document, fixedTitle);
          const titleNode = document.querySelector('title');
          if (titleNode) titleNode.textContent = fixedTitle;
        }
      });
    } catch (_) {
      // Ignore if browser/runtime blocks redefining the property.
    }
  };

  const apply = () => {
    forceTitle();

    document.querySelectorAll('.v-list-item').forEach((item) => {
      const candidates = [
        item.querySelector('.v-text-overflow.label'),
        item.querySelector('.label .v-text-overflow'),
        item.querySelector('.type-label'),
        item.querySelector('.title'),
        item
      ];

      const matchesHiddenLabel = candidates.some((node) => {
        const text = normalizeText(node?.textContent);
        return text && hiddenSupportLabels.some((label) => text.includes(label));
      });

      if (matchesHiddenLabel) {
        item.style.display = 'none';
      }
    });
  };

  hardPatchTitleSetter();
  apply();
  window.addEventListener('load', apply);
  window.addEventListener('hashchange', apply);
  window.addEventListener('popstate', apply);
  window.setInterval(forceTitle, 250);

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
