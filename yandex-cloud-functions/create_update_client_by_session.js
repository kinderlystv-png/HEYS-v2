require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected');

  const query = `
    CREATE OR REPLACE FUNCTION update_client_profile_by_session(p_session_token TEXT, p_name TEXT)
    RETURNS jsonb AS $$
    DECLARE
        v_client_id uuid;
    BEGIN
        -- Валидация сессии через стандартный helper (sha256 token_hash)
        v_client_id := public.require_client_id(p_session_token);

        UPDATE clients
        SET name = p_name, updated_at = NOW()
        WHERE id = v_client_id;
        
        RETURN jsonb_build_object('success', true, 'client_id', v_client_id);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;
  
                                                  on created');
  await client.end();
}

main().catch(console.error);
