CREATE TABLE IF NOT EXISTS merchant_category_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description_substring TEXT NOT NULL,
  category TEXT NOT NULL,
  UNIQUE(description_substring)
);
