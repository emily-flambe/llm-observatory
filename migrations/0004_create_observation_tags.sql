-- Many-to-many relationship between observations and tags
CREATE TABLE IF NOT EXISTS observation_tags (
    observation_id TEXT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (observation_id, tag_id)
);
