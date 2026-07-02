import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
