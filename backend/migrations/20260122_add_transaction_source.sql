-- Add source field to transactions table to track whether transaction came from bank or manual upload
ALTER TABLE transactions ADD COLUMN source VARCHAR(50) DEFAULT 'manual';

-- Set existing TrueLayer transactions as 'bank' (they have ids starting with 'tl_')
UPDATE transactions SET source = 'bank' WHERE id LIKE 'tl_%';

-- Ensure all other transactions are marked as 'manual'
UPDATE transactions SET source = 'manual' WHERE source IS NULL;

-- Create index for filtering by source
CREATE INDEX idx_transactions_user_source ON transactions(user_id, source);
