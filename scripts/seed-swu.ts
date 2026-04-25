// Seed SWU cards from SWUAPI into the cards table
// Usage: npx tsx scripts/seed-swu.ts

import { createClient } from '@supabase/supabase-js'
import { fetchSwuapiBulk, swudbToRow } from '../api/_lib/swudb'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BATCH_SIZE = 500

async function seed() {
  console.log('Fetching SWU cards from SWUAPI...')
  const cards = await fetchSwuapiBulk()
  console.log(`Fetched ${cards.length} cards`)

  if (cards.length === 0) {
    console.error('No cards returned from SWUAPI')
    process.exit(1)
  }

  const rows = cards.map(swudbToRow)

  console.log(`Upserting ${rows.length} cards in batches of ${BATCH_SIZE}...`)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('cards')
      .upsert(batch as any, { onConflict: 'scryfall_id,game' })

    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error)
      process.exit(1)
    }
    console.log(
      `  Batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(rows.length / BATCH_SIZE)} done (${i + batch.length}/${rows.length})`
    )
  }

  console.log('Done!')
  const { count, error: countError } = await supabase
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .eq('game', 'swu')

  if (countError) {
    console.error('Count failed:', countError)
  } else {
    console.log(`Total SWU cards in DB: ${count}`)
  }
}

seed().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
