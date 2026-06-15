export function createUserRepository({ pool }) {
  return {
    async create(client, user) {
      const executor = client ?? pool;
      const { rows } = await executor.query(
        `
          INSERT INTO users (
            id,
            tenant_id,
            owner_name,
            email,
            password_hash,
            role
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING
            id,
            tenant_id,
            owner_name,
            email,
            password_hash,
            role,
            created_at
        `,
        [user.id, user.tenantId, user.ownerName, user.email, user.passwordHash, user.role],
      );

      return mapUser(rows[0]);
    },

    async findById(id) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            tenant_id,
            owner_name,
            email,
            password_hash,
            role,
            created_at
          FROM users
          WHERE id = $1
        `,
        [id],
      );

      return rows[0] ? mapUser(rows[0]) : null;
    },

    async findByEmail(email) {
      const { rows } = await pool.query(
        `
          SELECT
            id,
            tenant_id,
            owner_name,
            email,
            password_hash,
            role,
            created_at
          FROM users
          WHERE email = $1
          ORDER BY created_at ASC
          LIMIT 1
        `,
        [email],
      );

      return rows[0] ? mapUser(rows[0]) : null;
    },
  };
}

function mapUser(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ownerName: row.owner_name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at?.toISOString?.() ?? row.created_at,
  };
}
