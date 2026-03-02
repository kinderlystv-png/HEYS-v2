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
        SELECT client_id INTO v_client_id FROM client_sessions WHERE session_token = p_session_token AND (expires_at IS NULL OR expires_at > NOW());
        IF v_client_id IS NULL THEN
            RAISE EXCEPTION 'Invalid or expired session token';
        END IF;

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
