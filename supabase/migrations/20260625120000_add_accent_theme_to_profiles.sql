-- Add accent_theme preference column to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS accent_theme text DEFAULT 'blue'
    CHECK (accent_theme IN ('blue', 'pink', 'purple', 'green', 'red', 'brazil'));
