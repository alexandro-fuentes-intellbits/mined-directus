FROM directus/directus:11.15.4

# The base image already has WORKDIR /directus and USER node
# We use root temporarily to ensure permissions if needed, but --chown is preferred
COPY --chown=node:node extensions/ ./extensions/
COPY --chown=node:node gcs.json ./gcs.json

# Expose the default port
EXPOSE 8055

# Ensure node user is used
USER node