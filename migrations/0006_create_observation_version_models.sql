-- Models assigned to each observation version
CREATE TABLE IF NOT EXISTS observation_version_models (
    observation_version_id TEXT NOT NULL REFERENCES observation_versions(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL REFERENCES models(id),
    PRIMARY KEY (observation_version_id, model_id)
);
