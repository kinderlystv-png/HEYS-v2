export default function handler(req, res) {
  res.status(200).json({
    hasUrl: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
    hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY),
    envKeys: Object.keys(process.env || {}).filter((k) => k.includes('SUPABASE')),
  })
}
