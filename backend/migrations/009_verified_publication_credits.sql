-- Backfill only content already stored as Published with complete verification
-- metadata. This restores missing award rows without changing existing credits.
INSERT INTO content_publications
  (id,workspace_id,content_id,platform_key,status,published_at,published_url,verified_by_user_id,verified_at,created_by_user_id)
SELECT UUID(),c.workspace_id,c.id,c.platform_key,'verified',c.actual_publish_at,c.published_url,NULL,c.verified_at,c.created_by_user_id
FROM content_plans c
JOIN workflow_stages s ON s.workspace_id=c.workspace_id AND s.id=c.stage_id AND s.stage_key='published'
WHERE c.actual_publish_at IS NOT NULL AND c.published_url IS NOT NULL AND c.verified_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM content_contributors cc WHERE cc.workspace_id=c.workspace_id AND cc.content_id=c.id AND cc.credit_weight>0)
  AND NOT EXISTS (SELECT 1 FROM content_publications p WHERE p.workspace_id=c.workspace_id AND p.content_id=c.id AND p.status='verified');

INSERT IGNORE INTO content_credits
  (id,workspace_id,content_id,user_id,publication_id,credits,status,awarded_by_user_id,awarded_at)
SELECT UUID(),c.workspace_id,c.id,cc.user_id,p.id,cc.credit_weight,'awarded',NULL,c.verified_at
FROM content_plans c
JOIN workflow_stages s ON s.workspace_id=c.workspace_id AND s.id=c.stage_id AND s.stage_key='published'
JOIN content_contributors cc ON cc.workspace_id=c.workspace_id AND cc.content_id=c.id AND cc.credit_weight>0
JOIN content_publications p ON p.workspace_id=c.workspace_id AND p.content_id=c.id AND p.status='verified'
WHERE c.actual_publish_at IS NOT NULL AND c.published_url IS NOT NULL AND c.verified_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM content_credits existing WHERE existing.workspace_id=c.workspace_id AND existing.content_id=c.id AND existing.user_id=cc.user_id);
