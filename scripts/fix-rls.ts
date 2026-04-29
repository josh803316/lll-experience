import postgres from 'postgres';

const DIRECT_URL = process.env.DIRECT_URL;
if (!DIRECT_URL) {
  console.error('DIRECT_URL is required');
  process.exit(1);
}

const sql = postgres(DIRECT_URL);

async function fixRLS() {
  console.log('Enabling Row Level Security (RLS) on all public tables...');

  const tables = [
    'users',
    'apps',
    'draft_picks',
    'draftable_players',
    'draft_settings',
    'draft_mock_state',
    'official_draft_results',
    'pick_writeups',
    'draft_historical_winners',
    'chat_groups',
    'chat_group_members',
    'chat_messages',
    'chat_message_reactions',
    'experts',
    'expert_rankings',
    'expert_team_grades',
    'team_draft_analysis',
    'player_performance_ratings',
    'expert_accuracy_scores',
    'draft_timeline_events',
  ];

  try {
    for (const table of tables) {
      console.log(`Enabling RLS for ${table}...`);
      await sql`ALTER TABLE ${sql(table)} ENABLE ROW LEVEL SECURITY;`;
    }
    console.log('All tables secured with RLS.');
  } catch (err) {
    console.error('Error enabling RLS:', err);
  } finally {
    await sql.end();
  }
}

fixRLS();
