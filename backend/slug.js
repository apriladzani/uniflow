export function slugify(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
    .replace(/-+$/g, '');
  return slug || 'untitled';
}

export async function uniqueWorkspaceSlug(connection, name) {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [rows] = await connection.execute('SELECT id FROM workspaces WHERE slug=? LIMIT 1 FOR UPDATE', [candidate]);
    if (!rows.length) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export async function uniqueContentSlug(connection, workspaceId, name) {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const [rows] = await connection.execute('SELECT id FROM content_plans WHERE workspace_id=? AND slug=? LIMIT 1 FOR UPDATE', [workspaceId, candidate]);
    if (!rows.length) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}
